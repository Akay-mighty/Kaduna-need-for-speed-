// ============================================================
// player.js — the player's car. Built procedurally from boxes
// to look like a low-slung supercar, with a glowing under-glow,
// headlights, taillights, and wheel meshes that spin.
// ============================================================
import * as THREE from 'three';

export class Player {
  constructor(scene, carSpec) {
    this.scene = scene;
    this.spec = carSpec;

    // Position / motion state
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;       // radians, 0 = facing +Z
    this.speed = 0;         // m/s along heading
    this.velocity = new THREE.Vector3();
    this.steer = 0;         // -1..1
    this.wheelSpin = 0;     // visual
    this.driftAmount = 0;   // 0..1 visual drift smoke intensity

    this._build();
  }

  _build() {
    const spec = this.spec;
    const grp = new THREE.Group();

    // ===== Body =====
    const bodyColor = spec.bodyColor;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor, metalness: 0.85, roughness: 0.25,
      emissive: bodyColor, emissiveIntensity: 0.05
    });

    // Lower hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 4.4), bodyMat);
    hull.position.y = 0.55;
    hull.castShadow = true;
    grp.add(hull);

    // Midsection (tapered cabin-ish)
    const mid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 2.4), bodyMat);
    mid.position.set(0, 0.9, -0.1);
    mid.castShadow = true;
    grp.add(mid);

    // Sloped nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.35, 1.0), bodyMat);
    nose.position.set(0, 0.5, 1.7);
    nose.rotation.x = -0.08;
    grp.add(nose);

    // Cabin/greenhouse
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a18, metalness: 0.9, roughness: 0.1,
      transparent: true, opacity: 0.7
    });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 1.6), glassMat);
    cab.position.set(0, 1.18, -0.2);
    grp.add(cab);

    // Rear spoiler
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x101018, metalness: 0.7, roughness: 0.4 })
    );
    spoiler.position.set(0, 1.1, -2.0);
    grp.add(spoiler);
    const spoilerStand1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x101018 }));
    spoilerStand1.position.set(-0.7, 0.95, -2.0);
    grp.add(spoilerStand1);
    const spoilerStand2 = spoilerStand1.clone();
    spoilerStand2.position.x = 0.7;
    grp.add(spoilerStand2);

    // ===== Neon under-glow =====
    this.underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 4.6),
      new THREE.MeshBasicMaterial({
        color: spec.color, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    this.underglow.rotation.x = -Math.PI / 2;
    this.underglow.position.y = 0.05;
    grp.add(this.underglow);

    // ===== Headlights =====
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), headMat);
    headL.position.set(-0.65, 0.55, 2.2);
    grp.add(headL);
    const headR = headL.clone();
    headR.position.x = 0.65;
    grp.add(headR);

    // Headlight beams (real lights)
    this.headlightL = new THREE.SpotLight(0xfff5d6, 2.5, 35, Math.PI / 6, 0.4, 1.5);
    this.headlightL.position.set(-0.65, 0.6, 2.0);
    this.headlightL.target.position.set(-0.65, 0, 20);
    grp.add(this.headlightL);
    grp.add(this.headlightL.target);
    this.headlightR = this.headlightL.clone();
    this.headlightR.target = this.headlightL.target.clone();
    this.headlightR.position.x = 0.65;
    this.headlightR.target.position.x = 0.65;
    grp.add(this.headlightR);
    grp.add(this.headlightR.target);

    // ===== Taillights =====
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0030 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.1), tailMat);
    tail.position.set(0, 0.65, -2.2);
    grp.add(tail);

    // ===== Wheels =====
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.7, metalness: 0.3 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.95, roughness: 0.2 });
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 8);
    this.wheels = [];
    const offsets = [
      [-0.95, 1.45], [0.95, 1.45],   // front L, R
      [-0.95, -1.45], [0.95, -1.45]  // rear L, R
    ];
    for (const [x, z] of offsets) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      w.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      w.add(rim);
      w.position.set(x, 0.45, z);
      this.wheels.push(w);
      grp.add(w);
    }

    // ===== Shadow blob (cheap fake AO under the car) =====
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 5),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    grp.add(shadow);

    // Body color accent strip
    const stripMat = new THREE.MeshBasicMaterial({ color: spec.color });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 4.2), stripMat);
    strip.position.set(0, 0.78, 0);
    grp.add(strip);

    this.mesh = grp;
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
  }

  // Update physics + visuals
  update(dt, input) {
    const spec = this.spec;

    // ===== Throttle / brake =====
    if (input.gas) {
      this.speed += spec.acceleration * dt;
    } else if (input.brake) {
      this.speed -= spec.braking * dt;
    } else {
      // Engine drag + rolling friction
      this.speed -= 6 * dt;
    }
    // Reverse
    if (this.speed < -10) this.speed = -10;
    if (this.speed > spec.maxSpeed) this.speed = spec.maxSpeed;
    if (Math.abs(this.speed) < 0.05 && !input.gas && !input.brake) this.speed = 0;

    // ===== Steering — proportional to speed so it feels like a car =====
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);

    const speedFactor = Math.min(1, Math.abs(this.speed) / 25);
    const driftBoost = input.drift ? 1.4 : 1.0;
    const turn = this.steer * spec.turnRate * speedFactor * driftBoost * dt * Math.sign(this.speed || 1);
    this.heading -= turn;

    // Drift visual amount (for under-glow flicker & smoke)
    const slip = Math.abs(this.steer) * speedFactor * (input.drift ? 1.4 : 0.6);
    this.driftAmount += (slip - this.driftAmount) * Math.min(1, dt * 6);

    // ===== Integrate position =====
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.pos.addScaledVector(this.velocity, dt);

    // City bounds — soft wall (push back & kill speed)
    const limit = 200;
    if (Math.abs(this.pos.x) > limit) {
      this.pos.x = Math.sign(this.pos.x) * limit;
      this.speed *= 0.5;
    }
    if (Math.abs(this.pos.z) > limit) {
      this.pos.z = Math.sign(this.pos.z) * limit;
      this.speed *= 0.5;
    }

    // ===== Apply to mesh =====
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = 0;
    this.mesh.rotation.y = this.heading;

    // Body lean on turns (visual)
    const lean = -this.steer * speedFactor * 0.06;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 6);

    // ===== Wheels spin + steer =====
    this.wheelSpin += this.speed * dt * 2;
    this.wheels.forEach((w, i) => {
      w.children[0].rotation.x = this.wheelSpin; // tire
      w.children[1].rotation.x = this.wheelSpin; // rim
      // Steer front wheels (index 0,1)
      if (i < 2) {
        w.rotation.y = this.steer * 0.4;
      }
    });

    // ===== Under-glow pulse with speed =====
    const glowPulse = 0.4 + speedFactor * 0.3 + Math.sin(performance.now() * 0.005) * 0.05;
    this.underglow.material.opacity = glowPulse * (0.6 + this.driftAmount * 0.4);

    // ===== Taillight brightness when braking =====
    const tailIntensity = input.brake ? 1.0 : 0.4;
    this.mesh.children.forEach(c => {
      if (c.material && c.material.color && c.material.color.getHex() === 0xff0030) {
        c.material.opacity = tailIntensity;
        c.material.transparent = true;
      }
    });
  }

  // Returns the world-space position of where headlight beams should land,
  // for camera / forward-direction calculations.
  getForward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }
}
