// ============================================================
// game.js — main orchestrator.
// Sets up Three.js scene, lights, sky, render loop, HUD bindings,
// race flow, and per-frame updates.
// ============================================================
import * as THREE from 'three';
import { Input } from './input.js';
import { City, CITY_HALF } from './city.js';
import { Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { EngineAudio } from './audio.js';
import { Race, formatTime, TOTAL_LAPS } from './race.js';

export class Game {
  constructor() {
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.input = new Input();
    this.city = null;
    this.player = null;
    this.cam = null;
    this.audio = new EngineAudio();
    this.race = null;
    this.clock = new THREE.Clock();
    this.started = false;       // has race started?
    this.modelsLoaded = false;
    this._cKeyHeld = false;
    this._lastCpHit = 0;
  }

  async init(onProgress) {
    // ===== Scene =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0xbcd8e8, 80, 280);

    // ===== Camera =====
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 30, 50);
    this.camera.lookAt(0, 0, 0);

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

    // ===== Lights: Lagos daytime — warm sun + sky bounce =====
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0xb8a878, 0.65);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5d6, 1.4);
    sun.position.set(60, 100, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.sun = sun;

    // Subtle warm fill from the opposite side
    const fill = new THREE.DirectionalLight(0xffd2a0, 0.2);
    fill.position.set(-50, 30, -20);
    this.scene.add(fill);

    // ===== Sky dome =====
    this._buildSky();

    // ===== City + player =====
    this.city = new City(this.scene);
    await this.city.loadAll((pct, status) => onProgress && onProgress(pct, status));

    this.player = new Player(this.scene);
    await this.player.load();

    // Place player at start — first checkpoint is to the east of center
    this.player.reset(new THREE.Vector3(0, 0, 0), 0);

    // ===== Race =====
    this.race = new Race(this.city, this.player);
    document.getElementById('lap-total').textContent = TOTAL_LAPS;
    document.getElementById('cp-total').textContent = this.race.checkpointCount();
    this._refreshBestTime();

    // ===== Camera =====
    this.cam = new ChaseCamera(this.camera);
    this.cam.update(0.016, this.player);

    // ===== Resize =====
    window.addEventListener('resize', () => this._onResize());

    this.modelsLoaded = true;
    // Start render loop
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildSky() {
    // Gradient sky dome — blue at top, lighter at horizon
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        topColor:    { value: new THREE.Color(0x1a8fe3) },
        midColor:    { value: new THREE.Color(0x87ceeb) },
        bottomColor: { value: new THREE.Color(0xd8e8f0) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col;
          if (h > 0.0) {
            col = mix(midColor, topColor, smoothstep(0.0, 0.6, h));
          } else {
            col = mix(midColor, bottomColor, smoothstep(0.0, -0.3, h));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    // A sun disc
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(20, 32),
      new THREE.MeshBasicMaterial({ color: 0xffeac0, fog: false, transparent: true, opacity: 0.95 })
    );
    sunDisc.position.set(180, 120, 60);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);

    // A few fluffy clouds
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const a = Math.random() * Math.PI * 2;
      const r = 200 + Math.random() * 100;
      const h = 60 + Math.random() * 60;
      for (let j = 0; j < 5; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 4, 12, 8), cloudMat);
        puff.position.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 20);
        cloud.add(puff);
      }
      cloud.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      this.scene.add(cloud);
    }
  }

  startRace() {
    this.started = true;
    this.player.reset(new THREE.Vector3(0, 0, 0), 0);
    this.race.start();
    document.getElementById('hud').classList.add('active');
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      document.getElementById('touch').classList.add('active');
    }
    this._showBanner('GO!', 'Race started', 1500);
    this.audio.resume();
  }

  _onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _showBanner(title, sub, dur = 1500, tag = '') {
    const el = document.getElementById('banner');
    document.getElementById('banner-title').textContent = title;
    document.getElementById('banner-sub').textContent = sub || '';
    document.getElementById('banner-tag').textContent = tag || '';
    el.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => el.classList.remove('show'), dur);
  }

  _refreshBestTime() {
    const el = document.getElementById('best-time-display');
    const v = document.getElementById('best-time-value');
    if (this.race && this.race.bestLap > 0) {
      el.style.display = 'block';
      v.textContent = formatTime(this.race.bestLap);
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();

    // Camera mode toggle (edge-triggered)
    if (this.input.camera && !this._cKeyHeld) {
      this._cKeyHeld = true;
      const mode = this.cam.cycle();
      this._showBanner(mode.toUpperCase(), 'Camera mode', 1000);
    }
    if (!this.input.camera) this._cKeyHeld = false;

    if (this.started && !this.race.finished) {
      this.player.update(dt, this.input);

      // Collision
      if (this.city.resolveCollision(this.player.pos, 1.6)) {
        this.player.speed *= 0.7;  // bleed speed on hit
      }

      // Re-apply position after collision
      this.player.mesh.position.copy(this.player.pos);

      this.cam.update(dt, this.player);

      // Race
      const event = this.race.tick(now);
      if (event === 'checkpoint') {
        this.audio.chime(880, 0.12);
        document.getElementById('cp-current').textContent = this.race.nextCp + 1;
        if (this.race.nextCp === 0) {
          // About to start lap 2+
          document.getElementById('cp-current').textContent = this.race.checkpointCount();
        }
      } else if (event === 'lap') {
        this.audio.chime(1320, 0.2);
        const last = this.race.lapTimes[this.race.lapTimes.length - 1];
        document.getElementById('lap-time-last').textContent = formatTime(last);
        if (this.race.bestLap === 0 || last < this.race.bestLap) {
          this.race.bestLap = last;
          localStorage.setItem('lagos-drift-best', String(last));
        }
        document.getElementById('lap-time-best').textContent = 'Best: ' + formatTime(this.race.bestLap);
        document.getElementById('lap-current').textContent = this.race.currentLap;
        document.getElementById('cp-current').textContent = 1;
        this._showBanner(`LAP ${this.race.currentLap}`, `Last: ${formatTime(last)}`, 1800, 'Lap Complete');
        this._refreshBestTime();
      } else if (event === 'finish') {
        this._showRaceEnd();
      }

      // HUD updates
      this._updateHUD(now);
      this._updateCheckpointArrow();
      this._drawMinimap();

      // Audio
      this.audio.update(this.player.getSpeedFactor(), this.player.driftAmount);
    } else {
      // Pre-race: orbit camera around the start area
      const a = t * 0.2;
      this.camera.position.set(Math.cos(a) * 40, 15, Math.sin(a) * 40);
      this.camera.lookAt(0, 1, 0);
    }

    this.city.update(dt, t);

    // Sun follows camera for shadow quality
    this.sun.position.set(
      this.camera.position.x + 60, 100, this.camera.position.z + 30
    );
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
  }

  _updateHUD(now) {
    document.getElementById('speed').textContent = Math.round(this.player.getSpeedKmh());
    const gear = this.player.speed < -0.5 ? 'R' :
                 this.player.speed > 0.5 ? 'D' : 'N';
    const rpm = Math.round(800 + this.player.getSpeedFactor() * 6200);
    document.getElementById('gear-display').textContent = `${gear} · ${rpm} RPM`;
    document.getElementById('lap-time-current').textContent = formatTime(this.race.currentLapTime(now));
    document.getElementById('drift-display').textContent =
      this.player.driftAmount > 0.3 ? `🔥 DRIFT ${Math.round(this.player.driftAmount * 100)}` : 'DRIFT 0';
  }

  _updateCheckpointArrow() {
    const cp = this.city.checkpoints[this.race.nextCp];
    if (!cp) return;
    const dx = cp.x - this.player.pos.x;
    const dz = cp.z - this.player.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Position arrow at screen center, rotated to point at checkpoint
    // Compute angle in screen space — we want the angle of the checkpoint relative to player heading
    const worldAngle = Math.atan2(dx, dz);    // angle from north (player forward direction matches if heading is 0)
    const relAngle = worldAngle - this.player.heading;

    const arrow = document.getElementById('cp-arrow');
    arrow.style.transform = `translate(-50%, -50%) rotate(${relAngle}rad)`;
    document.getElementById('cp-distance').textContent = `${Math.round(dist)} m`;
  }

  _drawMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const span = CITY_HALF * 2.4;
    const worldToMap = (x, z) => ({
      x: (x / span + 0.5) * W,
      y: (z / span + 0.5) * H,
    });

    // Background tint
    ctx.fillStyle = 'rgba(20, 40, 80, 0.4)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    ctx.fill();

    // Building blocks (small squares)
    ctx.fillStyle = 'rgba(180, 170, 130, 0.6)';
    for (const c of this.city.colliders) {
      const p = worldToMap(c.x, c.z);
      const s = (c.half * 2 / span) * W;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    // Checkpoints
    this.city.checkpoints.forEach((cp, i) => {
      const p = worldToMap(cp.x, cp.z);
      const isNext = i === this.race.nextCp;
      ctx.fillStyle = isNext ? '#00ff88' : '#ffd23f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, isNext ? 8 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (isNext) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Player as triangle pointing along heading
    if (this.player) {
      const p = worldToMap(this.player.pos.x, this.player.pos.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-this.player.heading);
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-5, 6);
      ctx.lineTo(5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  _showRaceEnd() {
    document.getElementById('hud').classList.remove('active');
    document.getElementById('touch').classList.remove('active');
    document.getElementById('cp-arrow').style.display = 'none';
    document.getElementById('cp-distance').style.display = 'none';
    this.audio.stop();

    const titleEl = document.getElementById('end-title');
    const listEl = document.getElementById('lap-list');
    listEl.innerHTML = '';
    let bestIdx = 0;
    let best = Infinity;
    this.race.lapTimes.forEach((t, i) => {
      if (t < best) { best = t; bestIdx = i; }
    });
    this.race.lapTimes.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'lap-row' + (i === bestIdx ? ' best' : '');
      row.innerHTML = `<span class="lap-name">LAP ${i + 1}</span><span class="lap-time">${formatTime(t)}</span>`;
      listEl.appendChild(row);
    });
    const overallBest = Math.min(...this.race.lapTimes);
    const total = this.race.lapTimes.reduce((s, t) => s + t, 0);
    titleEl.textContent = 'Race Complete';
    const summaryRow = document.createElement('div');
    summaryRow.className = 'lap-row best';
    summaryRow.innerHTML = `<span class="lap-name">TOTAL</span><span class="lap-time">${formatTime(total)}</span>`;
    listEl.appendChild(summaryRow);

    document.getElementById('end').classList.add('active');
  }
}
