# LAGOS DRIFT — Cyberbeast Edition v4

A Vercel-deployable 3D driving game built with **Three.js** + **Vite**. Drive a real Tesla Cybertruck Cyberbeast AWD through a low-poly Lagos city circuit. Race against 3 AI rivals, chase your own ghost best lap, hit the boost pads on the straights, and watch the city cycle from dawn through day, dusk, and night.

---

## v4 features (on top of v3)

### 1. AI rival Cybertrucks (`src/rivals.js` — new)
- 3 rivals spawn behind you in a start grid at race start
- Each AI tracks its arc length `d` along the track centerline, looks ahead 5-15m based on speed, and steers toward that target
- **Corner-aware speed control**: AI slows down when the upcoming track direction changes (samples 5m apart and measures angle delta)
- **Per-rival personality**: randomized top speed (38-48 m/s), cornering (0.85-1.05), acceleration (18-24 m/s²)
- **Collision with player**: cars bounce off each other, both lose speed
- **Lap tracking**: each AI counts its own laps
- **Position HUD**: top-right "Position 1/4" indicator updates every frame based on total progress (laps × trackLen + d)
- **Minimap**: each rival drawn as a colored dot
- Each rival is a **tinted Cybertruck clone** — orange, blue, green (their "Stainless_Steel" + "Black_Paint" materials recolored)

### 2. Best-lap ghost replay (`src/ghost.js` — new)
- Records player's `(x, z, heading)` at **30Hz** during each lap
- On lap completion, if the new lap is faster than the stored best, the recording is saved to `localStorage` (`lagos-drift-ghost`)
- On race start (if a best recording exists), a **translucent cyan Cybertruck** is spawned that plays back the recording on a loop
- Race against your own best lap — visually clear feedback when you're pulling ahead or falling behind
- Ghost is also drawn on the minimap as a cyan dot
- "👻 GHOST READY" badge appears in the HUD when a ghost is loaded

### 3. Day/night cycle (`src/game.js` `_updateTimeOfDay()`)
- 4 keyframes interpolated: **DAWN → DAY → DUSK → NIGHT** (and back to DAWN)
- Full cycle takes **3 minutes** (configurable via `TOD_CYCLE_SECONDS`)
- Animates sky shader uniforms (`topColor`, `midColor`, `bottomColor`) — same gradient shader, just different colors
- Animates scene background + fog color (fog pulls in closer at night for atmosphere)
- Animates sun position (rises at dawn, peaks at noon, sets at dusk, goes dark at night)
- Animates sun + hemisphere light intensity (low at night, bright at noon)
- Adds a **moon** (soft blue directional light from the opposite side at night)
- **Street lamps auto-toggle**: turn on at dusk, off at dawn
- **HUD indicator** at top center: 🌅 DAWN · ☀ DAY · 🌆 DUSK · 🌙 NIGHT

### 4. Boost pads (`src/boostpads.js` — new)
- **6 boost pads** placed along the straights (3 on top straight, 3 on bottom)
- Visual: glowing orange/yellow chevron arrows on the road + pulsing ground ring
- Driving over a pad applies:
  - 1.5× max speed multiplier for **2.5 seconds**
  - 1.4× acceleration multiplier during boost
- 4-second cooldown per pad (so you can't farm the same pad)
- **Boost HUD**: animated "BOOST!" label + a depleting orange bar at the bottom of the screen
- Boost pads also drawn on the minimap as orange dots

---

## Existing v3 features (still here)

- Closed-loop oval track (617m, 2 straights + 2 half-circle curves)
- Procedural low-poly Lagos city (~130 buildings, palms, lamps, taxis, billboards)
- Concrete Jersey barriers on both sides (no falling off)
- Player Y locked to 0 (never fall through world)
- 8 checkpoints × 3 laps, best lap saved to localStorage
- 3 camera modes (chase / hood / high), Y-clamped, ground-aware
- Live minimap, screen-space checkpoint arrow, distance readout
- Procedural WebAudio (engine RPM, wind, drift screech, checkpoint chimes, collision bump)
- Mobile touch controls (◀ ▶ GO BRK DRIFT)

---

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

```bash
npm i -g vercel
vercel --prod
```

`vercel.json` is pre-configured.

## Project structure

```
lagos-drift/
├── index.html
├── package.json / vite.config.js / vercel.json
├── public/models/
│   ├── cybertruck.glb   (9.3 MB — player car + cloned for rivals + ghost)
│   ├── building.glb      (933 KB — distant skyline)
│   └── buildings.glb     (472 KB — distant skyline)
└── src/
    ├── main.js             — bootstrap
    ├── game.js             — scene, lights, sky, day/night, render loop, race flow, HUD
    ├── city.js             — oval track + barriers + buildings + palms + lamps + taxis + billboards + checkpoints
    ├── player.js           — Cybertruck model + arcade physics + boost multiplier
    ├── camera.js           — chase / hood / high camera
    ├── input.js            — keyboard + touch
    ├── audio.js            — procedural WebAudio
    ├── race.js             — checkpoint state machine + lap timer
    ├── rivals.js   (NEW)   — 3 AI Cybertrucks, chase AI, collision, position tracking
    ├── ghost.js    (NEW)   — best-lap recording + replay as translucent Cybertruck
    └── boostpads.js (NEW)  — boost pads on straights, temporary speed boost
```

## Tech

- [three.js](https://threejs.org/) ~0.160
- [Vite](https://vitejs.dev/) 5
- 100% static, no backend, no API keys
- Bundle: ~3.6 MB zip / ~10 MB unpacked (mostly the Cybertruck GLB)

## License

Code: MIT. 3D models belong to their respective creators.
