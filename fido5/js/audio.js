
/* Trim for recorded voice lines. Measured against the effects through the same
   limiter, rather than guessed: the recordings arrive normalised near -3 dBFS
   while a gunshot peaks at -30 and an explosion at -21, so untrimmed a line
   sat about 17 dB over the loudest thing in the game.

   At this level the median line peaks ~3 dB above an explosion and ~12 dB above
   a gunshot: speech still cuts through a firefight, but the explosion is once
   again the loudest thing on screen. Raise toward 0.28 for a more prominent
   FiDo-5, drop toward 0.14 to bury him further in the mix. */
const VOICE_LEVEL = 0.18;

/* ==========================================================================
   FiDo-5 — Audio.
   Every sound is synthesised at runtime with the Web Audio API, so the game
   ships no audio files and there is no licensing question to answer. Nothing
   is created until the player's first interaction, which also satisfies the
   browser autoplay rules.
   ========================================================================== */

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function hz(name, octave) {
  return 440 * Math.pow(2, (NOTE[name] + (octave - 4) * 12 - 9) / 12);
}

export class Audio {
  constructor(settings) {
    this.settings = settings;         // live reference to the save's settings
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noise = null;
    this.musicTimer = 0;
    this.step = 0;
    this.started = false;
    this.lastAt = Object.create(null);  // per-sound throttle
  }

  /* Called from the first real gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) { this._resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.settings.sound ? 0.9 : 0;
    this.sfxBus.connect(this.master);

    // A gentle limiter keeps a busy firefight from clipping.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.connect(this.master);
    this.sfxBus.disconnect();
    this.sfxBus.connect(comp);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.settings.music ? 0.20 : 0;
    this.musicBus.connect(this.master);

    // FiDo-5's recorded lines. They arrive normalised near full scale, so they
    // need far more trim than the synthesised effects to sit in the same mix.
    // Through the limiter with the effects, so a line during a firefight ducks
    // with everything else instead of stacking on top of it.
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = this.settings.voice ? VOICE_LEVEL : 0;
    this.voiceBus.connect(comp);

    // One second of white noise, reused by every percussive sound.
    const len = Math.floor(this.ctx.sampleRate);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.started = true;
    this._resume();
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  applySettings() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.settings.sound ? 0.9 : 0;
    this.musicBus.gain.value = this.settings.music ? 0.20 : 0;
    this.voiceBus.gain.value = this.settings.voice ? VOICE_LEVEL : 0;
    if (!this.settings.music) this.stopMusic();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  /* ---- Primitives ---- */

  _now() { return this.ctx.currentTime; }

  /* Rate-limit a sound so twenty simultaneous hits do not become a wall. */
  _gate(name, minGap) {
    const t = this.ctx.currentTime;
    if (this.lastAt[name] !== undefined && t - this.lastAt[name] < minGap) return false;
    this.lastAt[name] = t;
    return true;
  }

  /* A pitched blip with an exponential decay. */
  _tone({ freq, to, type = 'square', dur = 0.12, gain = 0.3, delay = 0, bus = this.sfxBus, detune = 0 }) {
    const t0 = this._now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to && to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /* A filtered noise burst — impacts, explosions, thrusters. */
  _burst({ dur = 0.2, gain = 0.3, cut = 1400, q = 1, type = 'lowpass', sweepTo = null, delay = 0, bus = this.sfxBus }) {
    const t0 = this._now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(cut, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  /* ---- Sound effects ---- */
  /* Each is a tiny recipe. Names are what the game calls, not what they are. */

  play(name, opt = {}) {
    if (!this.ctx || !this.settings.sound) return;
    this._resume();
    switch (name) {
      /* Weapons -------------------------------------------------------- */
      case 'fire.assault':
        if (!this._gate('fa', 0.045)) return;
        this._burst({ dur: 0.09, gain: 0.22, cut: 2600, sweepTo: 700, type: 'bandpass', q: 1.2 });
        this._tone({ freq: 320, to: 120, type: 'square', dur: 0.06, gain: 0.13 });
        break;
      case 'fire.smg':
        if (!this._gate('fs', 0.025)) return;
        this._burst({ dur: 0.05, gain: 0.15, cut: 3400, sweepTo: 1200, type: 'bandpass', q: 1.6 });
        this._tone({ freq: 480, to: 220, type: 'square', dur: 0.04, gain: 0.09 });
        break;
      case 'fire.plasma':
        if (!this._gate('fp', 0.08)) return;
        this._tone({ freq: 180, to: 900, type: 'sawtooth', dur: 0.16, gain: 0.20 });
        this._tone({ freq: 900, to: 240, type: 'sine', dur: 0.22, gain: 0.16, delay: 0.02 });
        this._burst({ dur: 0.18, gain: 0.10, cut: 1800, sweepTo: 300 });
        break;

      /* Impacts and deaths --------------------------------------------- */
      case 'hit':
        if (!this._gate('hit', 0.035)) return;
        this._burst({ dur: 0.06, gain: 0.16, cut: 3000, sweepTo: 900, type: 'bandpass', q: 2 });
        break;
      case 'hit.shielded':
        if (!this._gate('hs', 0.05)) return;
        this._tone({ freq: 1400, to: 900, type: 'triangle', dur: 0.09, gain: 0.16 });
        break;
      case 'enemy.die':
        if (!this._gate('ed', 0.04)) return;
        this._burst({ dur: 0.3, gain: 0.28, cut: 1500, sweepTo: 130 });
        this._tone({ freq: 220, to: 45, type: 'square', dur: 0.24, gain: 0.16 });
        break;
      case 'elite.die':
        this._burst({ dur: 0.6, gain: 0.36, cut: 1200, sweepTo: 70 });
        this._tone({ freq: 160, to: 30, type: 'sawtooth', dur: 0.5, gain: 0.22 });
        this._tone({ freq: 900, to: 200, type: 'sine', dur: 0.35, gain: 0.14, delay: 0.05 });
        break;
      case 'explosion':
        this._burst({ dur: 0.55, gain: 0.40, cut: 900, sweepTo: 60 });
        this._tone({ freq: 90, to: 28, type: 'sine', dur: 0.45, gain: 0.30 });
        break;
      case 'enemy.fire':
        if (!this._gate('ef', 0.06)) return;
        this._tone({ freq: 700, to: 200, type: 'sawtooth', dur: 0.10, gain: 0.10 });
        break;
      case 'turret.charge':
        this._tone({ freq: 200, to: 1500, type: 'triangle', dur: 1.0, gain: 0.10 });
        break;
      case 'bomb.arm':
        this._tone({ freq: 1200, type: 'square', dur: 0.05, gain: 0.12 });
        this._tone({ freq: 1200, type: 'square', dur: 0.05, gain: 0.12, delay: 0.22 });
        this._tone({ freq: 1600, type: 'square', dur: 0.05, gain: 0.14, delay: 0.44 });
        break;

      /* Pickups -------------------------------------------------------- */
      case 'coin': {
        if (!this._gate('coin', 0.03)) return;
        const base = hz('E', 6) * (1 + (opt.streak || 0) * 0.03);
        this._tone({ freq: base, type: 'triangle', dur: 0.07, gain: 0.13 });
        this._tone({ freq: base * 1.5, type: 'triangle', dur: 0.09, gain: 0.10, delay: 0.045 });
        break;
      }
      case 'pickup':
        this._tone({ freq: hz('C', 5), type: 'triangle', dur: 0.09, gain: 0.16 });
        this._tone({ freq: hz('G', 5), type: 'triangle', dur: 0.11, gain: 0.14, delay: 0.06 });
        this._tone({ freq: hz('C', 6), type: 'triangle', dur: 0.14, gain: 0.12, delay: 0.12 });
        break;
      case 'powerup':
        for (let i = 0; i < 4; i++) {
          this._tone({ freq: hz('C', 5) * Math.pow(2, i / 4), type: 'square', dur: 0.1, gain: 0.11, delay: i * 0.055 });
        }
        break;
      case 'key':
        this._tone({ freq: hz('A', 5), type: 'triangle', dur: 0.12, gain: 0.16 });
        this._tone({ freq: hz('E', 6), type: 'triangle', dur: 0.18, gain: 0.14, delay: 0.09 });
        break;

      /* Crates and the drone ------------------------------------------- */
      case 'crate.detect':
        this._tone({ freq: hz('E', 5), type: 'sine', dur: 0.1, gain: 0.10 });
        this._tone({ freq: hz('B', 5), type: 'sine', dur: 0.1, gain: 0.09, delay: 0.08 });
        break;
      case 'crate.scan':
        this._tone({ freq: 600, to: 1500, type: 'sine', dur: opt.dur || 0.9, gain: 0.07 });
        break;
      case 'crate.open':
        this._burst({ dur: 0.14, gain: 0.20, cut: 2200, sweepTo: 500, type: 'bandpass', q: 1.5 });
        for (let i = 0; i < 5; i++) {
          this._tone({ freq: hz('G', 5) * Math.pow(2, i / 5), type: 'triangle', dur: 0.12, gain: 0.10, delay: 0.06 + i * 0.05 });
        }
        break;
      case 'drone.thrust':
        if (!this._gate('dt', 0.5)) return;
        this._burst({ dur: 0.35, gain: 0.05, cut: 700, sweepTo: 300 });
        break;
      case 'drone.fire':
        if (!this._gate('df', 0.09)) return;
        this._tone({ freq: 1100, to: 500, type: 'triangle', dur: 0.08, gain: 0.11 });
        break;
      case 'drone.lock':
        this._tone({ freq: hz('B', 5), type: 'square', dur: 0.05, gain: 0.08 });
        this._tone({ freq: hz('B', 5), type: 'square', dur: 0.05, gain: 0.08, delay: 0.09 });
        break;
      case 'drone.hurt':
        this._tone({ freq: 400, to: 140, type: 'sawtooth', dur: 0.16, gain: 0.14 });
        break;

      /* Player --------------------------------------------------------- */
      case 'jump':
        this._tone({ freq: 340, to: 620, type: 'triangle', dur: 0.1, gain: 0.11 });
        break;
      case 'land':
        if (!this._gate('land', 0.1)) return;
        this._burst({ dur: 0.08, gain: 0.13, cut: 500, sweepTo: 140 });
        break;
      case 'slide':
        this._burst({ dur: 0.4, gain: 0.11, cut: 1300, sweepTo: 500, type: 'bandpass', q: 0.8 });
        break;
      case 'damage':
        this._tone({ freq: 240, to: 70, type: 'sawtooth', dur: 0.22, gain: 0.24 });
        this._burst({ dur: 0.18, gain: 0.18, cut: 800, sweepTo: 200 });
        break;
      case 'shield.hit':
        this._tone({ freq: 900, to: 1500, type: 'sine', dur: 0.14, gain: 0.16 });
        break;
      case 'death':
        this._tone({ freq: 300, to: 40, type: 'sawtooth', dur: 0.9, gain: 0.26 });
        this._burst({ dur: 0.8, gain: 0.24, cut: 1200, sweepTo: 60 });
        break;

      /* The signature moment ------------------------------------------- */
      case 'rescue':
        // A rising sweep, an impact, then a shield shimmer.
        this._tone({ freq: 140, to: 1700, type: 'sawtooth', dur: 0.34, gain: 0.20 });
        this._burst({ dur: 0.3, gain: 0.28, cut: 2400, sweepTo: 400, delay: 0.3 });
        this._tone({ freq: hz('C', 5), type: 'sine', dur: 0.7, gain: 0.16, delay: 0.34 });
        this._tone({ freq: hz('G', 5), type: 'sine', dur: 0.7, gain: 0.14, delay: 0.38 });
        this._tone({ freq: hz('C', 6), type: 'sine', dur: 0.8, gain: 0.12, delay: 0.42 });
        break;

      /* Gadgets -------------------------------------------------------- */
      case 'gadget.shield':
        this._tone({ freq: 300, to: 1100, type: 'sine', dur: 0.3, gain: 0.18 });
        break;
      case 'gadget.emp':
        this._tone({ freq: 2000, to: 60, type: 'sawtooth', dur: 0.5, gain: 0.24 });
        this._burst({ dur: 0.45, gain: 0.22, cut: 3000, sweepTo: 120, type: 'bandpass', q: 0.7 });
        break;
      case 'gadget.missile':
        this._burst({ dur: 0.5, gain: 0.14, cut: 1800, sweepTo: 600, type: 'bandpass' });
        for (let i = 0; i < 3; i++) this._tone({ freq: 700, to: 2000, type: 'sawtooth', dur: 0.2, gain: 0.10, delay: i * 0.09 });
        break;
      case 'gadget.deny':
        this._tone({ freq: 200, to: 140, type: 'square', dur: 0.1, gain: 0.10 });
        break;

      /* Interface ------------------------------------------------------ */
      case 'ui.move':
        this._tone({ freq: hz('E', 5), type: 'square', dur: 0.04, gain: 0.07 });
        break;
      case 'ui.select':
        this._tone({ freq: hz('A', 5), type: 'square', dur: 0.05, gain: 0.09 });
        this._tone({ freq: hz('E', 6), type: 'square', dur: 0.07, gain: 0.08, delay: 0.05 });
        break;
      case 'ui.back':
        this._tone({ freq: hz('A', 4), type: 'square', dur: 0.06, gain: 0.08 });
        break;
      case 'ui.buy':
        this._tone({ freq: hz('C', 5), type: 'triangle', dur: 0.08, gain: 0.14 });
        this._tone({ freq: hz('E', 5), type: 'triangle', dur: 0.08, gain: 0.13, delay: 0.07 });
        this._tone({ freq: hz('G', 5), type: 'triangle', dur: 0.16, gain: 0.12, delay: 0.14 });
        break;
      case 'ui.deny':
        this._tone({ freq: 180, to: 120, type: 'square', dur: 0.14, gain: 0.11 });
        break;
      case 'mission':
        for (let i = 0; i < 3; i++) this._tone({ freq: hz('C', 5) * Math.pow(2, i / 3), type: 'triangle', dur: 0.16, gain: 0.13, delay: i * 0.11 });
        break;
      case 'streak':
        this._tone({ freq: hz('E', 6), type: 'triangle', dur: 0.07, gain: 0.09 });
        break;
    }
  }

  /* ---- Music -------------------------------------------------------------
     A four-bar loop: a driving bass line, an offbeat arpeggio and a slow pad.
     Written here as note data rather than a file. Two moods: menu and run. */

  static PATTERNS = {
    menu: {
      bpm: 92,
      bass:  ['A2', null, 'A2', null, 'F2', null, 'C3', null,
              'G2', null, 'G2', null, 'E2', null, 'E2', null],
      arp:   ['A4', 'C5', 'E5', 'C5', 'F4', 'A4', 'C5', 'A4',
              'G4', 'B4', 'D5', 'B4', 'E4', 'G4', 'B4', 'G4'],
      pad:   ['A3', null, null, null, 'F3', null, null, null,
              'G3', null, null, null, 'E3', null, null, null],
    },
    run: {
      bpm: 138,
      bass:  ['A2', 'A2', null, 'A2', 'A2', null, 'A2', 'A2',
              'F2', 'F2', null, 'F2', 'G2', null, 'G2', 'G2'],
      arp:   ['A5', 'E5', 'A4', 'E5', 'C5', 'E5', 'A4', 'C5',
              'F5', 'C5', 'A4', 'C5', 'G5', 'D5', 'B4', 'D5'],
      pad:   ['A3', null, null, null, null, null, null, null,
              'F3', null, null, null, 'G3', null, null, null],
    },
    /* Slower and heavier than the run track: a boss is a stand-up fight, not
       a chase. Minor second in the pad gives it the unease the runner lacks. */
    boss: {
      bpm: 104,
      bass:  ['D2', 'D2', null, 'D2', 'A#1', null, 'D2', null,
              'C2', 'C2', null, 'C2', 'G1', null, 'A#1', null],
      arp:   ['D4', null, 'F4', null, 'A4', null, 'F4', null,
              'C4', null, 'D#4', null, 'G4', null, 'D#4', null],
      pad:   ['D3', null, null, null, null, null, null, null,
              'A#2', null, null, null, null, null, null, null],
    },
  };

  static noteHz(n) {
    if (!n) return 0;
    const letter = n[0];
    const oct = parseInt(n.slice(1), 10);
    return hz(letter, oct);
  }

  startMusic(mood = 'run') {
    if (!this.ctx || !this.settings.music) return;
    if (this.mood === mood && this.musicTimer) return;
    this.stopMusic();
    this.mood = mood;
    const pat = Audio.PATTERNS[mood];
    const stepDur = 60 / pat.bpm / 2;      // eighth notes
    this.step = 0;
    const tick = () => {
      if (!this.settings.music || !this.ctx) { this.stopMusic(); return; }
      const i = this.step % 16;
      const b = Audio.noteHz(pat.bass[i]);
      if (b) this._tone({ freq: b, type: 'square', dur: stepDur * 0.85, gain: 0.16, bus: this.musicBus });
      const a = Audio.noteHz(pat.arp[i]);
      if (a) this._tone({ freq: a, type: 'triangle', dur: stepDur * 0.6, gain: 0.075, bus: this.musicBus });
      const p = Audio.noteHz(pat.pad[i]);
      if (p) {
        this._tone({ freq: p, type: 'sawtooth', dur: stepDur * 7, gain: 0.035, bus: this.musicBus });
        this._tone({ freq: p * 1.5, type: 'sawtooth', dur: stepDur * 7, gain: 0.022, bus: this.musicBus, detune: 6 });
      }
      // A closed hat on the offbeats keeps the pulse without a drum kit.
      if (i % 2 === 1) this._burst({ dur: 0.035, gain: 0.05, cut: 8000, type: 'highpass', bus: this.musicBus });
      if (i % 8 === 0) this._burst({ dur: 0.14, gain: 0.10, cut: 220, sweepTo: 60, bus: this.musicBus });
      this.step++;
    };
    tick();
    this.musicTimer = setInterval(tick, stepDur * 1000);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = 0; }
    this.mood = null;
  }
}
