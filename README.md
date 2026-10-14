# LAGOS DRIFT — Low-Poly Checkpoint Racer

A Vercel-deployable 3D driving game built with **Three.js** + **Vite**. Drive a real low-poly Jeep (FBX-converted to-GLB) through a city assembled from your uploaded modular road pieces and textured buildings. Hit 8 checkpoints × 3 laps to bank your best time.

---

## What makes this real

Unlike a procedurally-generated demo, this game is built from **your actual uploaded 3D assets**:

| Your upload | What it became in the game |
|------------|----------------------------|
| `low-poly-truck-car-drifter.zip` → `Jeep_done.fbx` | The player's car. Wheels are found by name (`Front_wheel`, `Rear_wheel`) and **spin** based on speed, front wheels **steer**. Body material recolored to Lagos yellow. Headlights + taillights added. |
| `low-poly-building.zip` → modular building FBX (13 PBR textures) | **16 instances** placed at city block corners, each with full PBR materials (foundation, walls, windows, doors, awnings, roof, stairs, flower boxes). Acts as the city skyline. |
| `low-poly-modular-roads.zip` → 32 road pieces | The `Road Flat` mesh is **instanced 256 times** across a 16×16 grid to form the city's road surface. |
| `Low-poly_City_Buildings.usdz` → 22-mesh city cluster | **12 instances** arranged in a ring around the city as a distant skyline. |

### Why GLB?

FBX and USDZ can't be loaded by Three.js in a browser. The project ships with a **conversion pipeline** that turned your FBX → GLB (via `FBX2glTF`) and your USDZ → GLB (via a custom Python script using Pixar's USD library). All 4 GLBs are in `public/models/` — pure static assets, served as-is.

---

## Game features

- **Real 3D models** loaded with Three.js `GLTFLoader` (no procedural boxes for the player or environment)
- **Arcade physics** with throttle, brake, reverse, speed-sensitive steering, drift on `SPACE`, body lean on turns
- **Collision detection** — circle-vs-AABB against 16 building colliders + 18 taxi cabs
- **Checkpoint race** — 8 glowing rings around the perimeter, 3 laps, counter-clockwise
- **Lap timing** — current lap, last lap, best lap; **best lap saved to `localStorage`**
- **3 camera modes** (cycle with `C`): chase / hood / cinematic
- **Live minimap** with checkpoints + player position + heading arrow
- **Screen-space checkpoint arrow** pointing to the next ring
- **Procedural audio** (WebAudio, no samples needed): engine RPM that tracks speed, wind noise, drift screech, checkpoint chimes
- **Mobile touch controls** auto-enabled on touch devices
- **Lagos daytime vibe**: gradient sky shader, warm sun, palm trees, yellow taxis, sand ring around the city, drifting clouds

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Accelerate | `W` or `↑` | GO button |
| Brake / Reverse | `S` or `↓` | BRK button |
| Steer Left | `A` or `←` | ◀ button |
| Steer Right | `D` or `→` | ▶ button |
| Drift | `SPACE` | DRIFT button |
| Cycle camera | `C` | — |

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to /dist
npm run preview  # preview production build
```

## Deploy to Vercel

The included `vercel.json` is pre-configured: `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`.

**Dashboard:** push this folder to a git repo → Vercel → New Project → import → Deploy.

**CLI:**
```bash
npm i -g vercel
vercel --prod
```

## How it was built

If you want to re-convert the source FBX/USDZ assets, the conversion scripts are in `/scripts/` (in the source zip's parent directory, not in this Vercel-deployable bundle):

```bash
# FBX → GLB (uses fbx2gltf npm package)
FBX2glTF -i Jeep_done.fbx -o jeep -b
FBX2glTF -i building.fbx -o building -b
FBX2glTF -i roads.fbx -o roads -b

# USDZ → GLB (uses Pixar USD via `pip install usd-core`)
python3 usdz_to_glb.py
```

## Project structure

```
lagos-drift/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── README.md
├── public/
│   └── models/
│       ├── jeep.glb         769 KB   — player car
│       ├── building.glb      933 KB   — modular textured building
│       ├── buildings.glb     472 KB   — 22-mesh skyline cluster
│       └── roads.glb         4 MB     — 32 road piece kit
└── src/
    ├── main.js               — bootstrap (loader → start screen → race)
    ├── game.js               — scene, lights, sky, render loop, HUD, race flow
    ├── city.js               — assembles roads, buildings, palms, taxis, checkpoints
    ├── player.js             — Jeep model + arcade physics + wheel spin
    ├── camera.js             — chase / hood / cinematic camera
    ├── input.js              — keyboard + touch
    ├── audio.js              — procedural WebAudio engine + drift
    └── race.js               — checkpoint state machine + lap timer
```

## Tech

- [three.js](https://threejs.org/) ~0.160 (GLTFLoader, MeshStandardMaterial, shadows, fog)
- [Vite](https://vitejs.dev/) 5
- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) for FBX conversion
- [Pixar USD](https://openusd.org/) (`usd-core` Python package) for USDZ conversion
- 100% static — no backend, no API keys, no external runtime assets beyond the 4 bundled GLBs

## License

Code: MIT. The 3D models belong to their respective creators (uploaded by the user) and are used here only as game assets in this single Vercel-deployable bundle.
