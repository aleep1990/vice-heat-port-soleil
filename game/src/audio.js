// Synthesized sound only: engine hum, sirens, gunshots, chimes, a sting and a
// small bassline loop. No audio files, no network. Everything is a no-op
// until start() runs from a user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engineOsc = null;
  let engineGain = null;
  let engineOsc2 = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;
  const bassNotes = [55, 55, 65.41, 49, 55, 55, 82.41, 65.41]; // A1 A1 C2 G1 ...

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: two detuned saws through a lowpass, gain follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp);
      engineOsc2.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: square wave, frequency flipped by a timer.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function start() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!musicTimer) {
      musicTimer = setInterval(() => {
        if (muted || !ctx) return;
        const step = musicStep;
        musicStep = (musicStep + 1) % 16;
        // Bass on every beat, hats on the off-beats.
        if (step % 2 === 0) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = bassNotes[(step / 2) % bassNotes.length];
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.16, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
          osc.connect(g);
          g.connect(master);
          osc.start();
          osc.stop(ctx.currentTime + 0.45);
        }
        if (step % 2 === 1) {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 6000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.05, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
          src.connect(hp);
          hp.connect(g);
          g.connect(master);
          src.start();
          src.stop(ctx.currentTime + 0.07);
        }
      }, 250);
    }
  }

  function setEngine(speedNorm, inCar) {
    if (!ctx || !engineGain) return;
    const target = muted || !inCar ? 0 : 0.035 + Math.min(1, speedNorm) * 0.075;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
    const f = 52 + Math.min(1, speedNorm) * 95;
    engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.1);
    engineOsc2.frequency.setTargetAtTime(f * 1.01, ctx.currentTime, 0.1);
  }

  function siren(on) {
    if (!ensure()) return;
    if (on && !sirenTimer) {
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.1);
      sirenTimer = setInterval(() => {
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 950 : 720;
      }, 420);
    } else if (!on && sirenTimer) {
      clearInterval(sirenTimer);
      sirenTimer = 0;
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  }

  function blip(freq, dur, vol, type = 'sine', when = 0) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const t = ctx.currentTime + when;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Audio is best-effort.
    }
  }

  function shoot() {
    if (!ctx || muted) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
      src.connect(bp);
      bp.connect(g);
      g.connect(master);
      src.start();
      src.stop(ctx.currentTime + 0.12);
    } catch {
      // Best effort.
    }
  }

  return {
    start,
    setEngine,
    siren,
    shoot,
    enemyShoot() {
      if (!ctx || muted) return;
      blip(220, 0.09, 0.12, 'square');
    },
    chime() {
      blip(880, 0.16, 0.2);
      blip(1318, 0.24, 0.2, 'sine', 0.09);
    },
    sting() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 0.18, 'triangle', i * 0.09));
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
}
