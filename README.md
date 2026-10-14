# NEON DRIVE 3D

A Vercel-deployable 3D driving game built with **Three.js** + **Vite**. Pick one of three supercars and tear through a neon-lit, NYC-inspired city grid collecting coins under a starlit sky.

Built from user-uploaded reference art:
- Three supercar renders → player car select + roadside billboards
- A stylized NYC street scene → skybox backdrop
- A Watch Dogs: Legion driving screenshot → HUD/mission inspiration

---

## Features

- **3 selectable cars** with distinct speed / acceleration / handling physics
- **Procedural neon city**: 7×7 block grid, ~50 emissive buildings, street lamps, trees, glowing road dashes, neon border
- **Skybox** from your uploaded NYC scene, plus 800 procedural stars + a moon disc
- **3 roadside billboards** showcasing the three uploaded supercars
- **Drivable car** with real-ish physics: throttle, brake, speed-sensitive steering, drift (SPACE), reverse, body lean
- **Three camera modes** (cycle with `C`): chase / far cinematic / hood cam
- **HUD**: speed (km/h), gear, RPM, score, coins collected / total, distance driven, mission banner, live minimap radar
- **40 spinning collectible coins** scattered along the road grid
- **Mobile touch controls** auto-enabled on touch devices
- **Idle cinematic orbit** on the title screen before you pick a car

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Accelerate | `W` or `↑` | ⛽ button |
| Brake / Reverse | `S` or `↓` | ■ button |
| Steer Left | `A` or `←` | ◀ button |
| Steer Right | `D` or `→` | ▶ button |
| Drift | `SPACE` | — |
| Cycle camera | `C` | — |

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs static site to /dist
npm run preview  # preview the production build
```

## Deploy to Vercel

This repo is Vercel-ready out of the box.

**Option A — Dashboard**
1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. In Vercel → *New Project* → import the repo.
3. Vercel auto-detects Vite. The included `vercel.json` pins the build command and output directory. Click **Deploy**.

**Option B — CLI**
```bash
npm i -g vercel
vercel        # preview deploy
vercel --prod # production deploy
```

`vercel.json` is already configured with `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`.

## Project structure

```
driving-game/
├── index.html            # Single-page entry with all UI (loader, car select, HUD)
├── package.json
├── vite.config.js
├── vercel.json           # Vercel deployment config
├── public/
│   ├── car-rolls.jpg     # Phantom Gold  (uploaded)
│   ├── car-orange.jpg    # Apex GT       (uploaded)
│   ├── car-lambo.jpg     # Rosso Beast   (uploaded)
│   ├── city-scene.jpg    # NYC scene → skybox  (uploaded)
│   └── watchdogs-ref.png # reference   (uploaded)
└── src/
    ├── main.js          # Boot: loads assets → shows car select → starts game
    ├── game.js          # Orchestrator: scene, lights, skybox, HUD, render loop
    ├── city.js          # Procedural neon city + coins + billboards
    ├── player.js        # Procedural supercar mesh + physics
    ├── camera.js        # Chase / far / hood camera with FOV speed kick
    ├── input.js         # Keyboard + touch input
    └── cars.js          # Car catalog (3 specs from your uploaded images)
```

## Tech

- [three.js](https://threejs.org/) ~0.160
- [Vite](https://vitejs.dev/) 5
- No backend, no API keys, no external assets beyond the uploaded images — 100% static, 100% Vercel-friendly.

## License

Code: MIT. Uploaded car/scene images belong to their respective owners and are used here only as the user-provided game assets.
