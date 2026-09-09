/* ==========================================================================
   FiDo-5 — Voice.
   Speaks the drone's lines. A recorded clip is used when one has been
   supplied; otherwise the browser's own speech synthesis stands in, pitched
   down so it reads as a machine rather than a narrator.

   Drop files named after the line ids into fido5/audio/vo/ alongside a
   manifest.json listing which ids exist, and those lines start speaking with
   no code change. Synthesis is currently off (see VOICE.useSynthesis), so a
   line with no recording is simply silent.

   Subtitles are drawn regardless of this module, so the writing is never lost
   when the voice is off, unrecorded or unavailable.
   ========================================================================== */

import { VOICE } from './data.js';

export class Voice {
  constructor(settings, audio) {
    this.settings = settings;
    this.audio = audio;               // shared Audio instance, for the bus
    this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    this.voice = null;
    this.recorded = null;             // Set of ids with a recording, once known
    this.buffers = new Map();         // id -> decoded AudioBuffer
    this.pending = new Set();
    this.current = null;
    this.started = false;
  }

  /* Called from the first user gesture, alongside the audio context. */
  init() {
    if (this.started) return;
    this.started = true;
    this._pickVoice();
    if (this.synth && typeof this.synth.addEventListener === 'function') {
      // Chrome populates the voice list asynchronously.
      this.synth.addEventListener('voiceschanged', () => this._pickVoice());
    }
    this._loadManifest();
  }

  /* Prefer a local English voice: it works offline and has no network lag.
     No attempt is made to pick a "male" or "female" voice — FiDo-5 is a
     machine, and the pitch and rate below are what give it its character. */
  _pickVoice() {
    if (!this.synth) return;
    let list = [];
    try { list = this.synth.getVoices() || []; } catch (e) { return; }
    if (!list.length) return;
    const en = list.filter((v) => /^en/i.test(v.lang || ''));
    const pool = en.length ? en : list;
    this.voice = pool.find((v) => v.localService) || pool[0] || null;
  }

  /* A missing manifest is the normal case: it just means no recordings yet. */
  _loadManifest() {
    if (this.recorded) return;
    fetch(VOICE.manifest, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((list) => {
        this.recorded = new Set(Array.isArray(list) ? list : []);
      })
      .catch(() => { this.recorded = new Set(); });
  }

  /* ---- Playback --------------------------------------------------------- */

  speak(line) {
    if (!line || !this.settings.voice) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.stop();
    if (this.recorded && this.recorded.has(line.id)) this._playClip(line);
    else this._synthesise(line);
  }

  _synthesise(line) {
    if (!VOICE.useSynthesis) return;      // recordings only
    if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(line.text);
      if (this.voice) u.voice = this.voice;
      u.pitch = VOICE.pitch;
      u.rate = VOICE.rate;
      u.volume = VOICE.volume;
      this.current = u;
      this.synth.speak(u);
    } catch (e) {
      /* Speech synthesis is unavailable or blocked. The subtitle still shows. */
    }
  }

  _playClip(line) {
    const ctx = this.audio && this.audio.ctx;
    if (!ctx) return;
    const buf = this.buffers.get(line.id);
    if (buf) { this._playBuffer(buf); return; }
    if (this.pending.has(line.id)) return;
    this.pending.add(line.id);
    fetch(VOICE.dir + line.id + VOICE.ext)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing'))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((decoded) => {
        this.buffers.set(line.id, decoded);
        this.pending.delete(line.id);
        this._playBuffer(decoded);
      })
      .catch(() => {
        // Drop it from the recorded set so the line falls back from now on.
        this.pending.delete(line.id);
        if (this.recorded) this.recorded.delete(line.id);
        this._synthesise(line);
      });
  }

  _playBuffer(buf) {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // A gentle band-pass gives recorded lines the same over-the-radio quality
    // the rest of the drone's sounds have.
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1650;
    band.Q.value = 0.7;
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    const wet = ctx.createGain();
    wet.gain.value = 0.75;
    const out = ctx.createGain();
    out.gain.value = VOICE.volume;
    src.connect(band).connect(wet).connect(out);
    src.connect(dry).connect(out);
    out.connect(this.audio.master || ctx.destination);
    src.start();
    this.current = src;
  }

  stop() {
    if (this.synth) { try { this.synth.cancel(); } catch (e) { /* ignore */ } }
    if (this.current && typeof this.current.stop === 'function') {
      try { this.current.stop(); } catch (e) { /* already finished */ }
    }
    this.current = null;
  }
}
