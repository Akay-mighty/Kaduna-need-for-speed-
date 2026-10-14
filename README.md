# LAGOS DRIFT — Low-Poly Checkpoint Racer (v3 — fixed)

A Vercel-deployable 3D driving game built with **Three.js** + **Vite**. Drive a low-poly Jeep around a closed-loop Lagos city circuit. 3 laps, 8 gold-ring checkpoints, best-lap saved to localStorage.

---

## What changed in v3 (the fix)

The previous version had five critical bugs that made the live deployment look broken:

| Bug | Root cause | Fix |
|---|---|---|
| Almost empty blue world | The imported `jeep.glb` had broken nested scales from `FBX2glTF` (root scale [300,100,50], children with scale 50/55/27 at translations of 1.55/1.27 — world-space wheels ended up hundreds of meters from the body). Applying `JEEP_SCALE=30` on top of that made the car a 600m-wide mess, with only "a tiny black object on the edge" visible. | **Replaced the imported Jeep with a clean procedural low-poly Jeep** built from boxes (chassis + body + hood + cabin + roll bar + windshield + bumpers + grille + 4 spinning wheels + spare tire + fender flares + headlights + taillights). Looks like a Jeep, drives like a Jeep, fully controllable. |
| Broken / incomplete track | The `roads.glb` was instanced 256× across a grid, but its native scale was wrong and the orientation was random (90° rotation per tile). Resulted in disconnected random tiles. | **Replaced with a procedurally generated oval track** — a single continuous road mesh following a sampled centerline (2 straights + 2 half-circle ends, 617m total length). Lane stripes, edge lines, and start line all painted on the road. |
| Two large white circles in the sky | A `CircleGeometry` "sun disc" + cloud puffs placed too close to the camera rendered as giant white blobs. | **Removed the sun disc.** Sky is now a clean 3-color gradient shader (top blue, mid light blue, horizon warm). Clouds are placed far from the camera. |
| Camera pointing at sky / showing underside | Chase camera offset could go below the road when player pitched, and the look-at target wasn't clamped. | **Camera Y is clamped to ≥ 2.5**, look-at Y clamped to ≥ 0.5, and a `high` mode replaced the `cinematic` mode (which used to swing into the void). Player Y is locked to 0 so the car can never fall through the world. |
| Missing Lagos city | Only 16 instances of the imported building GLB, all at the same scale, far from the track. | **Procedurally generated dense Lagos city**: ~50 inner-city buildings in cream/terracotta/blue/green/rust, ~80 track-side buildings, palm trees every 12m along the track, street lamps every 20m, 14 parked yellow taxis, 8 colored billboards, distant skyline ring from the imported `buildings.glb`. All buildings have window grids + roof slabs + sometimes rooftop water tanks. |
| Player could fall off the world | No outer wall, no world-bounds clamp. | **Concrete Jersey barriers on both sides of the entire track** (400 segments, both inner + outer walls), plus a safety-net `clampToTrack()` that snaps the player back to the road if they somehow escape. |

---

## Game features (v3)

- **Closed-loop oval track**: 120m straights + 60m-radius curves = 617m lap. Track math verified (continuity test passes).
- **Procedural low-poly Jeep** with spinning wheels, steering front wheels, body lean, pitch on accel/brake, headlights + brake lights.
- **Arcade physics**: throttle, brake, reverse, speed-sensitive steering, drift on `SPACE` (boosts turn rate + lateral slip).
- **Collision**: circle-vs-AABB against ~400 barrier segments + ~130 building colliders. Player bleeds speed on impact and is pushed out.
- **Checkpoint race**: 8 gold rings evenly spaced along the track, 3 laps, lap times + total time + best lap in `localStorage`.
- **3 camera modes** (cycle with `C`): chase / hood / high.
- **Live minimap**: track outline, dashed centerline, checkpoints, player triangle.
- **Screen-space checkpoint arrow** with distance readout.
- **Procedural WebAudio**: engine RPM that tracks speed, wind noise, drift screech, checkpoint chimes. No audio files needed.
- **Mobile touch controls**: ◀ ▶ GO BRK DRIFT buttons, auto-enabled on touch devices.
- **Lagos daytime**: gradient sky shader, warm sun, palm trees, yellow taxis, sand ring, drifting clouds.

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Accelerate | `W` or `↑` | GO |
| Brake / Reverse | `S` or `↓` | BRK |
| Steer Left | `A` or `←` | ◀ |
| Steer Right | `D` or `→` | ▶ |
| Drift | `SPACE` | DRIFT |
| Cycle camera | `C` | — |

## Deploy to Vercel

`vercel.json` is pre-configured. Push the folder to git → Vercel → New Project → Deploy. Or:

```bash
npm i -g vercel
vercel --prod
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
│       ├── building.glb   (933 KB — used for distant skyline ring)
│       ├── buildings.glb  (472 KB — distant skyline decoration)
│       ├── jeep.glb       (769 KB — included but NOT used; procedural Jeep is cleaner)
│       └── roads.glb      (4 MB — included but NOT used; procedural track is cleaner)
└── src/
    ├── main.js         — bootstrap (loader → start screen → race)
    ├── game.js         — scene, lights, sky, render loop, race flow, HUD
    ├── city.js         — procedural oval track + barriers + buildings + palms + lamps + taxis + billboards + checkpoints
    ├── player.js       — procedural low-poly Jeep + arcade physics + wheel spin
    ├── camera.js       — chase / hood / high camera with Y-clamp
    ├── input.js        — keyboard + touch
    ├── audio.js        — procedural WebAudio engine + drift
    └── race.js         — checkpoint state machine + lap timer
```

The two imported GLB files that *are* still used (`building.glb` and `buildings.glb`) are loaded with `GLTFLoader` and used only as distant decorative skyline. The two unused GLBs (`jeep.glb`, `roads.glb`) are kept in the bundle for reference but no longer loaded — they could be removed to slim the deploy.

## Tech

- [three.js](https://threejs.org/) ~0.160
- [Vite](https://vitejs.dev/) 5
- 100% static — no backend, no API keys, no external runtime assets
- Total bundle size: ~3.6 MB (mostly the GLBs; could be trimmed to ~1.5 MB by deleting unused GLBs)

## License

Code: MIT. The 3D models belong to their respective creators and are used here only as game assets in this single Vercel-deployable bundle.
