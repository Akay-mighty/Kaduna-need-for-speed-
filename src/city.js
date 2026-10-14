// ============================================================
// city.js — Lagos-style low-poly city assembled from:
//   - Modular road pieces (roads.glb, ~30 meshes) → grid of road tiles
//   - Textured building (building.glb, 282 meshes) → instances at intersections
//   - Background skyline (buildings.glb, 22 primitives) → ring around map
//   - Palm trees + yellow taxis (procedural) → Lagos flavor
//
// Road grid layout: 5x5 blocks, each block ~40m, road tile ~10m.
// Player Jeep (scale 30) drives on the road grid.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TILE = 10;          // one road tile = 10m
const GRID = 16;          // 16x16 tiles
const HALF = (GRID * TILE) / 2;
const ROAD_SCALE = 30;    // road mesh native ~0.4 → tile of ~12m (a bit of overlap)
const BUILDING_SCALE = 25;
const JEEP_SCALE = 30;

export class City {
  constructor(scene) {
    this.scene = scene;
    this.roadMesh = null;
    this.buildingScene = null;
    this.skylineMesh = null;
    this.colliders = []; // {minX, maxX, minZ, maxZ} for buildings
    this.checkpoints = [];
    this.palms = [];
    this.taxis = [];
    this.tarmacMesh = null;
  }

  async loadAll(onProgress) {
    const loader = new GLTFLoader();
    const report = (n, t) => onProgress && onProgress(n, t);

    report(15, 'Loading road kit…');
    const roadsGltf = await loader.loadAsync('/models/roads.glb');
    this._extractRoadMesh(roadsGltf);

    report(45, 'Loading building model…');
    const bGltf = await loader.loadAsync('/models/building.glb');
    this.buildingScene = bGltf.scene;

    report(70, 'Loading skyline…');
    const sGltf = await loader.loadAsync('/models/buildings.glb');
    this.skylineMesh = sGltf.scene;

    report(85, 'Assembling city…');
    this._buildTarmac();
    this._placeRoads();
    this._placeBuildings();
    this._placeSkyline();
    this._placePalms();
    this._placeTaxis();
    this._defineCheckpoints();
    report(100, 'Done');
  }

  _extractRoadMesh(gltf) {
    // Pick the "Road Flat" mesh from the kit
    const target = gltf.scene.children.find(c => c.name === 'Road Flat') || gltf.scene.children[0];
    // The FBX2glTF output stores each mesh as a Group with multiple Mesh children — clone the whole group
    this.roadSource = target.clone(true);
    this.roadSource.traverse(c => {
      c.castShadow = false;
      c.receiveShadow = true;
    });
  }

  _buildTarmac() {
    // Big warm-concrete ground plane under everything
    const geo = new THREE.PlaneGeometry(GRID * TILE + 40, GRID * TILE + 40);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb8a878,  // warm sand/concrete
      roughness: 0.95, metalness: 0.0
    });
    this.tarmacMesh = new THREE.Mesh(geo, mat);
    this.tarmacMesh.rotation.x = -Math.PI / 2;
    this.tarmacMesh.position.y = -0.02;
    this.tarmacMesh.receiveShadow = true;
    this.scene.add(this.tarmacMesh);

    // A circular sandy ground around the city
    const sandGeo = new THREE.CircleGeometry(HALF * 2.2, 64);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xd4b97a, roughness: 1.0 });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.05;
    sand.receiveShadow = true;
    this.scene.add(sand);
  }

  _placeRoads() {
    // Lay down a full grid of road tiles
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const x = -HALF + gx * TILE + TILE / 2;
        const z = -HALF + gz * TILE + TILE / 2;
        const tile = this.roadSource.clone(true);
        tile.position.set(x, 0, z);
        tile.scale.setScalar(ROAD_SCALE);
        tile.rotation.y = (Math.random() < 0.5) ? 0 : Math.PI / 2;
        this.scene.add(tile);
      }
    }
  }

  _placeBuildings() {
    // Place the textured building at every 4th road intersection (leaving room for the road grid)
    const positions = [];
    for (let bx = 0; bx < 4; bx++) {
      for (let bz = 0; bz < 4; bz++) {
        const x = -HALF + (bx + 0.5) * (GRID * TILE / 4);
        const z = -HALF + (bz + 0.5) * (GRID * TILE / 4);
        positions.push({ x, z });
      }
    }

    positions.forEach((p, i) => {
      const b = this.buildingScene.clone(true);
      b.position.set(p.x, 0, p.z);
      b.scale.setScalar(BUILDING_SCALE);
      b.rotation.y = (i * 37) % 360 * Math.PI / 180;
      b.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      this.scene.add(b);

      // Compute collider AABB from world bounds
      // Building native bounds are ~0.08m → scaled to ~2m. Use generous collider.
      const halfBox = 5;  // generous hitbox for the building cluster
      this.colliders.push({
        x: p.x, z: p.z, half: halfBox,
        minX: p.x - halfBox, maxX: p.x + halfBox,
        minZ: p.z - halfBox, maxZ: p.z + halfBox,
      });
    });
  }

  _placeSkyline() {
    // Ring the city with the 22-building cluster from the USDZ — pure decoration
    const radius = HALF + 30;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const s = this.skylineMesh.clone(true);
      s.position.set(x, 0, z);
      s.scale.setScalar(8);
      s.rotation.y = -angle;
      s.traverse(c => {
        if (c.isMesh) {
          c.castShadow = false;
          c.receiveShadow = false;
        }
      });
      this.scene.add(s);
    }
  }

  _placePalms() {
    // Stylized palm trees along the sidewalks (every other block boundary)
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6a3f, roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2d8a3e, roughness: 0.7 });
    const frondGeo = new THREE.ConeGeometry(1.5, 4, 5);

    for (let i = 0; i < 40; i++) {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.5;
      trunk.castShadow = true;
      grp.add(trunk);

      // 5 fronds on top
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.y = 5.5;
        frond.rotation.z = Math.PI / 4 + Math.random() * 0.3;
        frond.rotation.y = (f / 5) * Math.PI * 2;
        frond.position.x = Math.cos((f / 5) * Math.PI * 2) * 0.5;
        frond.position.z = Math.sin((f / 5) * Math.PI * 2) * 0.5;
        frond.scale.set(0.6, 0.6, 0.6);
        frond.castShadow = true;
        grp.add(frond);
      }

      // Place at edge of map on a ring
      const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.2;
      const r = HALF + 5 + Math.random() * 8;
      grp.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      grp.rotation.y = Math.random() * Math.PI * 2;
      grp.scale.setScalar(0.8 + Math.random() * 0.6);
      this.scene.add(grp);
      this.palms.push(grp);
    }
  }

  _placeTaxis() {
    // Yellow "taxi" boxes parked on the sides of roads
    const taxiBody = new THREE.BoxGeometry(2, 1, 4.2);
    const taxiMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5, metalness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    for (let i = 0; i < 18; i++) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(taxiBody, taxiMat);
      body.position.y = 0.7;
      body.castShadow = true;
      grp.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.0), roofMat);
      roof.position.y = 1.5;
      roof.position.z = -0.2;
      grp.add(roof);

      // Place along roads (avoid building blocks)
      let x, z;
      let tries = 0;
      do {
        x = -HALF + Math.random() * (GRID * TILE);
        z = -HALF + Math.random() * (GRID * TILE);
        tries++;
      } while (this._isInBuilding(x, z) && tries < 10);

      grp.position.set(x, 0, z);
      grp.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(grp);
      this.taxis.push(grp);

      // Collider so you can bump into taxis
      this.colliders.push({
        x, z, half: 2.2,
        minX: x - 2.2, maxX: x + 2.2,
        minZ: z - 2.2, maxZ: z + 2.2,
      });
    }
  }

  _isInBuilding(x, z) {
    for (const c of this.colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
    return false;
  }

  // ===== Checkpoints — a ring road around the perimeter, with rings =====
  _defineCheckpoints() {
    // Pick 8 checkpoint positions around the perimeter of the road grid
    const r = HALF - TILE;     // just inside the outer ring of road
    const cpCount = 8;
    for (let i = 0; i < cpCount; i++) {
      const a = (i / cpCount) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Visual: glowing torus ring standing on the road
      const ringGeo = new THREE.TorusGeometry(2.5, 0.35, 12, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00ff88 : 0xffd23f,
        transparent: true, opacity: 0.9, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, 0, z);
      ring.rotation.x = Math.PI / 2;  // lie flat on the road? or stand?
      // Stand the ring upright, facing along the road direction
      ring.rotation.x = 0;
      ring.rotation.y = -a + Math.PI / 2;
      ring.userData.index = i;
      ring.userData.hit = false;
      this.scene.add(ring);
      this.checkpoints.push({ x, z, ring, index: i });
    }
    // The race direction: counter-clockwise (matches the angle increment)
    this.nextCheckpoint = 0;
  }

  update(dt, t) {
    // Animate checkpoints
    this.checkpoints.forEach((cp, i) => {
      const isNext = i === this.nextCheckpoint;
      const ring = cp.ring;
      ring.material.opacity = isNext ? 0.6 + Math.sin(t * 5) * 0.3 : 0.35;
      ring.rotation.y += dt * (isNext ? 1.5 : 0.3);
      ring.scale.setScalar(isNext ? 1.0 + Math.sin(t * 5) * 0.08 : 1.0);
    });

    // Palms sway
    this.palms.forEach((p, i) => {
      p.children[0].rotation.z = Math.sin(t * 1.5 + i) * 0.04;
    });
  }

  // ===== Collision: returns corrected position & velocity reflection =====
  resolveCollision(pos, radius = 1.5) {
    let hit = false;
    for (const c of this.colliders) {
      // Player is at (pos.x, pos.z). Building is a square box at (c.x, c.z) with half-size c.half.
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const closestX = c.x + Math.max(-c.half, Math.min(c.half, dx));
      const closestZ = c.z + Math.max(-c.half, Math.min(c.half, dz));
      const distX = pos.x - closestX;
      const distZ = pos.z - closestZ;
      const distSq = distX * distX + distZ * distZ;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = (radius - dist) / dist;
        pos.x += distX * push;
        pos.z += distZ * push;
        hit = true;
      }
    }
    return hit;
  }
}

export const CITY_HALF = HALF;
export const CITY_TILE = TILE;
export const CITY_GRID = GRID;
