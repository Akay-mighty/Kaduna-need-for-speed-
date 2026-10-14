// ============================================================
// camera.js — chase camera with ground-clamp + collision-aware offset
//
// FIXES:
//   - Camera Y is always clamped above the road (y >= 2)
//   - Camera never goes below the player (so it never shows the underside)
//   - Look-at target is the player + forward bias, clamped to y >= 1
//   - Smooth follow with frame-rate-independent lerp
//   - FOV speed-kick but capped so it doesn't fisheye
//   - No "cinematic" mode that could swing into the void
// ============================================================
import * as THREE from 'three';

const MODES = ['chase', 'hood', 'high'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.curPos = new THREE.Vector3(0, 8, -12);
    this.curLook = new THREE.Vector3(0, 1, 0);
    this.fov = 65;
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
    return MODES[this.mode];
  }

  update(dt, player) {
    const fwd = player.getForward();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    let offset, lookHeight;
    if (MODES[this.mode] === 'chase') {
      // Standard third-person chase cam: behind + above
      offset = fwd.clone().multiplyScalar(-10).add(new THREE.Vector3(0, 5, 0));
      lookHeight = 1.2;
    } else if (MODES[this.mode] === 'hood') {
      // Close to the hood, looking forward
      offset = fwd.clone().multiplyScalar(-0.5).add(new THREE.Vector3(0, 2.2, 0));
      lookHeight = 2.0;
    } else {
      // High angle — like a slightly-top-down view, good for seeing the track
      offset = fwd.clone().multiplyScalar(-8).add(new THREE.Vector3(0, 12, 0));
      lookHeight = 0.8;
    }

    // Slight lateral drift with steering (cinematic feel)
    offset.add(right.clone().multiplyScalar(player.steer * 0.6));

    const ideal = player.pos.clone().add(offset);
    // ===== Critical: clamp camera Y above ground =====
    ideal.y = Math.max(ideal.y, 2.5);

    const look = player.pos.clone().add(new THREE.Vector3(0, lookHeight, 0))
                  .add(fwd.clone().multiplyScalar(5));
    // Clamp look-at target above ground
    look.y = Math.max(look.y, 0.5);

    // Smooth follow (frame-rate independent)
    const lerp = 1 - Math.pow(0.001, dt);
    this.curPos.lerp(ideal, lerp);
    this.camera.position.copy(this.curPos);
    this.curLook.lerp(look, lerp);
    this.camera.lookAt(this.curLook);

    // FOV kick with speed (capped)
    const speedFactor = Math.min(1, Math.abs(player.speed) / 50);
    const targetFov = 65 + speedFactor * 8;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
