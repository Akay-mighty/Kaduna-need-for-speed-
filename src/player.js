// ============================================================
// player.js — Tesla Cybertruck player car (ORIENTATION FIXED)
//
// ROOT CAUSE OF v4 BUGS:
//   The FBX exports the truck with Blender's Z-up convention:
//     - X = width (left-right)
//     - Y = length (front = -Y, rear = +Y)
//     - Z = height (low Z = ground, high Z = roof)
//   I incorrectly applied +90° X rotation, which stood the truck
//   on its rear end (roof facing the camera = "black car", wheels
//   scattered vertically = "wheels detached", truck vertical =
//   "camera too close"). The CORRECT fix is -90° X rotation:
//     (x, y, z) → (x, z, -y)
//   After this: model Z (height) → world Y (up), model -Y (front)
//   → world +Z (forward), model X (width) → world X (width).
//
// SCALE FIX:
//   Model is 5.6m long in model units (Y range ±2.8). Real
//   Cybertruck is 5.68m. So scale = 1.0 would give real size.
//   We use 1.0 (no scale needed) for accurate size.
//
// Y LIFT:
//   Wheel bottom is at model Z = -0.80. After -90° X rotation,
//   this becomes world Y = -0.80. To bring wheel bottom to Y = 0,
//   lift the body by +0.80 (in model units, before scale).
//   Actually we apply scale = 1.0 so we just lift by 0.80m.
//
// WHEEL SPIN:
//   The FBX bakes the 4 wheel meshes into the body at fixed
//   positions. They can't be spun individually. The whole body
//   rotates with `this.heading` via the parent group.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Use scale 1.0 — the FBX is already at correct real-world meters
// (truck length 5.6m matches real Cybertruck 5.68m)
const CYBERTRUCK_SCALE = 1.0;
const Y_LIFT = 0.80;     // lift so wheel bottom sits at Y = 0

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
    this.steerSensitivity = 1.0;  // applied from Settings
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/cybertruck.glb');
    this.body = gltf.scene;

    // ===== CRITICAL FIX: -90° X rotation (not +90°) =====
    // Blender Z-up → game Y-up: (x, y, z) → (x, z, -y)
    // This puts the truck's roof at world +Y, front at world +Z, wheels on the ground
    this.body.rotation.x = -Math.PI / 2;

    // Scale: model is already in meters (truck is ~5.6m long, matches real Cybertruck)
    this.body.scale.setScalar(CYBERTRUCK_SCALE);

    // Lift so wheel bottom (model Z = -0.80) ends up at world Y = 0
    this.body.position.y = Y_LIFT;

    // Enable shadows
    this.body.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        // Make sure materials render correctly under day lighting
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
          // Some PBR materials from FBX2glTF have side=BackSide by accident
          m.side = THREE.FrontSide;
          // Ensure envMap is picked up
          m.envMapIntensity = 1.0;
        });
      }
    });

    // ===== Headlights (in front of the truck, at +Z = forward) =====
    // After -90° X rotation, the truck's front is at world +Z.
    // Headlight positions: x = ±0.9 (left/right), y = 0.7 (mid-height), z = +2.8 (front)
    const headlightL = new THREE.SpotLight(0xfff5d6, 1.6, 35, Math.PI / 6, 0.4, 1.5);
    headlightL.position.set(-0.9, 0.7, 2.8);
    headlightL.target.position.set(-0.9, 0, 25);
    this.body.add(headlightL);
    this.body.add(headlightL.target);

    const headlightR = new THREE.SpotLight(0xfff5d6, 1.6, 35, Math.PI / 6, 0.4, 1.5);
    headlightR.position.set(0.9, 0.7, 2.8);
    headlightR.target.position.set(0.9, 0, 25);
    this.body.add(headlightR);
    this.body.add(headlightR.target);

    // ===== Brake light strip (rear of truck, at -Z = backward) =====
    // After rotation, truck's rear is at world -Z. Tail lights at z = -2.8 (rear).
    this.brakeMat = new THREE.MeshBasicMaterial({
      color: 0x550000, transparent: true, opacity: 0.85, side: THREE.DoubleSide
    });
    this.brakeStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.12),
      this.brakeMat
    );
    this.brakeStrip.position.set(0, 0.7, -2.85);   // rear of truck
    this.brakeStrip.rotation.y = Math.PI;          // face backward
    this.body.add(this.brakeStrip);

    // ===== Soft contact shadow blob under the truck =====
    // Position at world Y = 0.01 (just above ground), in the body's local frame
    // Body local Y (after -90° X rotation) = -model Z = 0.80 (above body center).
    // So to place the shadow at world Y = 0, in body local Y we need +0.80 + 0.01 = 0.81
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 6.5),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    // Body local Y = world Y - body.position.y. So shadow at world Y = 0.01 → body local Y = 0.01 - 0.80 = -0.79
    // But also need to account for the rotation: the body is rotated -90° X, so the shadow's "up" in body-local
    // is +Z (since world Y maps to body local Z after the inverse rotation).
    // Easier: add the shadow to the PARENT GROUP (this.mesh), not the body. The parent group has no rotation.
    // We'll handle that below.

    // ===== Wrap in a parent group =====
    // The parent group is positioned at player.pos and rotated by player.heading.
    // The body (with its -90° X orientation fix) is a child.
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);

    // Add the contact shadow to the parent group (not the body) — easier positioning
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 6.5),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false
      })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;   // just above the road
    this.mesh.add(shadowMesh);

    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
  }

  setSteerSensitivity(s) {
    this.steerSensitivity = s;
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.driftAmount = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  update(dt, input, boostMultiplier = 1.0) {
    // ===== Arcade physics (tuned for fun, mobile-responsive) =====
    const accel = 32;        // Cyberbeast does 0-100 in 2.7s; accel ~37 m/s². We use 32 for feel.
    const baseMaxSpeed = 60;  // 60 m/s = 216 km/h
    const maxSpeed = baseMaxSpeed * boostMultiplier;
    const reverseMax = -18;
    const braking = 48;
    const drag = 4;

    if (input.gas) {
      this.speed += accel * (boostMultiplier > 1 ? 1.5 : 1) * dt;
    } else if (input.brake) {
      if (this.speed > 0.5) this.speed -= braking * dt;
      else this.speed -= accel * 0.7 * dt;
    } else {
      this.speed -= drag * dt * Math.sign(this.speed);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = Math.max(reverseMax, Math.min(maxSpeed, this.speed));

    // ===== Steering (with sensitivity multiplier from Settings) =====
    const targetSteer = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * this.steerSensitivity;
    // Clamp targetSteer to [-1, 1] in case sensitivity > 1
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

    // ===== Lock Y to 0 — never fall through world =====
    this.pos.y = 0;

    // ===== Apply to mesh =====
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Body lean on turns (visual roll, gentle)
    const lean = -this.steer * speedFactor * 0.05;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 6);
    // Pitch on accel/brake
    const pitch = (input.brake && this.speed > 0.5 ? 0.03 : 0) - (input.gas && this.speed > 0.5 ? 0.02 : 0);
    this.mesh.rotation.x += (pitch - this.mesh.rotation.x) * Math.min(1, dt * 6);

    // ===== Brake light =====
    const brakingNow = input.brake && this.speed > 0.5;
    this.brakeMat.color.setHex(brakingNow ? 0xff2030 : 0x550000);
  }

  getForward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  getSpeedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  getSpeedFactor() {
    return Math.min(1, Math.abs(this.speed) / 60);
  }
}
