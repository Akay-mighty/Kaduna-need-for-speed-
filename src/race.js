// ============================================================
// race.js — checkpoint race state machine
//
// 3 laps, 8 checkpoints per lap. Player must hit them in order.
// Best lap saved to localStorage. Emits events to game for HUD updates.
// ============================================================
export const TOTAL_LAPS = 3;

export class Race {
  constructor(city, player) {
    this.city = city;
    this.player = player;
    this.totalLaps = TOTAL_LAPS;
    this.currentLap = 1;
    this.nextCp = 0;
    this.startTime = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = parseFloat(localStorage.getItem('lagos-drift-best') || '0') || 0;
    this.running = false;
    this.finished = false;
    this.lastCpHitTime = 0;
  }

  start() {
    this.running = true;
    this.finished = false;
    this.currentLap = 1;
    this.nextCp = 0;
    this.lapTimes = [];
    this.startTime = performance.now();
    this.lapStart = this.startTime;
    this.city.nextCheckpoint = 0;
  }

  // Returns: 'checkpoint' | 'lap' | 'finish' | null
  tick(now) {
    if (!this.running || this.finished) return null;
    const cps = this.city.checkpoints;
    const target = cps[this.nextCp];
    const dx = this.player.pos.x - target.x;
    const dz = this.player.pos.z - target.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 4.5) {
      // Hit
      const result = this._onHit(now);
      return result;
    }
    return null;
  }

  _onHit(now) {
    this.nextCp++;
    if (this.nextCp >= this.city.checkpoints.length) {
      // Lap complete
      const lapTime = (now - this.lapStart) / 1000;
      this.lapTimes.push(lapTime);
      this.lapStart = now;
      this.nextCp = 0;
      this.currentLap++;
      if (this.currentLap > this.totalLaps) {
        this.finished = true;
        this.running = false;
        // Save best lap
        const best = Math.min(...this.lapTimes);
        if (this.bestLap === 0 || best < this.bestLap) {
          this.bestLap = best;
          localStorage.setItem('lagos-drift-best', String(best));
        }
        return 'finish';
      }
      return 'lap';
    }
    this.city.nextCheckpoint = this.nextCp;
    return 'checkpoint';
  }

  currentLapTime(now) {
    return (now - this.lapStart) / 1000;
  }

  totalTime(now) {
    return (now - this.startTime) / 1000;
  }

  checkpointCount() { return this.city.checkpoints.length; }
}

export function formatTime(seconds) {
  if (!seconds || seconds < 0) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
