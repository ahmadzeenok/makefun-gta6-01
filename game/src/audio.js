// Palmera Bay — all sound is synthesised live with WebAudio, so the game
// ships no audio files at all. Short one-shot blips cover gunshots, pickups
// and UI clicks; two quiet loops (engine hum, police siren) follow the
// game state and are driven from main.js every frame.
export function makeAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    sirenHigh: false,
    muted: false,
    enabled: false,
  };

  audio.unlock = function unlock() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.35;
      audio.master.connect(audio.ctx.destination);
      audio.enabled = true;
      // Engine: a low sawtooth whose pitch follows speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      // Siren: a sine that alternates between two notes.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
    } catch (err) {
      audio.enabled = false;
    }
  };

  audio.setMuted = function setMuted(m) {
    audio.muted = m;
    if (audio.master) audio.master.gain.value = m ? 0 : 0.35;
  };

  // One short tone: freq slides down to freqEnd over `dur` seconds.
  audio.blip = function blip(freq, freqEnd, dur, type, vol) {
    if (!audio.enabled || audio.muted || !audio.ctx) return;
    try {
      const t = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd || freq), t + dur);
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* audio is decoration; never break the game */ }
  };

  // A burst of filtered noise, for gunshots and crashes.
  audio.noise = function noise(dur, vol, cutoff) {
    if (!audio.enabled || audio.muted || !audio.ctx) return;
    try {
      const t = audio.ctx.currentTime;
      const len = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff || 1800;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.master);
      src.start(t);
    } catch (err) { /* ignore */ }
  };

  audio.shot = function shot() {
    audio.noise(0.12, 0.5, 2600);
    audio.blip(220, 55, 0.1, 'square', 0.22);
  };

  audio.enemyShot = function enemyShot() {
    audio.noise(0.1, 0.22, 2000);
  };

  audio.punch = function punch() {
    audio.noise(0.08, 0.3, 900);
  };

  audio.crash = function crash() {
    audio.noise(0.25, 0.45, 700);
    audio.blip(90, 35, 0.25, 'sawtooth', 0.25);
  };

  audio.pickup = function pickup() {
    audio.blip(660, 660, 0.07, 'sine', 0.22);
    setTimeout(() => audio.blip(990, 990, 0.1, 'sine', 0.22), 70);
  };

  audio.cash = function cash() {
    audio.blip(520, 520, 0.08, 'sine', 0.22);
    setTimeout(() => audio.blip(780, 780, 0.08, 'sine', 0.22), 80);
    setTimeout(() => audio.blip(1040, 1040, 0.14, 'sine', 0.22), 160);
  };

  audio.click = function click() {
    audio.blip(440, 330, 0.06, 'square', 0.12);
  };

  audio.missionDone = function missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, f, 0.16, 'triangle', 0.25), i * 110));
  };

  audio.failed = function failed() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => audio.blip(f, f, 0.2, 'sawtooth', 0.18), i * 130));
  };

  audio.busted = function busted() {
    audio.blip(300, 120, 0.7, 'sawtooth', 0.3);
  };

  // Called every frame: engine pitch follows speed, siren wails while wanted.
  audio.update = function update(dt, speed01, wanted) {
    if (!audio.enabled || !audio.ctx) return;
    if (audio.engineOsc) {
      audio.engineOsc.frequency.value = 50 + speed01 * 130;
      audio.engineGain.gain.value = audio.muted ? 0 : 0.02 + speed01 * 0.05;
    }
    if (audio.sirenOsc) {
      audio.sirenTimer += dt;
      if (audio.sirenTimer > 0.42) {
        audio.sirenTimer = 0;
        audio.sirenHigh = !audio.sirenHigh;
        audio.sirenOsc.frequency.value = audio.sirenHigh ? 880 : 620;
      }
      audio.sirenGain.gain.value = audio.muted ? 0 : wanted > 0 ? 0.028 : 0;
    }
  };

  return audio;
}
