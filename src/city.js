// ============================================================
// city.js — Procedural neon NYC-style grid city
// Builds roads, blocks, buildings with emissive neon strips,
// street props (trees, lamps), and decorative billboards
// using the uploaded city-scene.jpg texture as a skybox backdrop.
// ============================================================
import * as THREE from 'three';

const BLOCK = 40;       // city block size (meters)
const ROAD = 12;        // road width
const GRID = 7;         // GRID x GRID blocks => city extent
const HALF = (GRID * (BLOCK + ROAD)) / 2;

export class City {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.lamps = [];
    this.trees = [];
    this.coins = [];
    this.billboards = [];
    this._build();
  }

  _build() {
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildBorder();
    this._spawnCoins();
    this._buildBillboards();
  }

  _buildGround() {
    // Dark asphalt-tinted ground plane
    const g = new THREE.PlaneGeometry(400, 400);
    const m = new THREE.MeshStandardMaterial({
      color: 0x0a0a18, roughness: 0.95, metalness: 0.1
    });
    const plane = new THREE.Mesh(g, m);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.02;
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  _buildRoads() {
    // Glowing road strips along the grid lines
    const span = GRID * (BLOCK + ROAD);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x101028, roughness: 0.6, metalness: 0.2,
      emissive: 0x05d9e8, emissiveIntensity: 0.04
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x05d9e8 });

    for (let i = 0; i <= GRID; i++) {
      const pos = -HALF + i * (BLOCK + ROAD) + BLOCK / 2;

      // Horizontal road
      const rh = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD), roadMat);
      rh.rotation.x = -Math.PI / 2;
      rh.position.set(0, 0, pos);
      rh.receiveShadow = true;
      this.scene.add(rh);

      // Vertical road
      const rv = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, span), roadMat);
      rv.rotation.x = -Math.PI / 2;
      rv.position.set(pos, 0, 0);
      rv.receiveShadow = true;
      this.scene.add(rv);

      // Dashed center stripes (emissive)
      for (let j = 0; j < GRID; j++) {
        const cpos = -HALF + j * (BLOCK + ROAD) + (BLOCK + ROAD) / 2;
        const dashH = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.3), stripeMat);
        dashH.rotation.x = -Math.PI / 2;
        dashH.position.set(cpos, 0.01, pos);
        this.scene.add(dashH);

        const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3), stripeMat);
        dashV.rotation.x = -Math.PI / 2;
        dashV.position.set(pos, 0.01, cpos);
        this.scene.add(dashV);
      }
    }
  }

  _buildBlocks() {
    // For each block (between roads), drop a cluster of buildings
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = -HALF + gx * (BLOCK + ROAD) + (BLOCK + ROAD) / 2;
        const cz = -HALF + gz * (BLOCK + ROAD) + (BLOCK + ROAD) / 2;
        this._buildOneBlock(cx, cz);
      }
    }
  }

  _buildOneBlock(cx, cz) {
    // Skip the central block — that's the spawn area, kept clear
    if (Math.abs(cx) < BLOCK / 2 + 1 && Math.abs(cz) < BLOCK / 2 + 1) {
      this._buildPark(cx, cz);
      return;
    }

    // Sidewalk pad
    const padGeo = new THREE.BoxGeometry(BLOCK, 0.4, BLOCK);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1a30, roughness: 0.8 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(cx, 0.2, cz);
    pad.receiveShadow = true;
    this.scene.add(pad);

    // 2x2 building footprints
    const foot = BLOCK / 2;
    const neonColors = [0xff2a6d, 0x05d9e8, 0xfff15c, 0x9d4edd, 0x06ffa5, 0xff7700];
    for (let bx = 0; bx < 2; bx++) {
      for (let bz = 0; bz < 2; bz++) {
        const px = cx - foot / 2 + bx * foot;
        const pz = cz - foot / 2 + bz * foot;
        const h = 8 + Math.random() * 32;
        const w = foot - 2 - Math.random() * 4;
        const d = foot - 2 - Math.random() * 4;
        const b = this._makeBuilding(w, h, d, neonColors[Math.floor(Math.random() * neonColors.length)]);
        b.position.set(px, 0.4 + h / 2, pz);
        b.castShadow = true;
        b.receiveShadow = true;
        this.scene.add(b);
        this.buildings.push(b);
      }
    }

    // Corner street lamps
    this._addLamp(cx - BLOCK / 2 + 1, cz - BLOCK / 2 + 1);
    this._addLamp(cx + BLOCK / 2 - 1, cz - BLOCK / 2 + 1);
    this._addLamp(cx - BLOCK / 2 + 1, cz + BLOCK / 2 - 1);
    this._addLamp(cx + BLOCK / 2 - 1, cz + BLOCK / 2 - 1);
  }

  _makeBuilding(w, h, d, neon) {
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x202038, roughness: 0.55, metalness: 0.6
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    grp.add(body);

    // Emissive window grid (front + back + sides)
    const winMat = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.85 });
    const rows = Math.max(2, Math.floor(h / 3));
    const cols = Math.max(2, Math.floor(w / 2.5));
    const winGeo = new THREE.PlaneGeometry(0.7, 1.1);

    const sides = [
      { ax: 'x', off: d / 2 + 0.01, rot: [0, Math.PI / 2, 0] },
      { ax: 'x', off: -d / 2 - 0.01, rot: [0, -Math.PI / 2, 0] },
      { ax: 'z', off: w / 2 + 0.01, rot: [0, 0, 0] },
      { ax: 'z', off: -w / 2 - 0.01, rot: [0, Math.PI, 0] }
    ];
    sides.forEach(s => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.25) continue; // sparse dark windows
          const win = new THREE.Mesh(winGeo, winMat);
          const y = -h / 2 + 1.5 + r * 3;
          const x = -w / 2 + 1.5 + c * 2.5;
          if (s.ax === 'x') {
            win.position.set(x, y, s.off);
          } else {
            win.position.set(s.off, y, x);
          }
          win.rotation.set(...s.rot);
          grp.add(win);
        }
      }
    });

    // Rooftop neon trim
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.2, d + 0.4),
      new THREE.MeshBasicMaterial({ color: neon })
    );
    trim.position.y = h / 2 + 0.1;
    grp.add(trim);

    return grp;
  }

  _addLamp(x, z) {
    const grp = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), poleMat);
    pole.position.y = 2.5;
    grp.add(pole);

    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff15c });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), headMat);
    head.position.y = 5;
    grp.add(head);

    // Point light
    const light = new THREE.PointLight(0xfff15c, 0.6, 18, 2);
    light.position.y = 5;
    grp.add(light);

    grp.position.set(x, 0, z);
    this.scene.add(grp);
    this.lamps.push(grp);
  }

  _buildPark(cx, cz) {
    // Central plaza with a glowing ring and trees
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(BLOCK / 2, 48),
      new THREE.MeshStandardMaterial({ color: 0x1a1a30, roughness: 0.8 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0.05, cz);
    this.scene.add(pad);

    // Neon ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(BLOCK / 2 - 4, BLOCK / 2 - 3.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x05d9e8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.07, cz);
    this.scene.add(ring);

    // A few stylized trees
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = BLOCK / 2 - 8;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      this._addTree(x, z);
    }
  }

  _addTree(x, z) {
    const grp = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 })
    );
    trunk.position.y = 1;
    grp.add(trunk);

    const fol = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x06ffa5, emissive: 0x06ffa5, emissiveIntensity: 0.15, roughness: 0.8 })
    );
    fol.position.y = 3;
    grp.add(fol);

    grp.position.set(x, 0, z);
    grp.castShadow = true;
    this.scene.add(grp);
    this.trees.push(grp);
  }

  _buildBorder() {
    // Outer wall of glowing bars so the player can't drive off the map
    const span = GRID * (BLOCK + ROAD);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2a6d });
    const step = 8;
    for (let i = -HALF; i <= HALF; i += step) {
      // North + South
      for (const z of [-HALF, HALF]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), barMat);
        b.position.set(i, 2, z);
        this.scene.add(b);
      }
      // East + West
      for (const x of [-HALF, HALF]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), barMat);
        b.position.set(x, 2, i);
        this.scene.add(b);
      }
    }
  }

  // Collectible coins scattered along the road grid
  _spawnCoins() {
    const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 16);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfff15c, emissive: 0xffd700, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.2
    });
    const total = 40;
    for (let i = 0; i < total; i++) {
      // Pick a random position on a road line (not inside a block)
      const onXAxis = Math.random() > 0.5;
      const lineIdx = Math.floor(Math.random() * (GRID + 1));
      const linePos = -HALF + lineIdx * (BLOCK + ROAD) + BLOCK / 2;
      const along = (Math.random() - 0.5) * (GRID * (BLOCK + ROAD) - 4);

      const coin = new THREE.Mesh(coinGeo, coinMat);
      if (onXAxis) {
        coin.position.set(along, 1.0, linePos);
      } else {
        coin.position.set(linePos, 1.0, along);
      }
      coin.rotation.x = Math.PI / 2;
      coin.userData.collected = false;
      coin.userData.spinPhase = Math.random() * Math.PI * 2;
      this.scene.add(coin);
      this.coins.push(coin);
    }
  }

  _buildBillboards() {
    // Three big billboards around the city showing the supercar art
    const texLoader = new THREE.TextureLoader();
    const imgs = ['/car-rolls.jpg', '/car-orange.jpg', '/car-lambo.jpg'];
    const spots = [
      { x: -HALF + 6, z: 0, ry: Math.PI / 2 },
      { x: 0, z: -HALF + 6, ry: 0 },
      { x: HALF - 6, z: 0, ry: -Math.PI / 2 }
    ];
    imgs.forEach((src, i) => {
      const tex = texLoader.load(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      const bill = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), mat);
      bill.position.set(spots[i].x, 8, spots[i].z);
      bill.rotation.y = spots[i].ry;
      this.scene.add(bill);

      // Glowing frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(10.4, 5.4, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x05d9e8 })
      );
      frame.position.copy(bill.position);
      frame.position.y -= 0.05;
      frame.rotation.y = spots[i].ry;
      this.scene.add(frame);

      // Posts
      for (const sx of [-4, 4]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 8, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.6, roughness: 0.4 })
        );
        const lx = Math.cos(spots[i].ry) * sx;
        const lz = -Math.sin(spots[i].ry) * sx;
        post.position.set(spots[i].x + lx, 4, spots[i].z + lz);
        this.scene.add(post);
      }

      this.billboards.push(bill);
    });
  }

  update(dt, t) {
    // Spin coins
    for (const c of this.coins) {
      if (c.userData.collected) continue;
      c.rotation.z = t * 2 + c.userData.spinPhase;
      c.position.y = 1.0 + Math.sin(t * 3 + c.userData.spinPhase) * 0.15;
    }
  }
}

export const CITY_HALF = HALF;
export const CITY_BLOCK = BLOCK;
export const CITY_ROAD = ROAD;
