/* ==========================================================================
   FiDo-5 — Input.
   One action vocabulary, three sources: keyboard, touch gestures and the
   on-screen buttons. Discrete actions are buffered for a short window so a
   swipe that lands a frame early still counts — the brief asks for forgiving
   controls and this is where that happens.
   ========================================================================== */

const BUFFER = 0.15;        // s an unconsumed discrete action stays live
const SWIPE_MIN = 22;       // px before a drag counts as a swipe (at sensitivity 1)
const SWIPE_TIME = 0.5;     // s max for a gesture to read as a swipe
const TAP_MAX = 14;         // px of movement still considered a tap
const TAP_TIME = 0.28;      // s

export class Input {
  constructor(target, opts = {}) {
    this.target = target;
    this.sensitivity = opts.sensitivity ?? 1;
    this.onPause = opts.onPause || (() => {});
    this.onDebug = opts.onDebug || (() => {});
    this.onAnyInput = opts.onAnyInput || (() => {});

    // Discrete actions: name -> seconds of life remaining.
    this.buffered = Object.create(null);
    // Held states.
    this.held = { fire: false, right: false, left: false, down: false, jump: false };
    this.enabled = true;

    this._touches = new Map();
    this._keys = new Set();
    this._bind();
  }

  /* ---- Public API ---- */

  /* Consume a discrete action if it happened recently. */
  take(name) {
    if (this.buffered[name] > 0) { this.buffered[name] = 0; return true; }
    return false;
  }

  /* Peek without consuming. */
  has(name) { return this.buffered[name] > 0; }

  press(name) {
    this.buffered[name] = BUFFER;
    this.onAnyInput();
  }

  tick(dt) {
    for (const k in this.buffered) {
      if (this.buffered[k] > 0) this.buffered[k] = Math.max(0, this.buffered[k] - dt);
    }
  }

  clear() {
    this.buffered = Object.create(null);
    this.held.fire = this.held.right = this.held.left = this.held.down = this.held.jump = false;
    this._touches.clear();
    this._keys.clear();
  }

  setSensitivity(v) { this.sensitivity = v; }

  /* ---- Wiring ---- */

  _bind() {
    // Keyboard --------------------------------------------------------------
    this._onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // Pause and debug work even when gameplay input is disabled.
      if (k === 'escape' || k === 'p') { this.onPause(); e.preventDefault(); return; }
      if (k === '`' || k === '~') { this.onDebug(); e.preventDefault(); return; }
      if (!this.enabled) return;
      if (this._keys.has(k)) { e.preventDefault(); return; }   // ignore auto-repeat
      this._keys.add(k);

      switch (k) {
        case ' ': case 'w': case 'arrowup':
          this.press('jump'); this.held.jump = true; break;
        case 's': case 'arrowdown':
          this.press('down'); this.held.down = true; break;
        case 'a': case 'arrowleft':
          this.held.left = true; this.press('left'); break;
        case 'd': case 'arrowright':
          this.held.right = true; this.press('right'); break;
        case 'j': case 'enter':
          this.held.fire = true; this.press('fire'); break;
        case 'k': case 'e': case 'shift':
          this.press('gadget'); break;
        default: return;
      }
      e.preventDefault();
      this.onAnyInput();
    };

    this._onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      this._keys.delete(k);
      switch (k) {
        case ' ': case 'w': case 'arrowup': this.held.jump = false; break;
        case 's': case 'arrowdown':  this.held.down = false; break;
        case 'a': case 'arrowleft':  this.held.left = false; break;
        case 'd': case 'arrowright': this.held.right = false; break;
        case 'j': case 'enter':      this.held.fire = false; break;
      }
    };

    // Blur must release everything or the player runs off on their own.
    this._onBlur = () => this.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    // Touch / pointer -------------------------------------------------------
    const t = this.target;
    this._onDown = (e) => {
      if (!this.enabled) return;
      // Buttons in the touch overlay handle their own events.
      if (e.target && e.target.closest && e.target.closest('[data-btn]')) return;
      const id = e.pointerId ?? 0;
      this._touches.set(id, { x: e.clientX, y: e.clientY, t: performance.now() / 1000, moved: 0, fired: false });
      // A press anywhere that is not a swipe becomes fire-and-hold.
      this.held.fire = true;
      this.press('fire');
      if (t.setPointerCapture) { try { t.setPointerCapture(id); } catch (_) {} }
      e.preventDefault();
    };

    this._onMove = (e) => {
      const id = e.pointerId ?? 0;
      const st = this._touches.get(id);
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      st.moved = Math.max(st.moved, Math.hypot(dx, dy));
      if (st.fired) return;

      const min = SWIPE_MIN / Math.max(0.4, this.sensitivity);
      const age = performance.now() / 1000 - st.t;
      if (age > SWIPE_TIME) return;

      if (Math.abs(dy) >= min && Math.abs(dy) > Math.abs(dx) * 1.1) {
        this.press(dy < 0 ? 'jump' : 'down');
        if (dy > 0) this.held.down = true;
        st.fired = true;
        this.held.fire = false;         // a swipe is not a shot
      } else if (Math.abs(dx) >= min && Math.abs(dx) > Math.abs(dy) * 1.1) {
        // A horizontal swipe holds that direction until the finger lifts.
        this.press(dx > 0 ? 'right' : 'left');
        if (dx > 0) { this.held.right = true; this.held.left = false; }
        else { this.held.left = true; this.held.right = false; }
        st.fired = true;
        this.held.fire = false;
      }
      e.preventDefault();
    };

    this._onUp = (e) => {
      const id = e.pointerId ?? 0;
      const st = this._touches.get(id);
      this._touches.delete(id);
      this.held.down = false;
      this.held.right = false;
      this.held.left = false;
      if (this._touches.size === 0) this.held.fire = false;
      if (st && !st.fired && st.moved <= TAP_MAX && performance.now() / 1000 - st.t <= TAP_TIME) {
        this.press('fire');             // deliberate single tap
      }
    };

    t.addEventListener('pointerdown', this._onDown, { passive: false });
    t.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    // Stop the browser turning a swipe into a scroll or a pull-to-refresh.
    t.addEventListener('touchstart', (e) => { if (this.enabled) e.preventDefault(); }, { passive: false });
    t.addEventListener('touchmove', (e) => { if (this.enabled) e.preventDefault(); }, { passive: false });
    t.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* On-screen buttons register themselves; each is a large touch target. */
  bindButton(el, action, mode = 'press') {
    el.setAttribute('data-btn', action);
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      el.classList.add('is-down');
      this.press(action);
      if (mode === 'hold') this.held[action] = true;
    };
    const up = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      el.classList.remove('is-down');
      if (mode === 'hold') this.held[action] = false;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }
}
