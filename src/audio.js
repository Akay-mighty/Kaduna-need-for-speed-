// ============================================================
// audio.js — procedural engine + drift sound via WebAudio.
// No external samples — everything synthesized.
// ============================================================
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.started = false;
  }

  _ensure() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.started = true;
    } catch (e) { console.warn('Audio unavailable', e); }
  }

  // Must be called from a user gesture to satisfy autoplay policies
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx && !this._built) this._build();
  }

  _build() {
    if (!this.ctx) return;
    const ctx = this.ctx;

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

    // Sub oscillator for body
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'triangle';
    this.subOsc.frequency.value = 30;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.2;

    this.engineOsc.connect(this.engineFilter);
    this.subOsc.connect(this.subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(ctx.destination);

    this.engineOsc.start();
    this.subOsc.start();

    // ===== Wind / tire noise: white noise → bandpass, gain tracks speed =====
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

    this.noiseSrc.connect(this.windFilter).connect(this.windGain).connect(ctx.destination);
    this.noiseSrc.start();

    // ===== Drift screech: noise → highpass, gain tracks drift amount =====
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'highpass';
    this.screechFilter.frequency.value = 2500;

    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;

    // Reuse the noise buffer
    this.screechSrc = ctx.createBufferSource();
    this.screechSrc.buffer = noiseBuf;
    this.screechSrc.loop = true;
    this.screechSrc.connect(this.screechFilter).connect(this.screechGain).connect(ctx.destination);
    this.screechSrc.start();

    this._built = true;
  }

  // speedFactor: 0..1, driftAmount: 0..1
  update(speedFactor, driftAmount) {
    if (!this.ctx || !this._built) return;
    const t = this.ctx.currentTime;

    // Engine frequency: 50Hz idle, 220Hz at top speed
    const targetFreq = 50 + speedFactor * 170;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);
    this.subOsc.frequency.setTargetAtTime(targetFreq * 0.5, t, 0.05);

    // Engine filter opens up with speed
    this.engineFilter.frequency.setTargetAtTime(400 + speedFactor * 1500, t, 0.05);

    // Engine volume: small idle, fuller at speed
    this.engineGain.gain.setTargetAtTime(0.06 + speedFactor * 0.12, t, 0.1);

    // Wind volume scales with speed
    this.windGain.gain.setTargetAtTime(speedFactor * 0.12, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(400 + speedFactor * 1200, t, 0.1);

    // Drift screech
    this.screechGain.gain.setTargetAtTime(driftAmount * 0.18, t, 0.05);
    this.screechFilter.frequency.setTargetAtTime(2000 + driftAmount * 2000, t, 0.05);
  }

  // Quick celebratory chime when a checkpoint is hit
  chime(freq = 880, dur = 0.15, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ctx.destination);
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
