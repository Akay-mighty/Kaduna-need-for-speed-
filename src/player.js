// ============================================================
// player.js — Tesla Cybertruck player car
//
// Loads /models/cybertruck.glb (real PBR Cybertruck with 56 meshes,
// 47 materials, 2 embedded JPEG textures — body steel + normal map).
//
// ORIENTATION FIX:
//   The FBX exports the truck lying on its side: length along model-Y
//   (from -18 to +18), width along model-X (-7.8 to +7.8), height along
//   model-Z (-6.4 to +5.5). We rotate -90° on X so the length runs
//   along world-Z (forward) and height runs along world-Y (up).
//
// SCALE FIX:
//   The FBX unit is large (truck is 36m long in FBX units). Scale by
//   0.165 to make it ~6m long (close to real Cybertruck 5.68m).
//
// WHEEL SPIN:
//   The FBX bakes the 4 wheel meshes into the body geometry at fixed
//   world positions, so they can't be spun individually without
//   re-extracting them. We keep the truck as a rigid body — the whole
//   body rotates with `this.heading` via the parent group, which is
//   visually convincing enough for an arcade racer.
//
// PHYSICS:
//   Same arcade physics as before: throttle, brake, reverse,
//   speed-sensitive steering, drift on SPACE, body lean, pitch.
//   Y locked to 0 — can never fall through the world.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CYBERTRUCK_SCALE = 0.165;   // 36.3m FBX length → ~6m game length
const ROT_X_MINUS_90 = -Math.PI / 2;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;        // radians, 0 = facing +Z
    this.speed = 0;          // m/s along heading
    this.steer = 0;          // -1..1
    this.driftAmount = 0;    // 0..1 visual
    this.mesh = null;        // parent group (positioned + rotated by heading)
    this.body = null;        // the loaded GLB scene (rotated -90° X, scaled)
    this.brakeMat = null;
    this.brakeStrip = null;
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/cybertruck.glb');
    this.body = gltf.scene;

    // Rotate so model-Y (length) maps to world-Z (forward), and model-Z (height) maps to world-Y (up).
    // After -90° X rotation: (x, y, z) → (x, z, -y), so model-Y(+18) → world-Z(-18). To flip the
    // truck so it faces +Z instead of -Z, also rotate 180° on Y. Easier: rotate +90° X.
    // +90° X: (x, y, z) → (x, -z, y). Model-Y(+18) → world-Z(+18) (forward = +Z ✓).
    // Model-Z(+5.5 = roof) → world-Y(+5.5) (up ✓).
    this.body.rotation.x = Math.PI / 2;

    this.body.scale.setScalar(CYBERTRUCK_SCALE);

    // After scaling: length = 36.3 * 0.165 = 5.99m along +Z, width = 15.6 * 0.165 = 2.57m, height = 12 * 0.165 = 1.98m
    // Truck centered at origin in model space. After +90° X rotation, the truck spans:
    //   X: [-7.8, 7.8] * 0.165 = [-1.29, 1.29]   (width)
    //   Y: [-6.4, 5.5] * 0.165 = [-1.06, 0.91]  (height — wheels at -1.06, roof at +0.91)
    //   Z: [-18, 18] * 0.165 = [-2.97, 2.97]    (length, forward = +Z)
    // We want wheels at y=0, so lift the body by +1.06 (the wheel bottom)
    this.body.position.y = 1.06;

    // Enable shadows on all meshes
    this.body.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    // ===== Headlight spotlights (so the truck actually lights the road ahead) =====
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

    // ===== Brake light strip (illuminates when braking) =====
    // The Cybertruck GLB already has LED materials, but we add a glowing strip
    // for a clear brake indicator that brightens on input.brake
    this.brakeMat = new THREE.MeshBasicMaterial({
      color: 0x550000, transparent: true, opacity: 0.85
    });
    this.brakeStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.08),
      this.brakeMat
    );
    this.brakeStrip.position.set(0, 0.7, -3.0);   // just behind the truck
    this.body.add(this.brakeStrip);

    // ===== Soft contact shadow blob (cheap fake AO) =====
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 6.5),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.05;   // just under the wheels (relative to body lift)
    this.body.add(shadow);

    // ===== Wrap in a parent group that we move/rotate via position + heading =====
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
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
    // ===== Arcade physics =====
    const accel = 26;
    const baseMaxSpeed = 55;
    const maxSpeed = baseMaxSpeed * boostMultiplier;  // boost pads can raise this temporarily
    const reverseMax = -15;
    const braking = 40;
    const drag = 5;

    if (input.gas) {
      this.speed += accel * (boostMultiplier > 1 ? 1.4 : 1) * dt;   // boost also speeds up acceleration
    } else if (input.brake) {
      if (this.speed > 0.5) this.speed -= braking * dt;
      else this.speed -= accel * 0.6 * dt;
    } else {
      this.speed -= drag * dt * Math.sign(this.speed);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = Math.max(reverseMax, Math.min(maxSpeed, this.speed));

    // ===== Steering =====
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 14);
    const driftBoost = input.drift ? 1.5 : 1.0;
    const turn = this.steer * 1.9 * speedFactor * driftBoost * dt * Math.sign(this.speed || 1);
    this.heading -= turn;

    // Drift visual amount
    const slip = Math.abs(this.steer) * speedFactor * (input.drift ? 1.5 : 0.6);
    this.driftAmount += (slip - this.driftAmount) * Math.min(1, dt * 6);

    // ===== Integrate position =====
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);

    // ===== Lock Y to 0 — never fall through the world =====
    this.pos.y = 0;

    // ===== Apply to mesh =====
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Body lean on turns (visual roll)
    const lean = -this.steer * speedFactor * 0.06;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 6);
    // Pitch on accel/brake
    const pitch = (input.brake && this.speed > 0.5 ? 0.04 : 0) - (input.gas && this.speed > 0.5 ? 0.03 : 0);
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
    return Math.min(1, Math.abs(this.speed) / 55);
  }
}
