// ============================================================
// game.js — main orchestrator (Cyberbeast Edition v4)
//
// Features added in v4:
//   - 3 AI rival Cybertrucks on a start grid (chase AI, collision, position HUD)
//   - Best-lap ghost replay (translucent cyan Cybertruck following your best lap)
//   - Day/night cycle (animate sky shader uniforms + sun + lamp on/off)
//   - Boost pads on the straights (orange chevrons, temporary maxSpeed boost)
// ============================================================
import * as THREE from 'three';
import { Input } from './input.js';
import { City, TRACK } from './city.js';
import { Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { EngineAudio } from './audio.js';
import { Race, formatTime, TOTAL_LAPS } from './race.js';
import { Rivals } from './rivals.js';
import { Ghost } from './ghost.js';
import { BoostPads } from './boostpads.js';

// Day/night cycle: 4 keyframes — dawn, noon, dusk, midnight
const TOD_KEYFRAMES = [
  { t: 0.00, name: 'DAWN',  icon: '🌅',
    top: 0xffa080, mid: 0xffd2a0, bot: 0xf0c0a0,
    sun: 0xffd2a0, sunI: 0.7, hemiSky: 0xffcfa0, hemiGround: 0xc8a878, hemiI: 0.5,
    fog: 0xf0c8a8, lampOn: false },
  { t: 0.25, name: 'DAY',   icon: '☀',
    top: 0x2a6fc4, mid: 0x9ec8e8, bot: 0xf0e0c0,
    sun: 0xfff2d6, sunI: 1.6, hemiSky: 0xc8e0ff, hemiGround: 0xc8a878, hemiI: 0.55,
    fog: 0xc8d8e0, lampOn: false },
  { t: 0.50, name: 'DUSK',  icon: '🌆',
    top: 0x404080, mid: 0xff7040, bot: 0xffa050,
    sun: 0xff8040, sunI: 1.0, hemiSky: 0xffa070, hemiGround: 0x805040, hemiI: 0.5,
    fog: 0xffa070, lampOn: false },
  { t: 0.75, name: 'NIGHT', icon: '🌙',
    top: 0x05081a, mid: 0x0a1438, bot: 0x102040,
    sun: 0x6080ff, sunI: 0.3, hemiSky: 0x202040, hemiGround: 0x101020, hemiI: 0.25,
    fog: 0x0a1438, lampOn: true },
];

const TOD_CYCLE_SECONDS = 180;   // full day-night cycle takes 3 minutes

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
    this.started = false;
    this.modelsLoaded = false;
    this._cKeyHeld = false;
    this.sky = null;
    this.sun = null;
    this.hemi = null;
    this.fill = null;

    // v4 features
    this.rivals = null;
    this.ghost = null;
    this.boostPads = null;
    this.tod = 0.25;   // start at "DAY"
    this.todSpeed = 1; // 1 = normal cycle speed
  }

  async init(onProgress) {
    // ===== Scene =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0xc8d8e0, 60, 220);

    // ===== Camera =====
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 800);
    this.camera.position.set(0, 30, -30);
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
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ===== Lights — created here, intensity updated by day/night =====
    this.hemi = new THREE.HemisphereLight(0xc8e0ff, 0xc8a878, 0.55);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
    this.sun.position.set(80, 120, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -180;
    this.sun.shadow.camera.right = 180;
    this.sun.shadow.camera.top = 180;
    this.sun.shadow.camera.bottom = -180;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0xffd2a0, 0.25);
    this.fill.position.set(-60, 30, -40);
    this.scene.add(this.fill);

    // Moon (for night — a soft blue directional from the opposite side)
    this.moon = new THREE.DirectionalLight(0x6080ff, 0);
    this.moon.position.set(-80, 100, -40);
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    // ===== Sky (clean gradient shader) =====
    this._buildSky();

    // ===== City =====
    this.city = new City(this.scene);
    await this.city.loadAll((pct, status) => onProgress && onProgress(pct, status));

    // ===== Player =====
    this.player = new Player(this.scene);
    await this.player.load();
    if (onProgress) onProgress(100, 'Ready');

    // ===== Initialize v4 systems =====
    this.rivals = new Rivals(this.scene, this.city, this.player.body);
    this.ghost = new Ghost(this.scene, this.player.body);
    this.boostPads = new BoostPads(this.scene, this.city);
    this.boostPads.spawn();

    // ===== Player start position =====
    const startPos = this.city.trackPath[0].clone();
    this.player.reset(startPos, Math.PI / 2);

    // ===== Race =====
    this.race = new Race(this.city, this.player);
    document.getElementById('lap-total').textContent = TOTAL_LAPS;
    document.getElementById('cp-total').textContent = this.race.checkpointCount();
    document.getElementById('position-total').textContent = '4';   // player + 3 rivals
    this._refreshBestTime();
    this._refreshGhostBadge();

    // ===== Camera =====
    this.cam = new ChaseCamera(this.camera);
    const fwd = this.player.getForward();
    this.cam.curPos.copy(this.player.pos).addScaledVector(fwd, -10).add(new THREE.Vector3(0, 5, 0));
    this.cam.curLook.copy(this.player.pos).add(new THREE.Vector3(0, 1.2, 0));

    window.addEventListener('resize', () => this._onResize());

    this.modelsLoaded = true;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        topColor:    { value: new THREE.Color(0x2a6fc4) },
        midColor:    { value: new THREE.Color(0x9ec8e8) },
        bottomColor: { value: new THREE.Color(0xf0e0c0) },
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
            col = mix(midColor, bottomColor, smoothstep(0.0, -0.25, h));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    // Cloud puffs
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, fog: false });
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const r = 200 + Math.random() * 80;
      const h = 80 + Math.random() * 40;
      for (let j = 0; j < 6; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 4, 12, 8), cloudMat);
        puff.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 24);
        cloud.add(puff);
      }
      cloud.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  startRace() {
    this.started = true;
    const startPos = this.city.trackPath[0].clone();
    this.player.reset(startPos, Math.PI / 2);

    // Spawn AI rivals
    this.rivals.reset();
    this.rivals.spawn(startPos, Math.PI / 2);

    // Start boost pads (already spawned in init, but reset their state)
    this.boostPads.active = false;
    this.boostPads.activeTimer = 0;

    // Start ghost playback if we have a best lap recording
    if (this.ghost.hasGhost()) {
      this.ghost.startPlayback();
    }
    // Start recording this race's laps
    this.ghost.recording = null;

    this.race.start();
    document.getElementById('hud').classList.add('active');
    document.getElementById('cp-current').textContent = '1';
    document.getElementById('position-current').textContent = '1';
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      document.getElementById('touch').classList.add('active');
    }
    this._showBanner('GO!', 'Race started', 1500);
    this.audio.resume();

    // Start ghost recording at race start
    this.ghost.startRecording(performance.now());
  }

  _onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _showBanner(title, sub = '', dur = 1500, tag = '') {
    const el = document.getElementById('banner');
    document.getElementById('banner-title').textContent = title;
    document.getElementById('banner-sub').textContent = sub;
    document.getElementById('banner-tag').textContent = tag;
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

  _refreshGhostBadge() {
    const badge = document.getElementById('ghost-badge');
    if (this.ghost && this.ghost.hasGhost()) {
      badge.classList.add('active');
      badge.textContent = '👻 GHOST READY';
    } else {
      badge.classList.remove('active');
    }
  }

  // ===== Day/night cycle =====
  _updateTimeOfDay(dt) {
    // Advance time
    this.tod = (this.tod + (dt / TOD_CYCLE_SECONDS) * this.todSpeed) % 1;

    // Find the two keyframes to interpolate between
    let kfA = TOD_KEYFRAMES[0], kfB = TOD_KEYFRAMES[1];
    for (let i = 0; i < TOD_KEYFRAMES.length; i++) {
      const a = TOD_KEYFRAMES[i];
      const b = TOD_KEYFRAMES[(i + 1) % TOD_KEYFRAMES.length];
      const tB = (i + 1) / TOD_KEYFRAMES.length;
      const tA = i / TOD_KEYFRAMES.length;
      if (this.tod >= tA && this.tod < tB) {
        kfA = a; kfB = b;
        break;
      }
    }
    // Interpolation factor
    const tA = kfA.t;
    const tB = kfB.t < tA ? kfB.t + 1 : kfB.t;
    const f = (this.tod - tA) / (tB - tA);
    const lerpColor = (a, b, f) => {
      const ca = new THREE.Color(a), cb = new THREE.Color(b);
      return ca.lerp(cb, f);
    };

    // Update sky shader uniforms
    this.sky.material.uniforms.topColor.value = lerpColor(kfA.top, kfB.top, f);
    this.sky.material.uniforms.midColor.value = lerpColor(kfA.mid, kfB.mid, f);
    this.sky.material.uniforms.bottomColor.value = lerpColor(kfA.bot, kfB.bot, f);

    // Update scene background + fog
    const fogColor = lerpColor(kfA.fog, kfB.fog, f);
    this.scene.background = fogColor;
    this.scene.fog.color = fogColor;
    // Adjust fog distance at night (closer, so it feels more closed-in)
    const isNight = this.tod > 0.65 || this.tod < 0.1;
    this.scene.fog.far = isNight ? 160 : 220;

    // Update lights
    this.sun.color = lerpColor(kfA.sun, kfB.sun, f);
    this.sun.intensity = THREE.MathUtils.lerp(kfA.sunI, kfB.sunI, f);
    this.hemi.color = lerpColor(kfA.hemiSky, kfB.hemiSky, f);
    this.hemi.groundColor = lerpColor(kfA.hemiGround, kfB.hemiGround, f);
    this.hemi.intensity = THREE.MathUtils.lerp(kfA.hemiI, kfB.hemiI, f);

    // Sun position: rises at dawn, sets at dusk, opposite at midnight
    const sunAngle = (this.tod - 0.25) * Math.PI * 2;   // 0 at noon (tod=0.25), π at midnight
    const sunY = Math.cos(sunAngle) * 120;
    const sunX = Math.sin(sunAngle) * 100;
    if (this.player) {
      this.sun.position.set(this.player.pos.x + sunX, Math.max(20, sunY), this.player.pos.z + 40);
      this.sun.target.position.set(this.player.pos.x, 0, this.player.pos.z);
      this.sun.target.updateMatrixWorld();
    }
    // Sun visibility (off at night)
    this.sun.visible = sunY > 0;

    // Moon: opposite phase
    this.moon.intensity = isNight ? 0.4 : 0;
    if (this.player) {
      this.moon.position.set(this.player.pos.x - sunX, Math.max(20, -sunY), this.player.pos.z - 40);
      this.moon.target.position.set(this.player.pos.x, 0, this.player.pos.z);
      this.moon.target.updateMatrixWorld();
    }

    // Toggle street lamps
    const lampOn = (this.tod > 0.6 || this.tod < 0.12);
    if (this.city && this.city.lamps) {
      for (const lamp of this.city.lamps) {
        lamp.children.forEach(c => {
          if (c.isPointLight) c.intensity = lampOn ? 1.2 : 0.05;
        });
      }
    }

    // Update HUD indicator
    const labelEl = document.getElementById('tod-label');
    const iconEl = document.getElementById('tod-icon');
    // Find nearest keyframe name/icon
    let nearest = TOD_KEYFRAMES[0], minDist = 1;
    for (const kf of TOD_KEYFRAMES) {
      const d = Math.min(Math.abs(this.tod - kf.t), 1 - Math.abs(this.tod - kf.t));
      if (d < minDist) { minDist = d; nearest = kf; }
    }
    labelEl.textContent = nearest.name;
    iconEl.textContent = nearest.icon;
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();

    // Camera mode toggle (edge-triggered)
    if (this.input.camera && !this._cKeyHeld && this.cam) {
      this._cKeyHeld = true;
      const mode = this.cam.cycle();
      this._showBanner(mode.toUpperCase(), 'Camera', 900);
    }
    if (!this.input.camera) this._cKeyHeld = false;

    // Day/night cycle runs always
    this._updateTimeOfDay(dt);

    if (this.started && !this.race.finished) {
      // ===== Update boost pads =====
      const boosted = this.boostPads.update(dt, t, this.player.pos, this.player.speed);

      // ===== Update player (with boost multiplier) =====
      this.player.update(dt, this.input, this.boostPads.getSpeedMultiplier());

      // ===== Collision: buildings + barriers =====
      const col = this.city.resolveCollision(this.player.pos, 2.0);
      if (col.hit) {
        this.player.speed *= 0.6;
      }

      // ===== World bounds =====
      if (this.city.clampToTrack(this.player.pos)) {
        this.player.speed *= 0.5;
      }

      // ===== Update AI rivals =====
      const rivalHit = this.rivals.update(dt, this.player.pos, 2.0);
      if (rivalHit) {
        this.player.speed *= 0.8;
        this.audio.chime(220, 0.08);  // bump sound
      }

      // ===== Re-apply position after all collisions =====
      this.player.mesh.position.copy(this.player.pos);

      // ===== Camera =====
      this.cam.update(dt, this.player);

      // ===== Race =====
      const event = this.race.tick(now);
      if (event === 'checkpoint') {
        this.audio.chime(880, 0.12);
        document.getElementById('cp-current').textContent = this.race.nextCp + 1;
      } else if (event === 'lap') {
        this.audio.chime(1320, 0.2);
        const last = this.race.lapTimes[this.race.lapTimes.length - 1];
        document.getElementById('lap-time-last').textContent = formatTime(last);
        if (this.race.bestLap === 0 || last < this.race.bestLap) {
          this.race.bestLap = last;
          localStorage.setItem('lagos-drift-best', String(last));
        }
        // Save ghost recording if this lap was the new best
        const wasNewGhost = this.ghost.finishLap(last);
        if (wasNewGhost) {
          this._showBanner('NEW BEST LAP!', '👻 Ghost updated', 2000);
        }
        // Restart ghost recording for next lap
        this.ghost.startRecording(now);

        document.getElementById('lap-time-best').textContent = 'Best: ' + formatTime(this.race.bestLap);
        document.getElementById('lap-current').textContent = this.race.currentLap;
        document.getElementById('cp-current').textContent = 1;
        this._showBanner(`LAP ${this.race.currentLap}`, `Last: ${formatTime(last)}`, 1800, 'Lap Complete');
        this._refreshBestTime();
      } else if (event === 'finish') {
        this._showRaceEnd();
      }

      // ===== Ghost: record + update playback =====
      this.ghost.record(now, this.player.pos, this.player.heading);
      this.ghost.update(dt);

      // ===== HUD updates =====
      this._updateHUD(now);
      this._updateCheckpointArrow();
      this._updateBoostUI();
      this._drawMinimap();

      this.audio.update(this.player.getSpeedFactor(), this.player.driftAmount);
    } else {
      // Pre-race cinematic: orbit camera around the start area
      const a = t * 0.15;
      const center = this.city.trackPath[0];
      this.camera.position.set(
        center.x + Math.cos(a) * 25,
        12,
        center.z + Math.sin(a) * 25
      );
      this.camera.lookAt(center.x, 1, center.z);

      // Still update ghost (so it plays during the menu if a recording exists)
      this.ghost.update(dt);
    }

    this.city.update(dt, t);

    // Move clouds slowly with the camera
    if (this.clouds && this.player) {
      for (const c of this.clouds) {
        c.position.x += this.player.pos.x * 0.001;
        c.position.z += this.player.pos.z * 0.001;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updateHUD(now) {
    document.getElementById('speed').textContent = Math.round(this.player.getSpeedKmh());
    const gear = this.player.speed < -0.5 ? 'R' :
                 this.player.speed > 0.5 ? 'D' : 'N';
    const rpm = Math.round(800 + this.player.getSpeedFactor() * 6200);
    document.getElementById('gear-display').textContent = `${gear} · ${rpm} RPM`;
    document.getElementById('lap-time-current').textContent = formatTime(this.race.currentLapTime(now));
    const driftText = this.player.driftAmount > 0.3
      ? `🔥 DRIFT ${Math.round(this.player.driftAmount * 100)}`
      : 'DRIFT 0';
    document.getElementById('drift-display').textContent = driftText;

    // Rival position
    if (this.rivals && this.rivals.enabled) {
      const trackLen = this.rivals._trackLength();
      const playerD = this.rivals._nearestD(this.player.pos);
      const pos = this.rivals.getPlayerPosition(playerD, this.race.currentLap - 1);
      document.getElementById('position-current').textContent = pos;
    }
  }

  _updateBoostUI() {
    const bar = document.getElementById('boost-bar');
    const fill = document.getElementById('boost-bar-fill');
    const label = document.getElementById('boost-label');
    if (this.boostPads.isActive()) {
      bar.classList.add('active');
      label.classList.add('active');
      const remaining = this.boostPads.remainingTime();
      const pct = (remaining / 2.5) * 100;  // 2.5s = full
      fill.style.width = pct + '%';
    } else {
      bar.classList.remove('active');
      label.classList.remove('active');
    }
  }

  _updateCheckpointArrow() {
    const cp = this.city.checkpoints[this.race.nextCp];
    if (!cp) return;
    const dx = cp.x - this.player.pos.x;
    const dz = cp.z - this.player.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const worldAngle = Math.atan2(dx, dz);
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

    const margin = 60;
    const span = Math.max(
      (TRACK.bboxMaxX - TRACK.bboxMinX) + margin * 2,
      (TRACK.bboxMaxZ - TRACK.bboxMinZ) + margin * 2
    );
    const cx = (TRACK.bboxMinX + TRACK.bboxMaxX) / 2;
    const cz = (TRACK.bboxMinZ + TRACK.bboxMaxZ) / 2;
    const worldToMap = (x, z) => ({
      x: ((x - cx) / span + 0.5) * W,
      y: ((z - cz) / span + 0.5) * H,
    });

    // Background
    ctx.fillStyle = 'rgba(20, 30, 50, 0.5)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Track outline
    ctx.strokeStyle = 'rgba(60, 60, 70, 0.7)';
    ctx.lineWidth = Math.max(8, (TRACK.roadWidth / span) * W);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= this.city.trackPath.length; i++) {
      const tp = this.city.trackPath[i % this.city.trackPath.length];
      const p = worldToMap(tp.x, tp.z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Centerline
    ctx.strokeStyle = 'rgba(244, 211, 94, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i <= this.city.trackPath.length; i++) {
      const tp = this.city.trackPath[i % this.city.trackPath.length];
      const p = worldToMap(tp.x, tp.z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Boost pads
    if (this.boostPads && this.boostPads.enabled) {
      for (const pad of this.boostPads.pads) {
        const p = worldToMap(pad.x, pad.z);
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Checkpoints
    this.city.checkpoints.forEach((cp, i) => {
      const p = worldToMap(cp.x, cp.z);
      const isNext = i === this.race.nextCp;
      ctx.fillStyle = isNext ? '#00ff88' : '#ffd23f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, isNext ? 10 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (isNext) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Rivals
    if (this.rivals) this.rivals.drawOnMinimap(ctx, worldToMap);

    // Ghost (cyan dot)
    if (this.ghost && this.ghost.mesh && this.ghost.mesh.visible) {
      const p = worldToMap(this.ghost.mesh.position.x, this.ghost.mesh.position.z);
      ctx.fillStyle = '#05d9e8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#05d9e8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player (orange triangle)
    if (this.player) {
      const p = worldToMap(this.player.pos.x, this.player.pos.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-this.player.heading);
      ctx.fillStyle = '#ff6b35';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-6, 7);
      ctx.lineTo(6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _showRaceEnd() {
    document.getElementById('hud').classList.remove('active');
    document.getElementById('touch').classList.remove('active');
    document.getElementById('cp-arrow').style.display = 'none';
    document.getElementById('cp-distance').style.display = 'none';
    document.getElementById('boost-bar').classList.remove('active');
    document.getElementById('boost-label').classList.remove('active');
    this.audio.stop();
    this.ghost.stopPlayback();

    const titleEl = document.getElementById('end-title');
    const listEl = document.getElementById('lap-list');
    listEl.innerHTML = '';

    // Show final position
    let finalPos = 1;
    if (this.rivals && this.rivals.enabled) {
      const trackLen = this.rivals._trackLength();
      const playerD = this.rivals._nearestD(this.player.pos);
      finalPos = this.rivals.getPlayerPosition(playerD, TOTAL_LAPS);
    }

    titleEl.textContent = finalPos === 1 ? '🏆 You Won!' : `Finished ${finalPos === 2 ? '2nd' : finalPos === 3 ? '3rd' : '4th'}`;

    // Player lap times
    let bestIdx = 0;
    let best = Infinity;
    this.race.lapTimes.forEach((t, i) => { if (t < best) { best = t; bestIdx = i; } });
    this.race.lapTimes.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'lap-row' + (i === bestIdx ? ' best' : '');
      row.innerHTML = `<span class="lap-name">LAP ${i + 1}</span><span class="lap-time">${formatTime(t)}</span>`;
      listEl.appendChild(row);
    });
    const total = this.race.lapTimes.reduce((s, t) => s + t, 0);
    const summaryRow = document.createElement('div');
    summaryRow.className = 'lap-row best';
    summaryRow.innerHTML = `<span class="lap-name">TOTAL</span><span class="lap-time">${formatTime(total)}</span>`;
    listEl.appendChild(summaryRow);

    document.getElementById('end').classList.add('active');
  }
}
