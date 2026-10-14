// ============================================================
// player.js — the player's Jeep.
// Loads jeep.glb (real model), finds wheel meshes by name and
// spins them based on speed. Arcade physics with drift on SPACE.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const JEEP_SCALE = 30;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.driftAmount = 0;
    this.wheelSpin = 0;
    this.mesh = null;
    this.wheels = [];   // front wheels for steering, all for spinning
    this.frontWheels = [];
    this.bodyColorMaterial = null;
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/jeep.glb');
    this.mesh = gltf.scene;
    this.mesh.scale.setScalar(JEEP_SCALE);
    this.mesh.position.copy(this.pos);

    // Find wheels by name (from FBX2glTF — the FBX had Front_wheel, Rear_wheel, Front_wheel.001, Rear_wheel.001)
    this.mesh.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        const name = c.name.toLowerCase();
        if (name.includes('wheel')) {
          this.wheels.push(c);
          if (name.includes('front')) this.frontWheels.push(c);
        }
      }
    });

    // Apply a strong Lagos-y yellow-orange tint to the main body material (mat[2] = 'Smoke' was the brightest)
    // We'll find the body material by name. The Jeep FBX had materials: Black, Light_black, Smoke, etc.
    this.mesh.traverse(c => {
      if (c.isMesh && c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
          if (m.name === 'Smoke' || m.name === 'Body' || m.name.toLowerCase().includes('body')) {
            m.color = new THREE.Color(0xffb627);   // warm Lagos yellow
            m.emissive = new THREE.Color(0x331a00);
            m.emissiveIntensity = 0.05;
            m.roughness = 0.55;
            m.metalness = 0.35;
            this.bodyColorMaterial = m;
          }
        });
      }
    });

    // Add headlights
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff5d0 });
    const headL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), headMat);
    headL.position.set(-0.65, 0.5, 2.0);
    this.mesh.add(headL);
    const headR = headL.clone();
    headR.position.x = 0.65;
    this.mesh.add(headR);

    const headlight = new THREE.SpotLight(0xfff5d0, 1.5, 30, Math.PI / 6, 0.4, 1.5);
    headlight.position.set(0, 0.7, 1.5);
    headlight.target.position.set(0, 0, 15);
    this.mesh.add(headlight);
    this.mesh.add(headlight.target);

    // Taillights
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.05), tailMat);
    tail.position.set(0, 0.6, -1.6);
    this.mesh.add(tail);

    this.scene.add(this.mesh);
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.driftAmount = 0;
  }

  update(dt, input) {
    // ===== Arcade physics =====
    const accel = 22;       // m/s^2
    const maxSpeed = 45;    // m/s (~162 km/h — feels fast in a small city)
    const reverseMax = -12;
    const braking = 36;
    const drag = 5;

    if (input.gas) {
      this.speed += accel * dt;
    } else if (input.brake) {
      if (this.speed > 0.5) {
        // braking
        this.speed -= braking * dt;
      } else {
        // reverse
        this.speed -= accel * 0.6 * dt;
      }
    } else {
      // engine drag + rolling friction
      this.speed -= drag * dt * Math.sign(this.speed);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = Math.max(reverseMax, Math.min(maxSpeed, this.speed));

    // ===== Steering — proportional to speed so it doesn't spin in place =====
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);

    const speedFactor = Math.min(1, Math.abs(this.speed) / 12);
    const driftBoost = input.drift ? 1.5 : 1.0;
    const turn = this.steer * 2.0 * speedFactor * driftBoost * dt * Math.sign(this.speed || 1);
    this.heading -= turn;

    // Drift visual amount
    const slip = Math.abs(this.steer) * speedFactor * (input.drift ? 1.5 : 0.6);
    this.driftAmount += (slip - this.driftAmount) * Math.min(1, dt * 6);

    // ===== Integrate position =====
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);

    // Apply to mesh
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Body lean on turns
    const lean = -this.steer * speedFactor * 0.06;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 6);
    // Pitch on accel/brake
    const pitch = (input.brake ? 0.04 : 0) - (input.gas ? 0.03 : 0);
    this.mesh.rotation.x += (pitch - this.mesh.rotation.x) * Math.min(1, dt * 6);

    // ===== Wheels =====
    this.wheelSpin += this.speed * dt * 2;
    this.wheels.forEach((w, i) => {
      // The FBX wheel meshes are oriented with their axle along X, so we rotate around X to spin
      w.rotation.x = this.wheelSpin;
    });
    this.frontWheels.forEach(w => {
      // Front wheels also steer — combine steer with spin using a parent group isn't easy,
      // so just visually nudge the rotation.y a bit. Acceptable for arcade.
      w.rotation.y = this.steer * 0.4;
    });
  }

  getForward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  getSpeedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  getSpeedFactor() {
    return Math.min(1, Math.abs(this.speed) / 45);
  }
}
