# KADUNA NEED FOR SPEED — Cyberbeast Edition (v6)

A Vercel-deployable 3D driving game built with **Three.js** + **Vite**. Drive a Tesla Cybertruck Cyberbeast AWD through a low-poly Kaduna city circuit.

Named in tribute to [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork) — borrowed its car physics pattern (rolling + quadratic drag) and chase-camera speed-zoom pattern for polish.

---

## v6 fixes (the live-site bugs)

The live v5 deployment was still broken — the car stayed at 6-23 km/h after 6+ seconds of full throttle, and the city looked empty. Here's what I fixed:

### Root cause 1: barrier colliders were too big
v5 used **circles** for barrier colliders with radius `len/2 + bT/2 + 0.3` = 2.8m for a 4m barrier segment. The barrier sat at offset 8.5m from the track centerline (just outside the 8m-wide road). A circle of radius 2.8m extends inward to 8.5 - 2.8 = **5.7m** from centerline — but the road edge is at 8m! So the barrier circle extended **2.3m into the road**, causing constant false collisions. Every collision did `speed *= 0.6`, killing acceleration.

**Fix**: barriers now use **oriented line segments** (capsule shape — segment + thickness). The closest point on the segment to the player is computed properly, and the collider only triggers when the player is actually within `halfThick + playerRadius` (0.5 + 1.4 = 1.9m) of the segment centerline. No more false collisions on straights.

### Root cause 2: player collision radius too big
v5 used radius 2.0m for the player — but the Cybertruck is 2.43m wide (so 1.2m half-width). With radius 2.0m, the player collided with barriers on the opposite side of the road.

**Fix**: reduced to 1.4m (matches actual truck half-width + small pad).

### Root cause 3: speed bleed on collision too aggressive
v5 did `speed *= 0.6` on every collision — even minor scrapes killed all momentum.

**Fix**: `speed *= 0.8` on collision (gentle speed bleed — feels like scraping a wall, not crashing).

### Root cause 4: rivals rammed the player at startup
v5 spawned rivals 5m and 9m behind the player. Since the rivals start at speed 0 and the player also starts at speed 0, the rivals' AI immediately tries to drive forward into the player.

**Fix**: 
- Spawn rivals further back (8m and 12m behind player)
- **3-second grace period** before rival-player collision activates
- Smaller rival-player collision radius (1.4m instead of 2.5m)

### Root cause 5: car physics used linear drag (unstable)
v5's physics: `speed -= drag * dt * sign(speed)`. This is OK at low speed but causes instability at high speed (the discrete integration can overshoot).

**Fix**: borrowed slop-newyork's `driveSpeed` function — **rolling resistance + quadratic air drag**:
```javascript
const coasting = Math.max(0, magnitude - deceleration * dt) / (1 + drag * magnitude * dt);
return Math.sign(throttle) * Math.min(Math.max(limit, coasting), coasting + accel * dt);
```
This is the same pattern used in mrdoob's NYC sim. Stable, feels good, doesn't cross zero.

### Root cause 6: lighting too dim
v5 sun intensity 1.6 + hemi 0.55 was too low for the PBR stainless steel to actually reflect anything. The Cybertruck body uses 47 PBR materials (stainless steel, glass, paint, rubber, anodized) — without strong lighting they look dark.

**Fix**: bumped to sun 3.0 + hemi 1.0 (closer to slop-newyork's midday 6.6/1.58, but lower because we don't have a physically-based pipeline). Also bumped envMapIntensity 1.0 → 1.2 for stronger reflections.

### Camera polish (from slop-newyork)
- **Speed-based zoom**: chase camera pulls back up to 25% at top speed (slop-newyork pattern)
- FOV kicks up to 12° at top speed (was 10°) for stronger sense of velocity

### Renamed
- Title: "KADUNA NEED FOR SPEED"
- Loader: "KADUNA NEED FOR SPEED — Cyberbeast Edition · Open-World Racer"
- Start screen: "KADUNA NFS" / "Drive the Tesla Cybertruck Cyberbeast AWD through 3 laps of a low-poly Kaduna city circuit..."
- Footer credit: "KADUNA NEED FOR SPEED · CYBERBEAST · THREE.JS · VERCEL"
- localStorage keys kept as `lagos-drift-*` so previous best-lap data persists

---

## All features (v5 + v6)

- ✅ Tesla Cybertruck Cyberbeast AWD (real GLB, 47 PBR materials)
- ✅ Closed-loop oval track (617m, 2 straights + 2 half-circle curves)
- ✅ Concrete Jersey barriers on both sides (proper segment colliders now)
- ✅ Procedural low-poly Kaduna city (~130 buildings, palms, lamps, taxis, billboards)
- ✅ 8 checkpoints × 3 laps, best lap saved to localStorage
- ✅ 3 AI rival Cybertrucks (chase AI, 3s grace period, smaller collision radius)
- ✅ Best-lap ghost replay (translucent cyan Cybertruck)
- ✅ Day/night cycle (DAWN → DAY → DUSK → NIGHT, 3-minute loop)
- ✅ 6 boost pads on straights (1.5× max speed for 2.5s)
- ✅ 3 camera modes (chase / hood / high) with speed-zoom
- ✅ Live minimap + screen-space checkpoint arrow
- ✅ Procedural WebAudio (engine, wind, drift screech, chimes)
- ✅ Mobile touch controls (◀ ▶ GO BRK DRIFT)
- ✅ Full Settings menu (graphics quality, sound, music, sensitivity, camera distance, FPS, reset)
- ✅ PMREM environment map for PBR reflections
- ✅ FPS counter (toggle in settings)
- ✅ localStorage-backed settings persistence

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Accelerate | `W` or `↑` | GO |
| Brake / Reverse | `S` or `↓` | BRK |
| Steer Left | `A` or `←` | ◀ |
| Steer Right | `D` or `→` | ▶ |
| Drift | `SPACE` | DRIFT |
| Cycle camera | `C` | — |
| Open Settings | ⚙ button | ⚙ button |

## Deploy to Vercel

```bash
unzip kaduna-need-for-speed-v6.zip
cd driving-game-2
npm install
vercel --prod
```

`vercel.json` is pre-configured.

## Acknowledgments

Car physics + camera polish patterns borrowed from [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork) — the NYC sim by Three.js creator mrdoob. We didn't copy code (it uses WebGPU/TSL, we use WebGL), but the `driveSpeed` rolling+drag pattern and the chase-camera speed-zoom are direct inspirations.

## Tech

- [three.js](https://threejs.org/) ~0.160
- [Vite](https://vitejs.dev/) 5
- 100% static, no backend, no API keys
- Bundle: ~3.6 MB zip / ~10 MB unpacked (mostly the Cybertruck GLB)

## License

Code: MIT. 3D models belong to their respective creators.
