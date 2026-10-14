// ============================================================
// player.js — procedural low-poly Jeep with arcade physics
//
// WHY PROCEDURAL:
//   The uploaded jeep.glb had broken nested scales from the FBX→GLB
//   converter — root Frame scale [300, 100, 50] but children with
//   scale 50/55/27 at translations of 1.55/1.27. The resulting
//   world-space wheel positions ended up hundreds of meters from
//   the body. Instead of patching the GLB, we build a clean ~4m
//   Jeep from primitives — fully controllable, looks the part.
//
// PHYSICS:
//   - Arcade: throttle, brake, reverse, speed-sensitive steering
//   - Drift on SPACE (boosts turn rate + lateral slip)
//   - Y locked to 0 — player can NEVER fall through the world
//   - World-bounded by City.clampToTrack()
// ============================================================
import * as THREE from 'three';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;        // radians, 0 = facing +Z
    this.speed = 0;          // m/s along heading
    this.steer = 0;          // -1..1
    this.driftAmount = 0;    // 0..1
    this.wheelSpin = 0;
    this.mesh = null;
    this.wheels = [];
    this.frontWheels = [];
    this.bodyMat = null;
    this.brakeMat = null;
  }

  async load() {
    // ===== Body materials =====
    // Lagos-style sun-faded yellow Jeep
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffb627, roughness: 0.55, metalness: 0.35,
      emissive: 0x221100, emissiveIntensity: 0.05
    });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x101418, roughness: 0.1, metalness: 0.9,
      transparent: true, opacity: 0.7
    });
    this.brakeMat = new THREE.MeshBasicMaterial({ color: 0x660000 });

    const grp = new THREE.Group();

    // ===== Chassis (low box) =====
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 4.0), blackMat);
    chassis.position.y = 0.7;
    chassis.castShadow = true;
    grp.add(chassis);

    // ===== Body (the yellow box on top) =====
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 3.0), this.bodyMat);
    body.position.y = 1.1;
    body.position.z = -0.2;
    body.castShadow = true;
    grp.add(body);

    // Hood (sloped front)
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.0), this.bodyMat);
    hood.position.set(0, 1.05, 1.4);
    hood.rotation.x = -0.08;
    hood.castShadow = true;
    grp.add(hood);

    // Cabin (windshield frame — just two side pillars + a roof)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.6), this.bodyMat);
    roof.position.set(0, 1.6, -0.3);
    roof.castShadow = true;
    grp.add(roof);
    // Roll bar ( Jeep signature)
    const rollBar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), blackMat);
    rollBar.position.set(0, 1.85, -0.3);
    rollBar.rotation.z = Math.PI / 2;
    grp.add(rollBar);

    // Windshield (sloped glass in front of the cabin)
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), glassMat);
    windshield.position.set(0, 1.55, 0.55);
    windshield.rotation.x = -Math.PI / 4;
    grp.add(windshield);
    // Rear window
    const rearWin = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), glassMat);
    rearWin.position.set(0, 1.5, -1.1);
    rearWin.rotation.x = Math.PI / 4;
    grp.add(rearWin);
    // Side windows
    for (const sx of [-1.01, 1.01]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), glassMat);
      sw.position.set(sx, 1.55, -0.3);
      sw.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      grp.add(sw);
    }

    // ===== Front grille + bumpers =====
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.1), blackMat);
    grille.position.set(0, 0.85, 2.0);
    grp.add(grille);
    // Front bumper
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.25, 0.3), blackMat);
    frontBumper.position.set(0, 0.5, 2.05);
    frontBumper.castShadow = true;
    grp.add(frontBumper);
    // Rear bumper
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.25, 0.3), blackMat);
    rearBumper.position.set(0, 0.5, -2.05);
    rearBumper.castShadow = true;
    grp.add(rearBumper);

    // ===== Headlights =====
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff8d0 });
    const headGeo = new THREE.CircleGeometry(0.18, 16);
    for (const sx of [-0.65, 0.65]) {
      const h = new THREE.Mesh(headGeo, headMat);
      h.position.set(sx, 0.9, 2.05);
      h.rotation.y = Math.PI;
      grp.add(h);
    }
    // SpotLights (headlight beams)
    const headlightL = new THREE.SpotLight(0xfff5d6, 1.8, 35, Math.PI / 6, 0.4, 1.5);
    headlightL.position.set(-0.6, 0.9, 1.8);
    headlightL.target.position.set(-0.6, 0, 20);
    grp.add(headlightL);
    grp.add(headlightL.target);

    // ===== Taillights =====
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    const tailGeo = new THREE.BoxGeometry(0.4, 0.15, 0.05);
    for (const sx of [-0.6, 0.6]) {
      const t = new THREE.Mesh(tailGeo, tailMat);
      t.position.set(sx, 0.95, -2.05);
      grp.add(t);
    }
    // Big brake light strip (illuminates when braking)
    this.brakeStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 0.04),
      this.brakeMat
    );
    this.brakeStrip.position.set(0, 0.95, -2.05);
    grp.add(this.brakeStrip);

    // ===== Wheels =====
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
    const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 16);
    const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.38, 8);
    const offsets = [
      { x: -1.0, z:  1.35, front: true },   // FL
      { x:  1.0, z:  1.35, front: true },   // FR
      { x: -1.0, z: -1.35, front: false },  // RL
      { x:  1.0, z: -1.35, front: false },  // RR
    ];
    for (const o of offsets) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      w.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      w.add(rim);
      w.position.set(o.x, 0.55, o.z);
      this.wheels.push(w);
      if (o.front) this.frontWheels.push(w);
      grp.add(w);
    }

    // Spare tire on the back (Jeep signature)
    const spare = new THREE.Mesh(tireGeo, tireMat);
    spare.position.set(0, 1.1, -2.1);
    spare.scale.set(0.85, 1, 0.85);
    spare.rotation.set(Math.PI / 2, 0, 0);
    grp.add(spare);

    // Body-color fender flares (give it the boxy Jeep look)
    const flareMat = this.bodyMat;
    for (const sx of [-1.05, 1.05]) {
      for (const sz of [1.35, -1.35]) {
        const flare = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.3, 1.2),
          flareMat
        );
        flare.position.set(sx, 0.85, sz);
        flare.castShadow = true;
        grp.add(flare);
      }
    }

    // Soft contact shadow blob under the car
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 5),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    grp.add(shadow);

    this.mesh = grp;
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.driftAmount = 0;
    this.wheelSpin = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  update(dt, input) {
    // ===== Arcade physics =====
    const accel = 22;
    const maxSpeed = 45;
    const reverseMax = -12;
    const braking = 36;
    const drag = 5;

    if (input.gas) {
      this.speed += accel * dt;
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

    // ===== Lock Y to 0 — never fall through the world =====
    this.pos.y = 0;

    // ===== Apply to mesh =====
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;

    // Body lean on turns
    const lean = -this.steer * speedFactor * 0.06;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 6);
    // Pitch on accel/brake
    const pitch = (input.brake && this.speed > 0.5 ? 0.04 : 0) - (input.gas && this.speed > 0.5 ? 0.03 : 0);
    this.mesh.rotation.x += (pitch - this.mesh.rotation.x) * Math.min(1, dt * 6);

    // ===== Wheels spin + steer =====
    this.wheelSpin += this.speed * dt * 2.5;
    this.wheels.forEach(w => {
      // Spin around the wheel's X axis (which we set up via tire.rotation.z)
      w.children[0].rotation.x = this.wheelSpin;   // tire
      w.children[1].rotation.x = this.wheelSpin;   // rim
    });
    this.frontWheels.forEach(w => {
      w.rotation.y = this.steer * 0.4;
    });

    // ===== Brake light =====
    const braking_now = input.brake && this.speed > 0.5;
    this.brakeMat.color.setHex(braking_now ? 0xff2030 : 0x660000);
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
