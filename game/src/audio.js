// Solmar Bay — procedural WebAudio sound: no audio files, everything synthesized.
// SPDX-License-Identifier: MIT

'use strict';

/**
 * All sound is synthesized with the Web Audio API: two-tone police siren,
 * gunshot noise burst, explosion rumble, mission jingle, pickup blip,
 * engine hum and crash thud. Created lazily on the first user gesture so
 * browsers allow it; every call is safe before that.
 */
class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sirenNodes = null;
    this.engineNodes = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  _osc(type, freq, dur, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  /** Short UI click. */
  click() { this._osc('square', 660, 0.06, 0.12); }
  /** Cash pickup / fare paid. */
  blip() { this._osc('sine', 880, 0.09, 0.2); this._osc('sine', 1320, 0.12, 0.15); }
  /** Pistol shot: sharp noise crack + low thump. */
  gunshot() { this._noise(0.12, 0.5, 3200); this._osc('triangle', 160, 0.1, 0.3, 60); }
  /** Enemy shot, quieter and duller. */
  enemyShot() { this._noise(0.1, 0.25, 1800); }
  /** Fist punch. */
  punch() { this._noise(0.08, 0.35, 900); }
  /** Metal crash. */
  crash() { this._noise(0.25, 0.5, 700); this._osc('sawtooth', 90, 0.2, 0.25, 40); }
  /** Car explosion: long low rumble. */
  explosion() {
    this._noise(0.9, 0.8, 500);
    this._osc('sine', 70, 0.9, 0.6, 28);
    this._osc('sawtooth', 45, 0.7, 0.3, 25);
  }
  /** Mission complete jingle: C-E-G-C arpeggio. */
  jingle() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this._osc('triangle', f, 0.22, 0.22), i * 110);
    });
  }
  /** Mission failed / wanted up: descending buzz. */
  fail() { this._osc('sawtooth', 220, 0.5, 0.2, 110); }
  /** Health pickup. */
  heal() { this._osc('sine', 520, 0.15, 0.2, 780); }

  /** Two-tone police siren while wanted >= 2; call every frame, it manages itself. */
  siren(on) {
    if (!this.ctx || this.muted) { this._stopSiren(); return; }
    if (on && !this.sirenNodes) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 750;
      lfo.type = 'square'; lfo.frequency.value = 0.9;
      lg.gain.value = 220;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.05;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenNodes = { o, lfo, g };
    } else if (!on && this.sirenNodes) {
      this._stopSiren();
    }
  }

  _stopSiren() {
    if (!this.sirenNodes) return;
    try { this.sirenNodes.o.stop(); this.sirenNodes.lfo.stop(); } catch (e) { /* already stopped */ }
    this.sirenNodes = null;
  }

  /** Engine hum that follows the driven car's speed; call every frame. */
  engine(speed01) {
    if (!this.ctx || this.muted) { this._stopEngine(); return; }
    if (!this.engineNodes) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55;
      g.gain.value = 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start();
      this.engineNodes = { o, g };
    }
    const t = this.ctx.currentTime;
    this.engineNodes.o.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    this.engineNodes.g.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  }

  _stopEngine() {
    if (!this.engineNodes) return;
    try { this.engineNodes.o.stop(); } catch (e) { /* already stopped */ }
    this.engineNodes = null;
  }
}
