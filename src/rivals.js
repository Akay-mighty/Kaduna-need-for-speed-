// ============================================================
// rivals.js — AI rival Cybertrucks that follow the track
//
// 3 rivals spawn in a 2x2 grid behind the player at race start.
// Each AI:
//   - Tracks its position along the track centerline (an "arc length" d)
//   - Looks ahead a few meters and steers toward that target point
//   - Accelerates toward its personal top speed (slightly randomized)
//   - Slows down for corners (sampled by checking if the upcoming
//     normal direction differs significantly from current heading)
//   - Has collision with the player (both bounce back)
//   - Has lap tracking (counts laps completed)
//   - Reports position (1st, 2nd, 3rd, 4th) for the HUD
//
// We re-use the same Cybertruck GLB scene, cloned 3 times.
// ============================================================
import * as THREE from 'three';

const SCALE = 0.165;
const LIFT_Y = 1.06;

export class Rivals {
  constructor(scene, city, bodyScene) {
    this.scene = scene;
    this.city = city;
    this.bodyScene = bodyScene;   // the loaded GLTF scene to clone
    this.rivals = [];
    this.enabled = false;
  }

  spawn(playerStartPos, playerStartHeading) {
    this._spawnTime = performance.now();
    // Player starts at trackPath[0]. Grid is just behind on the same straight,
    // offset left/right and a few meters back.
    // Player faces +X (heading = π/2). Back is -X. Left is +Z, right is -Z
    // (because heading π/2 = forward = (sin(π/2), 0, cos(π/2)) = (1, 0, 0), so left = +Z)

    // Compute right vector based on player heading
    const fwd = new THREE.Vector3(Math.sin(playerStartHeading), 0, Math.cos(playerStartHeading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    const colors = [
      { body: 0xff6b35, name: 'Orange' },   // orange
      { body: 0x4a90c4, name: 'Blue' },     // blue
      { body: 0x2d8a3e, name: 'Green' },    // green
    ];

    // Spread the grid BEHIND the player (negative fwd offset) and slightly to the sides.
    // Back further (8-12m) so they don't collide with player at start.
    const grid = [
      { fwd: -8, right:  3 },   // back-left of player
      { fwd: -8, right: -3 },  // back-right of player
      { fwd: -12, right:  0 }, // further back, centered
    ];

    for (let i = 0; i < 3; i++) {
      const g = grid[i];
      const pos = playerStartPos.clone()
        .addScaledVector(fwd, g.fwd)
        .addScaledVector(right, g.right);

      // Clone the body scene
      const body = this.bodyScene.clone(true);
      body.rotation.x = Math.PI / 2;
      body.scale.setScalar(SCALE);
      body.position.y = LIFT_Y;
      // Recolor: override the "Stainless_Steel" material's base color factor
      // (the GLB has 47 materials; we tweak the main steel + black paint to give each rival a tint)
      const tint = new THREE.Color(colors[i].body);
      body.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(m => {
            // Tint the Stainless_Steel and Black_Paint materials
            const name = (m.name || '').toLowerCase();
            if (name.includes('stainless') || name.includes('paint') || name === 'steel') {
              m = m.clone();
              m.color = tint;
              m.emissive = new THREE.Color(tint).multiplyScalar(0.04);
              m.emissiveIntensity = 0.5;
              // Replace in the mesh
              if (Array.isArray(c.material)) {
                const idx = c.material.indexOf(mats[0]);
                c.material[idx] = m;
              } else {
                c.material = m;
              }
            }
          });
        }
      });

      // Parent group
      const grp = new THREE.Group();
      grp.add(body);
      grp.position.copy(pos);
      grp.rotation.y = playerStartHeading;
      this.scene.add(grp);

      // AI state
      const rival = {
        mesh: grp,
        body,
        pos: pos.clone(),
        heading: playerStartHeading,
        speed: 0,
        d: 0,             // arc length along track
        name: colors[i].name,
        color: colors[i].body,
        topSpeed: 38 + Math.random() * 10,    // 38-48 m/s, slightly slower or faster than player (55)
        cornering: 0.85 + Math.random() * 0.2,  // 0.85-1.05 — affects how fast it takes corners
        accel: 18 + Math.random() * 6,
        lapsCompleted: 0,
        nextCp: 0,
        finished: false,
        finishTime: 0,
      };
      this.rivals.push(rival);
    }
    this.enabled = true;
  }

  // Returns true if any rival collided with the player this frame
  update(dt, playerPos, playerRadius = 2.0) {
    if (!this.enabled) return false;
    let playerHit = false;

    for (const r of this.rivals) {
      if (r.finished) continue;

      // ===== AI: find target point ahead on the track =====
      // Look ahead by current speed * 0.5s + base lookahead
      const lookahead = Math.max(5, r.speed * 0.5);
      const targetD = r.d + lookahead;
      const target = this._pointAtDistance(targetD);
      const next = this._pointAtDistance(targetD + 5);

      // Steer toward target
      const dx = target.x - r.pos.x;
      const dz = target.z - r.pos.z;
      const desiredHeading = Math.atan2(dx, dz);

      // Smoothly turn toward desired heading
      let delta = desiredHeading - r.heading;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const turnRate = r.cornering * 3.5;
      r.heading += THREE.MathUtils.clamp(delta, -turnRate * dt, turnRate * dt);

      // ===== Speed control: slow down for sharp corners =====
      // Compare direction to target vs direction to next target
      const dx2 = next.x - target.x;
      const dz2 = next.z - target.z;
      const angle1 = Math.atan2(dx, dz);
      const angle2 = Math.atan2(dx2, dz2);
      let cornerAngle = Math.abs(angle2 - angle1);
      while (cornerAngle > Math.PI) cornerAngle = 2 * Math.PI - cornerAngle;
      // Slow down proportionally to corner sharpness
      const cornerFactor = 1 - Math.min(1, cornerAngle * 2);
      const targetSpeed = r.topSpeed * (0.5 + 0.5 * cornerFactor);

      if (r.speed < targetSpeed) {
        r.speed += r.accel * dt;
      } else {
        r.speed -= 8 * dt;
      }
      r.speed = Math.max(0, Math.min(r.topSpeed, r.speed));

      // ===== Integrate position =====
      const fwd = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
      r.pos.addScaledVector(fwd, r.speed * dt);
      r.pos.y = 0;

      // Update arc length d (find nearest track point)
      r.d = this._nearestD(r.pos);

      // Check lap completion
      const lapLength = this.city.trackPath.length > 0
        ? (this.city.trackPath.length) * (this._trackLength() / this.city.trackPath.length)
        : 0;
      const trackLen = this._trackLength();
      if (r.d > trackLen - 5 && r.nextCp === 0 && r._lastD !== undefined && r._lastD > 50) {
        // Crossed start line forward
        r.lapsCompleted++;
        r.nextCp = 0;
      }
      r._lastD = r.d;

      // Apply to mesh
      r.mesh.position.copy(r.pos);
      r.mesh.rotation.y = r.heading;

      // ===== Collision with player (disabled for first 3s after race start) =====
      if (this._spawnTime && performance.now() - this._spawnTime > 3000) {
        const pdx = r.pos.x - playerPos.x;
        const pdz = r.pos.z - playerPos.z;
        const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
        const minDist = playerRadius + 2.5;
        if (pdist < minDist && pdist > 0.001) {
          const push = (minDist - pdist) / pdist;
          r.pos.x += pdx * push * 0.5;
          r.pos.z += pdz * push * 0.5;
          playerPos.x -= pdx * push * 0.5;
          playerPos.z -= pdz * push * 0.5;
          r.speed *= 0.7;
          playerHit = true;
        }
      }
    }

    return playerHit;
  }

  _trackLength() {
    // Cache track length
    if (this._cachedLength === undefined) {
      let total = 0;
      const path = this.city.trackPath;
      for (let i = 0; i < path.length; i++) {
        const a = path[i];
        const b = path[(i + 1) % path.length];
        total += Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
      }
      this._cachedLength = total;
    }
    return this._cachedLength;
  }

  // Reuse the city's track math (we don't import from city to avoid circular deps — replicate)
  _pointAtDistance(d) {
    // Use the precomputed trackPath
    const path = this.city.trackPath;
    const len = this._trackLength();
    d = ((d % len) + len) % len;
    const segLen = len / path.length;
    const idx = Math.floor(d / segLen);
    const frac = (d - idx * segLen) / segLen;
    const a = path[idx];
    const b = path[(idx + 1) % path.length];
    return { x: a.x + (b.x - a.x) * frac, z: a.z + (b.z - a.z) * frac };
  }

  // Find the arc length d on the track nearest to (x, z)
  _nearestD(pos) {
    const path = this.city.trackPath;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < path.length; i++) {
      const dx = pos.x - path[i].x;
      const dz = pos.z - path[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestDist) { nearestDist = d2; nearestIdx = i; }
    }
    const segLen = this._trackLength() / path.length;
    return nearestIdx * segLen;
  }

  // ===== Race position: returns 1..4 (1 = leading) =====
  // playerD = player's arc length + lapsCompleted * trackLen
  getPlayerPosition(playerD, playerLaps) {
    // Compute total progress for each rival: laps * trackLen + d
    const trackLen = this._trackLength();
    const playerProgress = playerLaps * trackLen + playerD;
    let ahead = 0;
    for (const r of this.rivals) {
      const rivalProgress = r.lapsCompleted * trackLen + r.d;
      if (rivalProgress > playerProgress) ahead++;
    }
    return ahead + 1;  // 1 = first place
  }

  reset() {
    // Remove all rivals
    for (const r of this.rivals) {
      this.scene.remove(r.mesh);
    }
    this.rivals = [];
    this.enabled = false;
    this._cachedLength = undefined;
  }

  // Draw rival dots on the minimap
  drawOnMinimap(ctx, worldToMap) {
    if (!this.enabled) return;
    for (const r of this.rivals) {
      const p = worldToMap(r.pos.x, r.pos.z);
      ctx.fillStyle = '#' + r.color.toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
