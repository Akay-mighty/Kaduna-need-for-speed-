// ============================================================
// boostpads.js — glowing chevrons on the road that give a speed boost
//
// Places 6 boost pads along the straights of the track:
//   - 2 on the top straight (one per direction, since the player drives +X)
//   - 2 on the bottom straight (player drives -X)
//   - Plus 2 more on the straights for variety
//
// When the player drives over a boost pad, a temporary boost is applied
// to the player's speed: maxSpeed multiplier 1.5 for 2.5 seconds.
// The player's speed also gets a small instant kick.
//
// Visual: animated chevron arrows that pulse + a glow trail when active.
// HUD: shows "BOOST!" indicator while active.
// ============================================================
import * as THREE from 'three';
import { TRACK } from './city.js';

const BOOST_DURATION = 2.5;     // seconds of boost
const BOOST_MAXSPEED_MULT = 1.5;
const BOOST_INSTANT_KICK = 8;   // instant m/s added on first contact
const BOOST_PAD_RADIUS = 3;

export class BoostPads {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.pads = [];    // {x, z, mesh, cooldown}
    this.active = false;
    this.activeTimer = 0;
    this.enabled = false;
  }

  spawn() {
    // Place 6 boost pads — 3 on each straight
    const positions = [
      // Top straight (player travels +X)
      { d: 30 },   // 30m into top straight
      { d: 70 },   // mid top straight
      { d: 100 },  // near end of top straight
      // Bottom straight (player travels -X, so d goes 215 → 335)
      { d: 245 },  // 30m into bottom straight
      { d: 285 },  // mid bottom straight
      { d: 320 },  // near end of bottom straight
    ];

    const chevronMat = new THREE.MeshBasicMaterial({
      color: 0xff6b35,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });

    for (const pos of positions) {
      const p = this.city._pointAtDistance(pos.d);
      const nrm = this.city._normalAtDistance(pos.d);
      const dir = new THREE.Vector3(-nrm.nz, 0, nrm.nx);  // travel direction
      const angle = Math.atan2(dir.x, dir.z);

      // Make 3 chevrons (arrows) in a row across the road
      const grp = new THREE.Group();
      const chevronGeo = new THREE.Shape();
      // Build a simple arrow chevron: triangle pointing forward
      chevronGeo.moveTo(0, 1.5);
      chevronGeo.lineTo(-1, -0.5);
      chevronGeo.lineTo(-0.4, -0.5);
      chevronGeo.lineTo(-0.4, -1.5);
      chevronGeo.lineTo(0.4, -1.5);
      chevronGeo.lineTo(0.4, -0.5);
      chevronGeo.lineTo(1, -0.5);
      chevronGeo.lineTo(0, 1.5);
      const chevGeo = new THREE.ShapeGeometry(chevronGeo);

      // 3 chevrons stacked front-to-back, alternating colors
      const orangeMat = chevronMat;
      const yellowMat = new THREE.MeshBasicMaterial({
        color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide
      });
      for (let i = 0; i < 3; i++) {
        const mat = i === 1 ? yellowMat : orangeMat;
        const chev = new THREE.Mesh(chevGeo, mat);
        chev.position.set(0, 0.04, -i * 1.5);
        chev.rotation.x = -Math.PI / 2;
        grp.add(chev);
      }

      // Glow ring under the pad (horizontal disk)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff6b35, transparent: true, opacity: 0.25, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(new THREE.CircleGeometry(BOOST_PAD_RADIUS, 24), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      grp.add(ring);

      grp.position.set(p.x, 0, p.z);
      grp.rotation.y = angle;
      this.scene.add(grp);

      this.pads.push({
        x: p.x, z: p.z,
        mesh: grp,
        ring,
        chevrons: grp.children.filter(c => c.geometry?.type === 'ShapeGeometry'),
        cooldown: 0,
      });
    }
    this.enabled = true;
  }

  // Called every frame. Returns true if the player just got a boost this frame.
  update(dt, t, playerPos, playerSpeed) {
    if (!this.enabled) return false;

    // Update active boost timer
    if (this.active) {
      this.activeTimer -= dt;
      if (this.activeTimer <= 0) this.active = false;
    }

    // Animate all pads
    this.pads.forEach((pad, i) => {
      pad.cooldown = Math.max(0, pad.cooldown - dt);
      // Pulse chevrons
      const pulse = 0.7 + Math.sin(t * 4 + i) * 0.2;
      pad.chevrons.forEach((c, j) => {
        c.material.opacity = 0.5 + pulse * 0.4;
      });
      // Ring pulse
      pad.ring.material.opacity = 0.2 + Math.sin(t * 4 + i) * 0.15;
      pad.ring.scale.setScalar(1.0 + Math.sin(t * 3 + i) * 0.08);
    });

    // Check player collision with any pad (not on cooldown)
    for (const pad of this.pads) {
      if (pad.cooldown > 0) continue;
      const dx = playerPos.x - pad.x;
      const dz = playerPos.z - pad.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < BOOST_PAD_RADIUS) {
        // Trigger boost
        this.active = true;
        this.activeTimer = BOOST_DURATION;
        pad.cooldown = 4;  // 4 seconds before this pad can be triggered again
        return true;
      }
    }
    return false;
  }

  // Returns the current max-speed multiplier (1 = no boost, 1.5 = boosting)
  getSpeedMultiplier() {
    return this.active ? BOOST_MAXSPEED_MULT : 1.0;
  }

  // Returns true if the boost is currently active (for HUD)
  isActive() {
    return this.active;
  }

  // Remaining boost time (for HUD bar)
  remainingTime() {
    return this.activeTimer;
  }

  reset() {
    this.active = false;
    this.activeTimer = 0;
    for (const pad of this.pads) {
      this.scene.remove(pad.mesh);
    }
    this.pads = [];
    this.enabled = false;
  }
}
