// ============================================================
// city.js — Lagos low-poly city circuit
//
// DESIGN:
//   - Procedural closed-loop race track: an oval with rounded corners
//   - Asphalt road mesh (one big extruded plane) with painted lane lines
//   - Concrete barriers on both sides so the player CANNOT fall off
//   - Dense instanced buildings (using imported building.glb at correct
//     scale + procedural colored blocks) lining both sides of the track
//   - Palm trees, street lamps, billboards, taxis scattered around
//   - 8 checkpoints placed along the track centerline
//   - Inner city has blocky buildings + sandy ground; outer ring is water/sand
//
// Coordinate system: Y-up, Z = forward (north). The track runs in the XZ plane.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===== Track dimensions (meters) =====
// Oval track with two straights + two semicircular ends.
export const TRACK = {
  straightLen: 120,   // length of each straight section
  turnRadius: 60,     // radius of the curved ends
  roadWidth: 16,      // width of the drivable road
  barrierHeight: 1.5,
  barrierThick: 1.0,
};

// Derived: total track length (centerline) and bounding box
TRACK.halfStraight = TRACK.straightLen / 2;
TRACK.length = 2 * TRACK.straightLen + 2 * Math.PI * TRACK.turnRadius;
TRACK.bboxMinX = -TRACK.halfStraight - TRACK.turnRadius;
TRACK.bboxMaxX =  TRACK.halfStraight + TRACK.turnRadius;
TRACK.bboxMinZ = -TRACK.turnRadius;
TRACK.bboxMaxZ =  TRACK.turnRadius;

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];        // {x, z, half, ...} — circle-vs-AABB collision boxes
    this.checkpoints = [];
    this.barriers = [];          // visual only
    this.buildings = [];
    this.palms = [];
    this.lamps = [];
    this.cars = [];             // parked taxis
    this.billboards = [];
    this.trackPath = [];        // sampled centerline points (Vector3) for minimap + checkpoint placement
    this.nextCheckpoint = 0;
    this.buildingScene = null;
  }

  async loadAll(onProgress) {
    const loader = new GLTFLoader();
    const report = (n, t) => onProgress && onProgress(n, t);

    report(20, 'Loading buildings…');
    try {
      const bGltf = await loader.loadAsync('/models/building.glb');
      this.buildingScene = bGltf.scene;
    } catch (e) {
      console.warn('Building GLB failed to load, will use procedural only', e);
    }

    report(50, 'Generating track…');
    this._buildGround();
    this._sampleTrackPath();
    this._buildRoad();
    this._buildBarriers();
    this._buildLaneStripes();

    report(70, 'Placing buildings…');
    this._placeInnerCity();
    this._placeTrackSideBuildings();
    this._placeSkylineRing();

    report(85, 'Decorating…');
    this._placePalms();
    this._placeLamps();
    this._placeTaxis();
    this._placeBillboards();

    report(85, 'Placing checkpoints…');
    this._placeCheckpoints();
    report(90, 'Loading Cybertruck…');
  }

  // ===== Ground =====
  _buildGround() {
    // Big sandy ground — covers everything visible from the track
    const sand = new THREE.Mesh(
      new THREE.CircleGeometry(600, 64),
      new THREE.MeshStandardMaterial({ color: 0xd4b97a, roughness: 1.0 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.05;
    sand.receiveShadow = true;
    this.scene.add(sand);

    // Soft circular grass/tarmac pad under the city (visual depth)
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(220, 64),
      new THREE.MeshStandardMaterial({ color: 0xa89968, roughness: 1.0 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.02;
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  // ===== Sample the track centerline (for checkpoints, minimap, etc.) =====
  _sampleTrackPath() {
    // Centerline: start at (-halfStraight, turnR) → straight to (halfStraight, turnR)
    // → semicircle to (halfStraight, -turnR) → straight to (-halfStraight, -turnR)
    // → semicircle back to start. Sample N points around the loop.
    const N = 240;
    const totalLen = TRACK.length;
    let dist = 0;
    for (let i = 0; i < N; i++) {
      const p = this._pointAtDistance(dist);
      this.trackPath.push(new THREE.Vector3(p.x, 0, p.z));
      dist += totalLen / N;
    }
  }

  // Get centerline point at a given arc length from the start.
  // Track is a clockwise oval (viewed from above):
  //   Section 1: top straight, going +X  from (-half, +R) to (+half, +R)
  //   Section 2: right curve, going clockwise from (+half, +R) around the right
  //              end (through +X outer) back to (+half, -R)
  //   Section 3: bottom straight, going -X from (+half, -R) to (-half, -R)
  //   Section 4: left curve, going clockwise from (-half, -R) around the left
  //              end (through -X outer) back to (-half, +R)
  _pointAtDistance(d) {
    const L = TRACK.length;
    d = ((d % L) + L) % L;
    const sLen = TRACK.straightLen;
    const arcLen = Math.PI * TRACK.turnRadius;   // half-circle
    // Section 1: top straight, going +X (length sLen)
    if (d < sLen) {
      return { x: -TRACK.halfStraight + d, z: TRACK.turnRadius };
    }
    d -= sLen;
    // Section 2: right curve (center at +halfStraight, 0)
    // Player goes clockwise: from top (+R, angle=+π/2) through outer +X (angle=0)
    // down to bottom (-R, angle=-π/2). So angle DECREASES from +π/2 to -π/2.
    if (d < arcLen) {
      const a = Math.PI / 2 - (d / arcLen) * Math.PI;
      return {
        x: TRACK.halfStraight + Math.cos(a) * TRACK.turnRadius,
        z: Math.sin(a) * TRACK.turnRadius
      };
    }
    d -= arcLen;
    // Section 3: bottom straight, going -X (length sLen)
    if (d < sLen) {
      return { x: TRACK.halfStraight - d, z: -TRACK.turnRadius };
    }
    d -= sLen;
    // Section 4: left curve (center at -halfStraight, 0)
    // Player goes clockwise: from bottom (-R, angle=-π/2) through outer -X (angle=-π)
    // back up to top (+R, angle=-3π/2 which is equivalent to +π/2).
    // Angle DECREASES from -π/2 to -3π/2.
    const a = -Math.PI / 2 - (d / arcLen) * Math.PI;
    return {
      x: -TRACK.halfStraight + Math.cos(a) * TRACK.turnRadius,
      z: Math.sin(a) * TRACK.turnRadius
    };
  }

  // Outward normal at arc length d (points away from the track centerline, toward the outer barrier)
  _normalAtDistance(d) {
    const L = TRACK.length;
    d = ((d % L) + L) % L;
    const sLen = TRACK.straightLen;
    const arcLen = Math.PI * TRACK.turnRadius;
    if (d < sLen) return { nx: 0, nz: 1 };  // top straight, normal points +Z (outward)
    d -= sLen;
    if (d < arcLen) {
      // Right curve: outward = radial direction from circle center
      const a = Math.PI / 2 - (d / arcLen) * Math.PI;
      return { nx: Math.cos(a), nz: Math.sin(a) };
    }
    d -= arcLen;
    if (d < sLen) return { nx: 0, nz: -1 };  // bottom straight, normal points -Z (outward)
    d -= sLen;
    const a = -Math.PI / 2 - (d / arcLen) * Math.PI;
    return { nx: Math.cos(a), nz: Math.sin(a) };
  }

  // ===== Road mesh =====
  _buildRoad() {
    // One big road plane following the track. We sample the track at high
    // resolution and build a thick strip with vertices on the left and right
    // edges of the drivable road, plus ground (y=0) and a small lip.
    const half = TRACK.roadWidth / 2;
    const N = 400;
    const positions = [];
    const indices = [];
    const normals = [];
    const uvs = [];

    // Top surface vertices
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * TRACK.length;
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      // Left and right edge
      const lx = p.x - nrm.nx * half;
      const lz = p.z - nrm.nz * half;
      const rx = p.x + nrm.nx * half;
      const rz = p.z + nrm.nz * half;
      // Two vertices per row
      positions.push(lx, 0.02, lz);
      positions.push(rx, 0.02, rz);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, i / 8);
      uvs.push(1, i / 8);
    }
    // Triangles — two per row segment
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const dd = (i + 1) * 2 + 1;
      // Winding: ensure normals point up
      indices.push(a, c, b);
      indices.push(b, c, dd);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2a30, roughness: 0.85, metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Sandy shoulders on both sides of the road (so the road doesn't have a hard drop-off)
    const shoulderHalf = half + 2.5;
    const sPositions = [];
    const sIndices = [];
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * TRACK.length;
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      // Inner edge (slightly inside road edge so we overlap and hide seam)
      const ix = p.x - nrm.nx * (half - 0.1);
      const iz = p.z - nrm.nz * (half - 0.1);
      const ox = p.x - nrm.nx * shoulderHalf;
      const oz = p.z - nrm.nz * shoulderHalf;
      sPositions.push(ix, 0.01, iz, ox, 0.01, oz);
      // Other side
      const i2x = p.x + nrm.nx * (half - 0.1);
      const i2z = p.z + nrm.nz * (half - 0.1);
      const o2x = p.x + nrm.nx * shoulderHalf;
      const o2z = p.z + nrm.nz * shoulderHalf;
      sPositions.push(i2x, 0.01, i2z, o2x, 0.01, o2z);
    }
    // Build two strip pairs per row
    for (let i = 0; i < N; i++) {
      const baseL = i * 4;
      const baseR = i * 4 + 2;
      const nextL = (i + 1) * 4;
      const nextR = (i + 1) * 4 + 2;
      // Left shoulder
      sIndices.push(baseL, nextL, baseL + 1);
      sIndices.push(baseL + 1, nextL, nextL + 1);
      // Right shoulder
      sIndices.push(baseR, baseR + 1, nextR);
      sIndices.push(baseR + 1, nextR + 1, nextR);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPositions, 3));
    sGeo.setIndex(sIndices);
    sGeo.computeVertexNormals();
    const sMat = new THREE.MeshStandardMaterial({ color: 0xb8a878, roughness: 1.0 });
    const sMesh = new THREE.Mesh(sGeo, sMat);
    sMesh.receiveShadow = true;
    this.scene.add(sMesh);

    // Start line (white painted across the road at d=0)
    const startP = this._pointAtDistance(0);
    const startN = this._normalAtDistance(0);
    const startGeo = new THREE.PlaneGeometry(TRACK.roadWidth, 1.5);
    const startMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const startLine = new THREE.Mesh(startGeo, startMat);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(startP.x, 0.03, startP.z);
    // Orient across the road (perpendicular to direction of travel)
    const dir = new THREE.Vector3(-startN.nz, 0, startN.nx); // travel direction
    startLine.rotation.z = Math.atan2(dir.x, dir.z);
    this.scene.add(startLine);
  }

  // ===== Lane stripes (center dashed line + edge lines) =====
  _buildLaneStripes() {
    const half = TRACK.roadWidth / 2;
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf4d35e });
    const dashGeo = new THREE.PlaneGeometry(0.3, 2.5);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const edgeGeo = new THREE.PlaneGeometry(0.2, 4);

    // Dashed center line
    const step = 6;
    for (let d = 0; d < TRACK.length; d += step) {
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      const dir = new THREE.Vector3(-nrm.nz, 0, nrm.nx);
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.z = Math.atan2(dir.x, dir.z);
      dash.position.set(p.x, 0.025, p.z);
      this.scene.add(dash);
    }

    // Solid white edge lines on both sides
    for (let side = -1; side <= 1; side += 2) {
      const offset = side * (half - 0.4);
      for (let d = 0; d < TRACK.length; d += 4) {
        const p = this._pointAtDistance(d);
        const nrm = this._normalAtDistance(d);
        const dir = new THREE.Vector3(-nrm.nz, 0, nrm.nx);
        const line = new THREE.Mesh(edgeGeo, edgeMat);
        line.rotation.x = -Math.PI / 2;
        line.rotation.z = Math.atan2(dir.x, dir.z);
        line.position.set(p.x + nrm.nx * offset, 0.025, p.z + nrm.nz * offset);
        this.scene.add(line);
      }
    }
  }

  // ===== Barriers on both sides — concrete Jersey barriers =====
  _buildBarriers() {
    const half = TRACK.roadWidth / 2;
    const bH = TRACK.barrierHeight;
    const bT = TRACK.barrierThick;

    // Build a long barrier as a strip of segments following the track
    const segLen = 4;
    const N = Math.ceil(TRACK.length / segLen);

    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xb0a090, roughness: 0.9, metalness: 0
    });

    for (let side = -1; side <= 1; side += 2) {
      const offset = side * (half + bT / 2);
      for (let i = 0; i < N; i++) {
        const d1 = (i / N) * TRACK.length;
        const d2 = ((i + 1) / N) * TRACK.length;
        const p1 = this._pointAtDistance(d1);
        const p2 = this._pointAtDistance(d2);
        const n1 = this._normalAtDistance(d1);

        // Midpoint and orientation
        const mx = (p1.x + p2.x) / 2 + n1.nx * offset;
        const mz = (p1.z + p2.z) / 2 + n1.nz * offset;
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);

        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(bT, bH, len + 0.1),
          barrierMat
        );
        seg.position.set(mx, bH / 2, mz);
        seg.rotation.y = angle;
        seg.castShadow = true;
        seg.receiveShadow = true;
        this.scene.add(seg);
        this.barriers.push(seg);

        // Collider (small AABB around each segment)
        this.colliders.push({
          x: mx, z: mz, half: Math.max(bT, len) / 2 + 0.5,
          minX: mx - bT, maxX: mx + bT,
          minZ: mz - (len + 0.1) / 2, maxZ: mz + (len + 0.1) / 2,
          // We'll use the segment center + half-width as the actual collider; collision resolution below is approximate
        });
      }
    }
  }

  // ===== Buildings inside the track oval (inner field) =====
  _placeInnerCity() {
    // Fill the inner oval with a grid of low-poly buildings.
    // The inner area is: x in [-halfStraight, halfStraight], z in [-turnR, turnR]
    // We want to leave a 6m gap from the inside of the road for visibility + safety.
    const inset = 6;
    const innerMinX = -TRACK.halfStraight + inset;
    const innerMaxX =  TRACK.halfStraight - inset;
    const innerMinZ = -TRACK.turnRadius + inset;
    const innerMaxZ =  TRACK.turnRadius - inset;

    const block = 14;   // building footprint ~12m + 2m gap
    const cols = Math.floor((innerMaxX - innerMinX) / block);
    const rows = Math.floor((innerMaxZ - innerMinZ) / block);

    const lagosColors = [
      0xf5d7a0,  // cream
      0xe8a06a,  // terracotta
      0x4a90c4,  // blue
      0x6fae8a,  // green
      0xd8d2c4,  // off-white
      0xc87050,  // rust
      0xb0c4a8,  // sage
      0xe0d090,  // mustard
    ];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Skip a few cells to leave room for "streets" / plazas
        if (Math.random() < 0.18) continue;

        const x = innerMinX + (c + 0.5) * block + (Math.random() - 0.5) * 2;
        const z = innerMinZ + (r + 0.5) * block + (Math.random() - 0.5) * 2;

        // Skip if inside an end-cap circle (where x is beyond straight section)
        if (Math.abs(x) > TRACK.halfStraight) {
          // Check if inside the curve circle
          const cx = Math.sign(x) * TRACK.halfStraight;
          const dist = Math.sqrt((x - cx) ** 2 + z ** 2);
          if (dist > TRACK.turnRadius - inset) continue;
        }

        const w = 8 + Math.random() * 4;
        const d = 8 + Math.random() * 4;
        const h = 8 + Math.random() * 24;
        const color = lagosColors[Math.floor(Math.random() * lagosColors.length)];

        this._makeBuilding(x, z, w, h, d, color);
      }
    }
  }

  // ===== Buildings outside the track (denser ring) =====
  _placeTrackSideBuildings() {
    // Place buildings just outside the barriers on both sides, all the way around
    const N = 80;
    for (let i = 0; i < N; i++) {
      const d = (i / N) * TRACK.length;
      const side = i % 2 === 0 ? 1 : -1;
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);

      // Offset: outside barrier + a bit of room
      const off = TRACK.roadWidth / 2 + 5 + Math.random() * 12;
      const x = p.x + nrm.nx * off;
      const z = p.z + nrm.nz * off;
      if (Math.abs(x) > 200 || Math.abs(z) > 200) continue;

      const lagosColors = [0xf5d7a0, 0xe8a06a, 0x4a90c4, 0x6fae8a, 0xd8d2c4, 0xc87050, 0xb0c4a8];
      const w = 8 + Math.random() * 5;
      const dpt = 8 + Math.random() * 5;
      const h = 10 + Math.random() * 28;
      this._makeBuilding(x, z, w, h, dpt, lagosColors[Math.floor(Math.random() * lagosColors.length)]);
    }
  }

  // ===== Distant skyline ring (using the imported buildings.glb as decoration) =====
  _placeSkylineRing() {
    if (!this.buildingScene) return;
    // Clone the imported city cluster as a distant ring around the track
    const ringR = 200;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const x = Math.cos(a) * ringR;
      const z = Math.sin(a) * ringR;
      const b = this.buildingScene.clone(true);
      b.position.set(x, 0, z);
      b.scale.setScalar(2.5);
      b.rotation.y = -a;
      b.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
      this.scene.add(b);
    }
  }

  // ===== Make a single procedural building box =====
  _makeBuilding(x, z, w, h, d, color) {
    const grp = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.85, metalness: 0.05
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    // Roof slab (slightly darker, slightly larger)
    const roofColor = new THREE.Color(color).multiplyScalar(0.7);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6),
      new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9 })
    );
    roof.position.y = h + 0.3;
    roof.castShadow = true;
    grp.add(roof);

    // Window grid — emissive dark-blue rectangles on all 4 sides
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x2a4060, emissive: 0x1a2030, emissiveIntensity: 0.4,
      roughness: 0.4, metalness: 0.5
    });
    const winGeoH = new THREE.PlaneGeometry(1.2, 1.4);
    const rows = Math.max(2, Math.floor(h / 3));
    const cols = Math.max(2, Math.floor(w / 2.5));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.15) continue;  // sparse dark windows
        const wx = -w / 2 + 1.5 + c * 2.5;
        const wy = 1.5 + r * 3;
        // Front + back
        for (const zoff of [d / 2 + 0.01, -d / 2 - 0.01]) {
          const win = new THREE.Mesh(winGeoH, winMat);
          win.position.set(wx, wy, zoff);
          if (zoff < 0) win.rotation.y = Math.PI;
          grp.add(win);
        }
        // Left + right
        if (wy < h - 1) {
          for (const xoff of [w / 2 + 0.01, -w / 2 - 0.01]) {
            const win = new THREE.Mesh(winGeoH, winMat);
            win.position.set(xoff, wy, -(-w / 2 + 1.5 + c * 2.5) * 0);  // simplify: just place at center column
            // Actually for sides, distribute along Z
            const wz = -d / 2 + 1.5 + c * 2.5;
            if (wz > d / 2 - 0.5) continue;
            win.position.set(xoff, wy, wz);
            win.rotation.y = xoff > 0 ? Math.PI / 2 : -Math.PI / 2;
            grp.add(win);
          }
        }
      }
    }

    // Sometimes a rooftop water tank (Lagos signature)
    if (Math.random() < 0.35) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x88aabb, roughness: 0.7 })
      );
      tank.position.set((Math.random() - 0.5) * w * 0.5, h + 1.5, (Math.random() - 0.5) * d * 0.5);
      tank.castShadow = true;
      grp.add(tank);
    }

    grp.position.set(x, 0, z);
    grp.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(grp);
    this.buildings.push(grp);

    // Collider: AABB covering the building footprint
    this.colliders.push({
      x, z, half: Math.max(w, d) / 2 + 0.3,
      minX: x - w / 2 - 0.3, maxX: x + w / 2 + 0.3,
      minZ: z - d / 2 - 0.3, maxZ: z + d / 2 + 0.3,
    });
    return grp;
  }

  // ===== Palm trees =====
  _placePalms() {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6a3f, roughness: 0.95 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2d8a3e, roughness: 0.7 });
    const frondGeo = new THREE.ConeGeometry(1.5, 4, 5);

    // Place palms along the inside edge of the track (between barrier and inner buildings)
    for (let d = 0; d < TRACK.length; d += 12) {
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      const side = (Math.floor(d / 12) % 2 === 0) ? -1 : 1;
      const off = side * (TRACK.roadWidth / 2 + 2.5);
      const x = p.x + nrm.nx * off;
      const z = p.z + nrm.nz * off;

      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.5;
      trunk.castShadow = true;
      grp.add(trunk);
      for (let f = 0; f < 6; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.y = 5.5;
        frond.rotation.z = Math.PI / 4 + Math.random() * 0.2;
        frond.rotation.y = (f / 6) * Math.PI * 2 + Math.random() * 0.4;
        frond.position.x = Math.cos(frond.rotation.y) * 0.6;
        frond.position.z = Math.sin(frond.rotation.y) * 0.6;
        frond.scale.set(0.7, 0.6, 0.7);
        frond.castShadow = true;
        grp.add(frond);
      }
      grp.position.set(x, 0, z);
      grp.scale.setScalar(0.9 + Math.random() * 0.3);
      this.scene.add(grp);
      this.palms.push(grp);
    }
  }

  // ===== Street lamps along the track =====
  _placeLamps() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x303040, metalness: 0.7, roughness: 0.4 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff8d0 });

    for (let d = 0; d < TRACK.length; d += 20) {
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      // Alternate sides
      const side = (Math.floor(d / 20) % 2 === 0) ? 1 : -1;
      const off = side * (TRACK.roadWidth / 2 + 1.5);
      const x = p.x + nrm.nx * off;
      const z = p.z + nrm.nz * off;

      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 8), poleMat);
      pole.position.y = 3;
      pole.castShadow = true;
      grp.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 0.15), poleMat);
      arm.position.set(-side * 0.75 * (nrm.nz < 0 ? -1 : 1) * 0, 5.8, 0);
      // Actually keep simple: just a head at the top
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), headMat);
      head.position.y = 6;
      grp.add(head);
      const light = new THREE.PointLight(0xfff8d0, 0.6, 18, 2);
      light.position.y = 6;
      grp.add(light);

      grp.position.set(x, 0, z);
      this.scene.add(grp);
      this.lamps.push(grp);
    }
  }

  // ===== Parked yellow taxis (Lagos flavor) =====
  _placeTaxis() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5, metalness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    for (let i = 0; i < 14; i++) {
      const d = (i / 14) * TRACK.length;
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      // Place on the inside of the track, just inside the barrier (parked)
      const off = -1 * (TRACK.roadWidth / 2 - 1.5);
      const x = p.x + nrm.nx * off;
      const z = p.z + nrm.nz * off;

      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4.2), bodyMat);
      body.position.y = 0.7;
      body.castShadow = true;
      grp.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.0), roofMat);
      roof.position.y = 1.5;
      roof.position.z = -0.2;
      grp.add(roof);
      // Taxi sign on roof
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.2, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      );
      sign.position.y = 1.9;
      grp.add(sign);

      grp.position.set(x, 0, z);
      // Face along the track direction
      const dir = new THREE.Vector3(-nrm.nz, 0, nrm.nx);
      grp.rotation.y = Math.atan2(dir.x, dir.z);
      this.scene.add(grp);
      this.cars.push(grp);
    }
  }

  // ===== Billboards (rotating ads) =====
  _placeBillboards() {
    const adColors = [0xff6b35, 0x4a90c4, 0xffd23f, 0x6fae8a, 0xc87050];
    for (let i = 0; i < 8; i++) {
      const d = (i / 8) * TRACK.length + 15;
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      const off = (i % 2 === 0 ? 1 : -1) * (TRACK.roadWidth / 2 + 6);
      const x = p.x + nrm.nx * off;
      const z = p.z + nrm.nz * off;

      const grp = new THREE.Group();
      // 2 posts
      for (const sx of [-2, 2]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 6, 0.3),
          new THREE.MeshStandardMaterial({ color: 0x303030, metalness: 0.6, roughness: 0.4 })
        );
        post.position.set(sx, 3, 0);
        post.castShadow = true;
        grp.add(post);
      }
      // Panel
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(5, 2.5, 0.2),
        new THREE.MeshStandardMaterial({
          color: adColors[i % adColors.length],
          emissive: adColors[i % adColors.length],
          emissiveIntensity: 0.2,
          roughness: 0.5
        })
      );
      panel.position.y = 6.5;
      grp.add(panel);

      grp.position.set(x, 0, z);
      // Face the track
      grp.rotation.y = Math.atan2(-nrm.nx, -nrm.nz);
      this.scene.add(grp);
      this.billboards.push(grp);
    }
  }

  // ===== Checkpoints — 8 evenly spaced gold rings along the track =====
  _placeCheckpoints() {
    const cpCount = 8;
    for (let i = 0; i < cpCount; i++) {
      const d = (i / cpCount) * TRACK.length + 5;  // small offset so cp0 isn't at start line
      const p = this._pointAtDistance(d);
      const nrm = this._normalAtDistance(d);
      // Ring stands upright across the road
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3, 0.3, 12, 32),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x00ff88 : 0xffd23f,
          transparent: true, opacity: 0.9, side: THREE.DoubleSide
        })
      );
      ring.position.set(p.x, 3, p.z);
      // Face along the track direction (perpendicular to the normal)
      const dir = new THREE.Vector3(-nrm.nz, 0, nrm.nx);
      ring.rotation.y = Math.atan2(dir.x, dir.z);
      ring.userData.index = i;
      this.scene.add(ring);
      this.checkpoints.push({ x: p.x, z: p.z, ring, index: i });
    }
    this.nextCheckpoint = 0;
  }

  // ===== Per-frame animation =====
  update(dt, t) {
    // Animate checkpoints
    this.checkpoints.forEach((cp, i) => {
      const isNext = i === this.nextCheckpoint;
      const ring = cp.ring;
      ring.material.opacity = isNext ? 0.7 + Math.sin(t * 5) * 0.25 : 0.4;
      ring.rotation.y += dt * (isNext ? 1.5 : 0.4);
      const s = isNext ? 1.0 + Math.sin(t * 5) * 0.06 : 1.0;
      ring.scale.set(s, s, s);
    });

    // Palms sway gently
    this.palms.forEach((p, i) => {
      p.children[0].rotation.z = Math.sin(t * 1.2 + i * 0.3) * 0.05;
    });
  }

  // ===== Collision resolution =====
  // Returns true if the player penetrated any collider this frame; mutates pos to push out.
  resolveCollision(pos, radius = 1.5) {
    let hit = false;
    let hitNormal = null;
    for (const c of this.colliders) {
      // Find closest point on the AABB to (pos.x, pos.z)
      const cx = Math.max(c.minX, Math.min(c.maxX, pos.x));
      const cz = Math.max(c.minZ, Math.min(c.maxZ, pos.z));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = (radius - dist) / dist;
        if (dist < 0.0001) {
          // Player center is inside the box — push out along the smallest penetration axis
          const penX = Math.min(pos.x - c.minX, c.maxX - pos.x);
          const penZ = Math.min(pos.z - c.minZ, c.maxZ - pos.z);
          if (penX < penZ) {
            pos.x += (pos.x < c.x ? -1 : 1) * (penX + radius);
          } else {
            pos.z += (pos.z < c.z ? -1 : 1) * (penZ + radius);
          }
        } else {
          pos.x += dx * push;
          pos.z += dz * push;
        }
        hit = true;
        hitNormal = new THREE.Vector2(dx, dz).normalize();
      }
    }
    return { hit, normal: hitNormal };
  }

  // ===== World bounds — keep the player on the track oval =====
  // If the player somehow escapes the barriers, snap them back to the nearest track point.
  clampToTrack(pos) {
    // Find nearest track centerline point and clamp to within roadWidth/2 + barrier
    let nearest = null;
    let nearestDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < this.trackPath.length; i++) {
      const tp = this.trackPath[i];
      const dx = pos.x - tp.x;
      const dz = pos.z - tp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestDist) { nearestDist = d2; nearest = tp; nearestIdx = i; }
    }
    const limit = TRACK.roadWidth / 2 + 0.5;  // tight to the road (barriers do the actual work, this is a safety net)
    if (nearest) {
      const dx = pos.x - nearest.x;
      const dz = pos.z - nearest.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > limit) {
        const f = limit / dist;
        pos.x = nearest.x + dx * f;
        pos.z = nearest.z + dz * f;
        return true;
      }
    }
    return false;
  }
}
