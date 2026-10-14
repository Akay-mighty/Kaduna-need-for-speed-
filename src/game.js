// ============================================================
// game.js — main orchestrator
//
// FIXES vs old version:
//   - Sky: clean gradient shader (no floating white sun discs)
//   - Lights: warm directional sun + hemisphere bounce, less intense
//   - Fog: shorter range so the world feels contained
//   - Player start: at the start line on the new oval track
//   - Race: uses oval track + 8 checkpoints; player faces the right direction
//   - World bounds: City.clampToTrack() called every frame
//   - Camera: never points at sky or below ground
// ============================================================
import * as THREE from 'three';
import { Input } from './input.js';
import { City, TRACK } from './city.js';
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
    this.started = false;
    this.modelsLoaded = false;
    this._cKeyHeld = false;
    this.sky = null;
    this.sun = null;
  }

  async init(onProgress) {
    // ===== Scene =====
    this.scene = new THREE.Scene();
    // Lagos sky — soft warm blue
    this.scene.background = new THREE.Color(0x87ceeb);
    // Fog: makes distant buildings fade naturally, hides the world edge
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

    // ===== Lights — Lagos midday, warm sun, soft sky bounce =====
    const hemi = new THREE.HemisphereLight(0xc8e0ff, 0xc8a878, 0.55);
    this.scene.add(hemi);

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

    // Subtle warm fill from opposite side
    const fill = new THREE.DirectionalLight(0xffd2a0, 0.25);
    fill.position.set(-60, 30, -40);
    this.scene.add(fill);

    // ===== Sky (clean gradient, no floating discs) =====
    this._buildSky();

    // ===== City + player =====
    this.city = new City(this.scene);
    await this.city.loadAll((pct, status) => onProgress && onProgress(pct, status));

    this.player = new Player(this.scene);
    await this.player.load();

    // ===== Player start: at the start line on the oval track =====
    // The track start is at (-halfStraight, turnR), heading +X (forward = (1, 0, 0))
    // Heading 0 = +Z forward, so to face +X we need heading = -π/2 (rotate +90° clockwise from +Z)
    // Actually let's compute: forward = (sin(heading), 0, cos(heading)). For +X: sin(h)=1, cos(h)=0 → h=π/2.
    const startPos = this.city.trackPath[0].clone();
    this.player.reset(startPos, Math.PI / 2);  // face +X (direction of track travel)

    // ===== Race =====
    this.race = new Race(this.city, this.player);
    document.getElementById('lap-total').textContent = TOTAL_LAPS;
    document.getElementById('cp-total').textContent = this.race.checkpointCount();

    // ===== Camera =====
    this.cam = new ChaseCamera(this.camera);
    // Initialize the camera behind the player so first frame isn't a wild swoop
    const fwd = this.player.getForward();
    this.cam.curPos.copy(this.player.pos).addScaledVector(fwd, -10).add(new THREE.Vector3(0, 5, 0));
    this.cam.curLook.copy(this.player.pos).add(new THREE.Vector3(0, 1.2, 0));

    window.addEventListener('resize', () => this._onResize());

    this.modelsLoaded = true;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildSky() {
    // Gradient sky dome — top blue, mid lighter, horizon warm
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

    // A few soft cloud puffs — placed high up, far away from the camera
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
    // Reset player at the start line
    const startPos = this.city.trackPath[0].clone();
    this.player.reset(startPos, Math.PI / 2);
    this.race.start();
    document.getElementById('hud').classList.add('active');
    document.getElementById('cp-current').textContent = '1';
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

    if (this.started && !this.race.finished) {
      this.player.update(dt, this.input);

      // ===== Collision: buildings + barriers =====
      const col = this.city.resolveCollision(this.player.pos, 1.6);
      if (col.hit) {
        this.player.speed *= 0.6;  // bleed speed on impact
      }

      // ===== World bounds: clamp to track =====
      if (this.city.clampToTrack(this.player.pos)) {
        // Player was outside the road — kill some speed
        this.player.speed *= 0.5;
      }

      // Re-apply after collision/clamp
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
        document.getElementById('lap-time-best').textContent = 'Best: ' + formatTime(this.race.bestLap);
        document.getElementById('lap-current').textContent = this.race.currentLap;
        document.getElementById('cp-current').textContent = 1;
        this._showBanner(`LAP ${this.race.currentLap}`, `Last: ${formatTime(last)}`, 1800, 'Lap Complete');
        this._refreshBestTime();
      } else if (event === 'finish') {
        this._showRaceEnd();
      }

      this._updateHUD(now);
      this._updateCheckpointArrow();
      this._drawMinimap();

      this.audio.update(this.player.getSpeedFactor(), this.player.driftAmount);
    } else {
      // Pre-race cinematic: orbit camera around the start area, ABOVE the road
      const a = t * 0.15;
      const center = this.city.trackPath[0];
      this.camera.position.set(
        center.x + Math.cos(a) * 25,
        12,
        center.z + Math.sin(a) * 25
      );
      this.camera.lookAt(center.x, 1, center.z);
    }

    this.city.update(dt, t);

    // Sun position relative to player (so shadows always cover the action)
    if (this.player && this.started) {
      this.sun.position.set(
        this.player.pos.x + 80, 120, this.player.pos.z + 40
      );
      this.sun.target.position.set(this.player.pos.x, 0, this.player.pos.z);
      this.sun.target.updateMatrixWorld();
    }

    // Move clouds slowly with the camera so they always feel distant
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
  }

  _updateCheckpointArrow() {
    const cp = this.city.checkpoints[this.race.nextCp];
    if (!cp) return;
    const dx = cp.x - this.player.pos.x;
    const dz = cp.z - this.player.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Compute angle relative to player heading
    const worldAngle = Math.atan2(dx, dz);   // angle from +Z (which is forward when heading is 0)
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

    // World bounds to map — use track bounding box + some margin
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

    // Track outline (centerline + edges as one stroke)
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

    // Centerline (yellow dashes)
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

    // Player (orange triangle pointing along heading)
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
    const total = this.race.lapTimes.reduce((s, t) => s + t, 0);
    titleEl.textContent = 'Race Complete';
    const summaryRow = document.createElement('div');
    summaryRow.className = 'lap-row best';
    summaryRow.innerHTML = `<span class="lap-name">TOTAL</span><span class="lap-time">${formatTime(total)}</span>`;
    listEl.appendChild(summaryRow);

    document.getElementById('end').classList.add('active');
  }
}
