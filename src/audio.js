// ============================================================
// audio.js — procedural engine + drift sound via WebAudio
//
// v5: master volume control (for Settings)
//   - soundEnabled: bool — gate all sound effects
//   - soundVolume: 0..1 — master gain multiplier
// ============================================================
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this._built = false;
    this.soundEnabled = true;
    this.soundVolume = 0.7;
  }

  setSoundEnabled(on) { this.soundEnabled = on; this._applyMaster(); }
  setSoundVolume(v)   { this.soundVolume = v;  this._applyMaster(); }

  _applyMaster() {
    if (!this.masterGain) return;
    const target = this.soundEnabled ? this.soundVolume : 0;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  _ensure() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.started = true;
    } catch (e) { console.warn('Audio unavailable', e); }
  }

  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx && !this._built) this._build();
  }

  _build() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // ===== Master gain (controlled by Settings) =====
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.soundEnabled ? this.soundVolume : 0;
    this.masterGain.connect(ctx.destination);

    // ===== Engine: sawtooth + lowpass, frequency tracks speed/RPM =====
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 4;

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'triangle';
    this.subOsc.frequency.value = 30;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.2;

    this.engineOsc.connect(this.engineFilter);
    this.subOsc.connect(this.subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.masterGain);

    this.engineOsc.start();
    this.subOsc.start();

    // ===== Wind / tire noise =====
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = noiseBuf;
    this.noiseSrc.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 800;
    this.windFilter.Q.value = 1;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    this.noiseSrc.connect(this.windFilter).connect(this.windGain).connect(this.masterGain);
    this.noiseSrc.start();

    // ===== Drift screech =====
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'highpass';
    this.screechFilter.frequency.value = 2500;

    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;

    this.screechSrc = ctx.createBufferSource();
    this.screechSrc.buffer = noiseBuf;
    this.screechSrc.loop = true;
    this.screechSrc.connect(this.screechFilter).connect(this.screechGain).connect(this.masterGain);
    this.screechSrc.start();

    this._built = true;
  }

  update(speedFactor, driftAmount) {
    if (!this.ctx || !this._built) return;
    const t = this.ctx.currentTime;

    const targetFreq = 50 + speedFactor * 170;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);
    this.subOsc.frequency.setTargetAtTime(targetFreq * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(400 + speedFactor * 1500, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.06 + speedFactor * 0.12, t, 0.1);
    this.windGain.gain.setTargetAtTime(speedFactor * 0.12, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(400 + speedFactor * 1200, t, 0.1);
    this.screechGain.gain.setTargetAtTime(driftAmount * 0.18, t, 0.05);
    this.screechFilter.frequency.setTargetAtTime(2000 + driftAmount * 2000, t, 0.05);
  }

  chime(freq = 880, dur = 0.15, type = 'sine') {
    if (!this.ctx || !this._built) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(this.masterGain);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  stop() {
    if (this.ctx && this._built) {
      try {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      } catch (e) {}
    }
  }
}
