// ============================================================
// game.js — main orchestrator: scene, lights, skybox, HUD,
// collision checks, mission loop, score, and the render loop.
// ============================================================
import * as THREE from 'three';
import { Input } from './input.js';
import { City, CITY_HALF, CITY_BLOCK, CITY_ROAD } from './city.js';
import { Player } from './player.js';
import { ChaseCamera } from './camera.js';

export class Game {
  constructor() {
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.input = new Input();
    this.city = null;
    this.player = null;
    this.cam = null;
    this.clock = new THREE.Clock();
    this.score = 0;
    this.coinsCollected = 0;
    this.running = false;
    this.carSpec = null;
    this.distance = 0;
    this._cKeyHeld = false;
  }

  init() {
    // ===== Scene =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050514);
    this.scene.fog = new THREE.FogExp2(0x050514, 0.008);

    // ===== Camera =====
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 20);

    // ===== Renderer =====
    const canvas = document.createElement('canvas');
    document.getElementById('app').appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ===== Lights =====
    const hemi = new THREE.HemisphereLight(0x6a6aff, 0x0a0a18, 0.55);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0xbcd2ff, 0.5);
    moon.position.set(40, 80, 20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -100;
    moon.shadow.camera.right = 100;
    moon.shadow.camera.top = 100;
    moon.shadow.camera.bottom = -100;
    moon.shadow.camera.far = 250;
    this.scene.add(moon);

    // City magenta ambient (helps the neon read even in shadow)
    const ambient = new THREE.AmbientLight(0x2a1a3a, 0.6);
    this.scene.add(ambient);

    // ===== Skybox: city-scene.jpg mapped onto a large sphere =====
    this._buildSky();

    // ===== City =====
    this.city = new City(this.scene);

    // ===== Resize =====
    window.addEventListener('resize', () => this._onResize());

    // ===== Start render loop (idle until player picks a car) =====
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildSky() {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/city-scene.jpg');
    tex.colorSpace = THREE.SRGBColorSpace;
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Stars (procedural points on the upper hemisphere)
    const starGeo = new THREE.BufferGeometry();
    const starCount = 800;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45; // upper half
      const r = 420;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);

    // A big moon disc for atmosphere
    const moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(20, 32),
      new THREE.MeshBasicMaterial({ color: 0xeef5ff, fog: false, transparent: true, opacity: 0.9 })
    );
    moonDisc.position.set(-120, 100, -200);
    moonDisc.lookAt(0, 0, 0);
    this.scene.add(moonDisc);
  }

  startWithCar(spec) {
    this.carSpec = spec;
    this.player = new Player(this.scene, spec);
    this.cam = new ChaseCamera(this.camera);

    // Activate HUD + controls hints + touch UI on mobile
    document.getElementById('hud').classList.add('active');
    document.getElementById('controls-hint').classList.add('active');
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      document.getElementById('touch').classList.add('active');
    }

    // Show mission banner briefly
    this._showMission('Free Drive', 'Collect all the coins!', 2500);

    // Update HUD totals
    document.getElementById('coins-total').textContent = this.city.coins.length;

    this.running = true;
  }

  _onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _showMission(title, sub, dur = 2000) {
    const el = document.getElementById('mission');
    document.getElementById('mission-title').textContent = title;
    document.getElementById('mission-tag').textContent = sub;
    el.classList.add('show');
    clearTimeout(this._mTimer);
    this._mTimer = setTimeout(() => el.classList.remove('show'), dur);
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // Camera mode toggle (edge-triggered)
    if (this.input.camera && !this._cKeyHeld && this.cam) {
      this._cKeyHeld = true;
      this.cam.cycle();
    }
    if (!this.input.camera) this._cKeyHeld = false;

    if (this.running) {
      this.player.update(dt, this.input);
      this.cam.update(dt, this.player);
      this.city.update(dt, t);
      this._checkCoins();
      this._updateHUD(dt);

      // Sky rotation (very slow)
      if (this.stars) this.stars.rotation.y += dt * 0.005;
    } else {
      // Idle cinematic: slowly orbit the city from above
      const a = t * 0.15;
      this.camera.position.set(Math.cos(a) * 70, 45, Math.sin(a) * 70);
      this.camera.lookAt(0, 0, 0);
      this.city.update(dt, t);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _checkCoins() {
    if (!this.player) return;
    const p = this.player.pos;
    for (const c of this.city.coins) {
      if (c.userData.collected) continue;
      const d = c.position.distanceTo(p);
      if (d < 2.2) {
        c.userData.collected = true;
        c.visible = false;
        this.coinsCollected++;
        this.score += 100;
        this._pulseScore();
        if (this.coinsCollected === this.city.coins.length) {
          this._showMission('ALL COINS COLLECTED', 'You cleared the city!', 4000);
        }
      }
    }
  }

  _updateHUD(dt = 0) {
    // Speed: convert m/s -> km/h (cosmetic)
    const kmh = Math.abs(this.player.speed) * 3.6;
    document.getElementById('speed').textContent = Math.round(kmh);
    document.getElementById('score').textContent = this.score;
    document.getElementById('coins').textContent = this.coinsCollected;

    // Gear: rough auto-shift
    let gear = 'N';
    if (this.player.speed < -0.5) gear = 'R';
    else if (this.player.speed > 0.5) {
      gear = Math.min(6, Math.floor(this.player.speed / (this.player.spec.maxSpeed / 6)) + 1);
    }
    document.getElementById('gear').textContent = gear;
    document.getElementById('rpm').textContent = Math.round(1500 + Math.abs(this.player.speed) * 70) + ' RPM';

    // Distance
    this.distance += Math.abs(this.player.speed) * dt;
    document.getElementById('distance').textContent = Math.round(this.distance) + ' m driven';

    // Minimap
    this._drawMinimap();
  }

  _pulseScore() {
    const el = document.getElementById('score');
    el.style.transition = 'transform 0.15s, color 0.15s';
    el.style.transform = 'scale(1.4)';
    el.style.color = '#fff15c';
    setTimeout(() => {
      el.style.transform = 'scale(1)';
      el.style.color = '#fff';
    }, 150);
  }

  _drawMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(5,217,232,0.4)';
    ctx.lineWidth = 1;
    const span = CITY_HALF * 2;
    const blocks = 7;
    const cell = W / blocks;
    for (let i = 0; i <= blocks; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, H);
      ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell);
      ctx.stroke();
    }

    // Center dot
    ctx.fillStyle = 'rgba(5,217,232,0.2)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 18, 0, Math.PI * 2);
    ctx.fill();

    // Coins
    ctx.fillStyle = '#fff15c';
    for (const c of this.city.coins) {
      if (c.userData.collected) continue;
      const x = (c.position.x / span + 0.5) * W;
      const y = (c.position.z / span + 0.5) * H;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    // Player as a triangle pointing along heading
    if (this.player) {
      const x = (this.player.pos.x / span + 0.5) * W;
      const y = (this.player.pos.z / span + 0.5) * H;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-this.player.heading);
      ctx.fillStyle = '#ff2a6d';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-3, 4);
      ctx.lineTo(3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
