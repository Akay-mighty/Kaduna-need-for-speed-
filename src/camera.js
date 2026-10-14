// ============================================================
// camera.js — chase / hood / cinematic camera
// ============================================================
import * as THREE from 'three';

const MODES = ['chase', 'hood', 'cinematic'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.curPos = new THREE.Vector3(0, 10, 20);
    this.curLook = new THREE.Vector3();
    this.fov = 70;
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
    return MODES[this.mode];
  }

  update(dt, player) {
    const fwd = player.getForward();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    let offset, look;

    if (MODES[this.mode] === 'chase') {
      offset = fwd.clone().multiplyScalar(-9).add(new THREE.Vector3(0, 4.5, 0));
      look = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).add(fwd.clone().multiplyScalar(6));
    } else if (MODES[this.mode] === 'hood') {
      offset = fwd.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 2.0, 0));
      look = player.pos.clone().add(new THREE.Vector3(0, 2.0, 0)).add(fwd.clone().multiplyScalar(20));
    } else {
      offset = fwd.clone().multiplyScalar(-16).add(new THREE.Vector3(0, 8, 0))
                 .add(right.clone().multiplyScalar(Math.sin(performance.now() * 0.0003) * 4));
      look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    }

    // Slight lateral offset based on steering
    offset.add(right.clone().multiplyScalar(player.steer * 0.8));

    const ideal = player.pos.clone().add(offset);
    const lerp = 1 - Math.pow(0.001, dt);
    this.curPos.lerp(ideal, lerp);
    this.camera.position.copy(this.curPos);
    this.curLook.lerp(look, lerp);
    this.camera.lookAt(this.curLook);

    // FOV kick with speed
    const speedFactor = Math.min(1, Math.abs(player.speed) / 50);
    const targetFov = 70 + speedFactor * 10;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
