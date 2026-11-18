// SPDX-License-Identifier: MIT
// Solmar Bay — sound: everything is synthesized with WebAudio, no audio
// files. Engine hum, two-tone siren, gunshots, punches, chimes and jingles.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // engine: low sawtooth whose pitch follows speed
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // siren: square wave alternating between two tones
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch { /* audio is best-effort */ }
  }

  return {
    // call on first user gesture; browsers block audio before that
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    setEngine(speedRatio, driving) {
      if (!ensure() || muted) return;
      const target = driving ? 0.05 + 0.09 * Math.abs(speedRatio) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + 140 * Math.abs(speedRatio), ctx.currentTime, 0.1);
    },
    setSiren(on) {
      sirenOn = on;
      if (!ensure()) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.2);
      if (on) {
        const now = ctx.currentTime;
        sirenOsc.frequency.setValueAtTime(700, now);
        sirenOsc.frequency.linearRampToValueAtTime(950, now + 0.4);
        sirenOsc.frequency.linearRampToValueAtTime(700, now + 0.8);
      }
    },
    updateSiren(dt) {
      if (!sirenOn || !ctx) return;
      // keep the two-tone wail cycling
      sirenOsc.frequency.setTargetAtTime(
        sirenOsc.frequency.value > 820 ? 700 : 950,
        ctx.currentTime,
        0.35,
      );
    },
    shoot() {
      noise(0.12, 0.5, 2400);
      blip(160, 0.1, 'square', 0.25, 60);
    },
    punch() {
      noise(0.08, 0.3, 500);
    },
    chime() {
      blip(660, 0.12, 'sine', 0.2);
      setTimeout(() => blip(990, 0.18, 'sine', 0.2), 110);
    },
    jingle() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 130));
    },
    crash() {
      noise(0.35, 0.4, 800);
    },
    explosion() {
      noise(0.7, 0.55, 400);
      blip(90, 0.6, 'sine', 0.35, 30);
    },
    pickup() {
      blip(880, 0.1, 'sine', 0.2, 1320);
    },
  };
}
