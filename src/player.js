// ============================================================
// player.js — Kaduna Need for Speed · Cybertruck (v6)
//
// FIXES vs v5:
//   - Orientation: keep -π/2 X rotation (verified correct: model uses
//     Blender Z-up, length along Y, height along Z)
//   - Y lift: 1.05 (was 0.80) — model Z=-1.80 is roof, -0.80 is wheel bottom,
//     but brake strip + shadow plane need to be ABOVE wheels, so lift is
//     actually 0.80 — the bug was elsewhere.
//   - Real fix: lighting + materials (the body uses real PBR stainless
//     steel from the FBX, we just enable envMap + raise envMapIntensity
//     so it reflects the sky properly)
//   - Real fix #2: barrier colliders in city.js (not here) were too big
//   - Real fix #3: car physics now closer to slop-newyork's CAR_DRIVE
//     (rolling resistance + drag instead of linear drag)
//   - Real fix #4: rivals no longer collide with player at startup
//
// CYBERTRUCK PHYSICS (from slop-newyork's driveSpeed function):
//   - Rolling resistance: small constant deceleration
//   - Air drag: quadratic in speed
//   - Acceleration: throttle * acceleration * dt, capped at topSpeed
//   - Coast: when no throttle, speed decays via rolling + drag
//   - This is more stable and feels better than linear drag
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CYBERTRUCK_SCALE = 1.0;   // FBX is in meters (truck 5.68m long, matches real Cybertruck)
const Y_LIFT = 0.803;           // lift so wheel bottom (model Z=-0.803) sits at world Y=0

// Physics (Cyberbeast: 0-100 km/h in 2.7s, top speed 209 km/h = 58 m/s)
const CAR_DRIVE = {
  speed: 55,             // m/s top speed (199 km/h)
  boostSpeed: 80,        // m/s with boost (288 km/h — feels fast)
  reverseSpeed: 12,      // m/s
  acceleration: 18,      // m/s² — at full throttle, 0-55 in 3s
  boostAcceleration: 28, // m/s² — boost acceleration
  rolling: 0.6,          // m/s² rolling resistance
  drag: 0.0015,          // 1/m quadratic air drag coefficient
  brake: 22             // m/s² braking deceleration
};

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.driftAmount = 0;
    this.mesh = null;
    this.body = null;
    this.brakeMat = null;
    this.brakeStrip = null;
    this.steerSensitivity = 1.0;
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/cybertruck.glb');
    this.body = gltf.scene;

    // ===== Orientation: -π/2 X (Blender Z-up → game Y-up) =====
    // (x, y, z) → (x, z, -y): model Y → world -Z, model Z → world Y
    this.body.rotation.x = -Math.PI / 2;
    this.body.scale.setScalar(CYBERTRUCK_SCALE);
    this.body.position.y = Y_LIFT;

    // Enable shadows + boost env map reflections on all materials
    this.body.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
          // FrontSide so we don't see through panels
          m.side = THREE.FrontSide;
          // Strong envMap so stainless steel + glass actually reflect the sky
          m.envMapIntensity = 1.2;
          // Make sure materials are not inadvertently transparent
          if (m.transparent && m.opacity > 0.95) m.transparent = false;
        });
      }
    });

    // ===== Headlights (front of truck = +Z after rotation) =====
    const headlightL = new THREE.SpotLight(0xfff5d6, 2.0, 35, Math.PI / 6, 0.4, 1.5);
    headlightL.position.set(-0.9, 0.7, 2.8);
    headlightL.target.position.set(-0.9, 0, 25);
    this.body.add(headlightL);
    this.body.add(headlightL.target);

    const headlightR = new THREE.SpotLight(0xfff5d6, 2.0, 35, Math.PI / 6, 0.4, 1.5);
    headlightR.position.set(0.9, 0.7, 2.8);
    headlightR.target.position.set(0.9, 0, 25);
    this.body.add(headlightR);
    this.body.add(headlightR.target);

    // ===== Brake light strip (rear of truck = -Z) =====
    this.brakeMat = new THREE.MeshBasicMaterial({
      color: 0x550000, transparent: true, opacity: 0.85, side: THREE.DoubleSide
    });
    this.brakeStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.12),
      this.brakeMat
    );
    this.brakeStrip.position.set(0, 0.7, -2.85);
    this.brakeStrip.rotation.y = Math.PI;
    this.body.add(this.brakeStrip);

    // ===== Parent group (positioned/rotated by heading) =====
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);

    // Contact shadow in parent group (easier positioning — world Y=0)
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 6.5),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.mesh.add(shadow);

    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
  }

  setSteerSensitivity(s) { this.steerSensitivity = s; }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.driftAmount = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // slop-newyork-style physics — more stable, feels better than linear drag
  _driveSpeed(speed, throttle, boost, dt) {
    const braking = speed * throttle < 0;
    const magnitude = Math.abs(speed);
    const deceleration = CAR_DRIVE.rolling + (braking ? Math.abs(throttle) * CAR_DRIVE.brake : 0);
    // Constant rolling resistance and quadratic air drag, without crossing zero
    const coasting = Math.max(0, magnitude - deceleration * dt) / (1 + CAR_DRIVE.drag * magnitude * dt);
    if (!throttle || braking) return Math.sign(speed) * coasting;
    const limit = throttle < 0 ? CAR_DRIVE.reverseSpeed : (boost ? CAR_DRIVE.boostSpeed : CAR_DRIVE.speed);
    const accel = boost ? CAR_DRIVE.boostAcceleration : CAR_DRIVE.acceleration;
    return Math.sign(throttle) * Math.min(Math.max(limit, coasting), coasting + Math.abs(throttle) * accel * dt);
  }

  update(dt, input, boostMultiplier = 1.0) {
    // ===== Throttle / brake =====
    const throttle = input.gas ? 1 : (input.brake ? -1 : 0);
    const boosted = boostMultiplier > 1.0;
    this.speed = this._driveSpeed(this.speed, throttle, boosted, dt);

    // ===== Steering (sensitivity-aware, speed-proportional) =====
    const targetSteer = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * this.steerSensitivity;
    const clampedTarget = Math.max(-1, Math.min(1, targetSteer));
    this.steer += (clampedTarget - this.steer) * Math.min(1, dt * 10);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 14);
    const driftBoost = input.drift ? 1.5 : 1.0;
    const turn = this.steer * 2.0 * speedFactor * driftBoost * dt * Math.sign(this.speed || 1);
    this.heading -= turn;

    // Drift visual amount
    const slip = Math.abs(this.steer) * speedFactor * (input.drift ? 1.5 : 0.6);
    this.driftAmount += (slip - this.driftAmount) * Math.min(1, dt * 6);

    // ===== Integrate position =====
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);
    this.pos.y = 0;

    // ===== Apply to mesh =====
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Body lean (gentle)
    const lean = -this.steer * speedFactor * 0.05;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 6);
    const pitch = (input.brake && this.speed > 0.5 ? 0.03 : 0) - (input.gas && this.speed > 0.5 ? 0.02 : 0);
    this.mesh.rotation.x += (pitch - this.mesh.rotation.x) * Math.min(1, dt * 6);

    // Brake light
    const brakingNow = input.brake && this.speed > 0.5;
    this.brakeMat.color.setHex(brakingNow ? 0xff2030 : 0x550000);
  }

  getForward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  getSpeedKmh() { return Math.abs(this.speed) * 3.6; }

  getSpeedFactor() {
    return Math.min(1, Math.abs(this.speed) / CAR_DRIVE.speed);
  }
}
