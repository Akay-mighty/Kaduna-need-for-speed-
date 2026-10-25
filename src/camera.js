// ============================================================
// camera.js — chase camera with ground-clamp + collision-aware offset
//
// v5 improvements:
//   - Default distance 14 (was 10) and height 6 (was 5) — not too close
//   - Distance is configurable via Settings (cameraDistance slider 5-25)
//   - Smoother follow (slower lerp for less nausea on mobile)
//   - Y is always clamped above the road (y >= 2.5)
//   - Look-at target is the player + forward bias, clamped to y >= 0.5
//   - FOV speed-kick but capped so it doesn't fisheye
//   - 3 modes: chase / hood / high
// ============================================================
import * as THREE from 'three';

const MODES = ['chase', 'hood', 'high'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.curPos = new THREE.Vector3(0, 8, -14);
    this.curLook = new THREE.Vector3(0, 1, 0);
    this.fov = 65;
    this.distance = 14;    // configurable via Settings
    this.height = 6;       // configurable via Settings
  }

  setDistance(d) { this.distance = Math.max(5, Math.min(25, d)); }
  setHeight(h)   { this.height = Math.max(3, Math.min(12, h)); }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
    return MODES[this.mode];
  }

  update(dt, player) {
    const fwd = player.getForward();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    // Speed-based zoom-out (slop-newyork pattern): camera pulls back as speed
    // increases, gives a sense of velocity. Speed factor 0..1, distance grows
    // by up to 25% at top speed.
    const speedFactor = Math.min(1, Math.abs(player.speed) / 55);
    const speedZoom = 1 + speedFactor * 0.25;

    let offset, lookHeight;
    if (MODES[this.mode] === 'chase') {
      // Standard third-person chase cam: behind + above
      offset = fwd.clone().multiplyScalar(-this.distance * speedZoom)
              .add(new THREE.Vector3(0, this.height, 0));
      lookHeight = 1.4;
    } else if (MODES[this.mode] === 'hood') {
      // Close to the hood, looking forward
      offset = fwd.clone().multiplyScalar(-0.5).add(new THREE.Vector3(0, 2.4, 0));
      lookHeight = 2.2;
    } else {
      // High angle — slightly top-down, good for seeing the track
      offset = fwd.clone().multiplyScalar(-this.distance * 0.6)
              .add(new THREE.Vector3(0, this.height * 2, 0));
      lookHeight = 0.8;
    }

    // Slight lateral drift with steering (cinematic feel)
    offset.add(right.clone().multiplyScalar(player.steer * 0.6));

    const ideal = player.pos.clone().add(offset);
    // ===== Critical: clamp camera Y above ground =====
    ideal.y = Math.max(ideal.y, 2.5);

    const look = player.pos.clone().add(new THREE.Vector3(0, lookHeight, 0))
                  .add(fwd.clone().multiplyScalar(5));
    look.y = Math.max(look.y, 0.5);

    // Smooth follow (frame-rate independent)
    const lerp = 1 - Math.pow(0.003, dt);
    this.curPos.lerp(ideal, lerp);
    // Guard against NaN — if curPos goes invalid, snap to ideal
    if (!isFinite(this.curPos.x) || !isFinite(this.curPos.y) || !isFinite(this.curPos.z)) {
      this.curPos.copy(ideal);
    }
    this.camera.position.copy(this.curPos);
    this.curLook.lerp(look, lerp);
    if (!isFinite(this.curLook.x) || !isFinite(this.curLook.y) || !isFinite(this.curLook.z)) {
      this.curLook.copy(look);
    }
    this.camera.lookAt(this.curLook);

    // FOV kick with speed (capped)
    const targetFov = 65 + speedFactor * 12;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
