// ============================================================
// ghost.js — best-lap replay as a translucent Cybertruck
//
// Records the player's (x, z, heading) at ~30Hz during a lap.
// Stores the best recording in localStorage (per car).
// On the next race, if a recording exists, spawns a translucent
// Cybertruck that follows the recording on a loop — so you can
// race against your own best lap.
// ============================================================
import * as THREE from 'three';

const SCALE = 0.165;
const LIFT_Y = 1.06;
const SAMPLE_HZ = 30;       // 30 samples per second
const STORAGE_KEY = 'lagos-drift-ghost';

export class Ghost {
  constructor(scene, bodyScene) {
    this.scene = scene;
    this.bodyScene = bodyScene;
    this.mesh = null;
    this.recording = null;       // current recording (this race's best)
    this.bestRecording = null;   // loaded from localStorage at construction
    this.playbackTime = 0;
    this.playing = false;
    this._lastSampleTime = 0;
    this._raceStartTime = 0;

    // Load best lap from storage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.samples && data.samples.length > 10) {
          this.bestRecording = data;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Start recording a new lap. Called when the player starts a lap (lap 1) or
  // crosses the start line for subsequent laps.
  startRecording(raceStartTime) {
    this.recording = {
      samples: [],   // {t, x, z, h}
      startTime: raceStartTime
    };
    this._raceStartTime = raceStartTime;
    this._lastSampleTime = raceStartTime;
  }

  // Called every frame during the race
  record(now, pos, heading) {
    if (!this.recording) return;
    if (now - this._lastSampleTime < 1000 / SAMPLE_HZ) return;
    this._lastSampleTime = now;
    this.recording.samples.push({
      t: (now - this._raceStartTime) / 1000,
      x: pos.x,
      z: pos.z,
      h: heading
    });
  }

  // Called when the player completes a lap. If this lap was faster than the
  // current best, save it.
  finishLap(lapTime) {
    if (!this.recording) return false;
    const data = {
      lapTime,
      samples: this.recording.samples
    };
    if (!this.bestRecording || lapTime < this.bestRecording.lapTime) {
      this.bestRecording = data;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) { /* storage full */ }
      this.recording = null;  // stop recording — this becomes the new ghost
      return true;
    }
    return false;
  }

  // Spawn the ghost mesh and start playback
  startPlayback() {
    if (!this.bestRecording || !this.bodyScene) return false;
    if (this.mesh) this.stopPlayback();

    const body = this.bodyScene.clone(true);
    body.rotation.x = Math.PI / 2;
    body.scale.setScalar(SCALE);
    body.position.y = LIFT_Y;

    // Make all materials translucent + cyan-tinted
    body.traverse(c => {
      if (c.isMesh) {
        c.castShadow = false;
        c.receiveShadow = false;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        const newMats = mats.map(m => {
          const nm = m.clone();
          nm.transparent = true;
          nm.opacity = 0.4;
          nm.color = new THREE.Color(0x05d9e8);
          nm.emissive = new THREE.Color(0x05d9e8);
          nm.emissiveIntensity = 0.3;
          return nm;
        });
        c.material = Array.isArray(c.material) ? newMats : newMats[0];
      }
    });

    const grp = new THREE.Group();
    grp.add(body);
    grp.visible = false;
    this.scene.add(grp);

    this.mesh = grp;
    this.playbackTime = 0;
    this.playing = true;
    return true;
  }

  stopPlayback() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
    this.playing = false;
  }

  // Per-frame: advance playback time, find the nearest sample, position the mesh
  update(dt) {
    if (!this.playing || !this.mesh || !this.bestRecording) return;
    this.playbackTime += dt;
    const samples = this.bestRecording.samples;
    const lapTime = this.bestRecording.lapTime;
    // Loop playback
    if (this.playbackTime > lapTime) this.playbackTime -= lapTime;

    // Find the sample nearest to playbackTime
    const idx = Math.floor(this.playbackTime * SAMPLE_HZ);
    if (idx < 0 || idx >= samples.length) {
      this.mesh.visible = false;
      return;
    }
    const s = samples[idx];
    this.mesh.visible = true;
    this.mesh.position.set(s.x, 0, s.z);
    this.mesh.rotation.y = s.h;
  }

  hasGhost() {
    return !!this.bestRecording;
  }
}
