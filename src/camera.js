// ============================================================
// camera.js — chase camera with three modes (chase / far / hood)
// and smooth follow + slight FOV kick at top speed for sense of speed.
// ============================================================
import * as THREE from 'three';

const MODES = ['chase', 'far', 'hood'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0; // 0 = chase, 1 = far, 2 = hood
    this.ideal = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.curOffset = new THREE.Vector3();
    this.fov = 70;
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  update(dt, player) {
    const fwd = player.getForward();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let camOffset, lookAt;

    if (MODES[this.mode] === 'chase') {
      camOffset = fwd.clone().multiplyScalar(-8).add(new THREE.Vector3(0, 4, 0));
      lookAt = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).add(fwd.clone().multiplyScalar(5));
    } else if (MODES[this.mode] === 'far') {
      camOffset = fwd.clone().multiplyScalar(-14).add(new THREE.Vector3(0, 7, 0));
      lookAt = player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    } else {
      // hood
      camOffset = fwd.clone().multiplyScalar(1.5).add(new THREE.Vector3(0, 1.8, 0));
      lookAt = player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)).add(fwd.clone().multiplyScalar(20));
    }

    // Soft drift offset based on steering for cinematic feel
    const driftOffset = right.clone().multiplyScalar(player.steer * 0.6);
    camOffset.add(driftOffset);

    this.ideal.copy(player.pos).add(camOffset);

    // Smooth follow
    const lerp = 1 - Math.pow(0.001, dt);
    this.curOffset.lerp(this.ideal, lerp);
    this.camera.position.copy(this.curOffset);

    // Smooth look-at
    this.target.lerp(lookAt, lerp);
    this.camera.lookAt(this.target);

    // FOV kick with speed
    const speedFactor = Math.min(1, Math.abs(player.speed) / 100);
    const targetFov = 70 + speedFactor * 12;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
