/* ==========================================================================
   FiDo-5 — Input.
   One action vocabulary, three sources: keyboard, touch gestures and the
   on-screen buttons. Discrete actions are buffered for a short window so a
   swipe that lands a frame early still counts — the brief asks for forgiving
   controls and this is where that happens.

   Keyboard and pointer state are tracked separately and combined on read.
   Sharing one object meant releasing the mouse cleared directions the
   keyboard was still holding, so clicking to fire stopped the player dead.
   ========================================================================== */

const BUFFER = 0.15;        // s an unconsumed discrete action stays live
const SWIPE_MIN = 22;       // px before a drag counts as a swipe (at sensitivity 1)
const SWIPE_TIME = 0.5;     // s max for a gesture to read as a swipe
const TAP_MAX = 14;         // px of movement still considered a tap
const TAP_TIME = 0.28;      // s
const ACTIONS = ['fire', 'right', 'left', 'down', 'jump'];

export class Input {
  constructor(target, opts = {}) {
    this.target = target;
    this.sensitivity = opts.sensitivity ?? 1;
    this.onPause = opts.onPause || (() => {});
    this.onDebug = opts.onDebug || (() => {});
    this.onAnyInput = opts.onAnyInput || (() => {});

    // Discrete actions: name -> seconds of life remaining.
    this.buffered = Object.create(null);

    // Held state, tracked per source and reported as the union, so a key and
    // a button can never cancel each other out. `externalHeld` is for the
    // development tools, which drive the game without any real device.
    this.keyHeld = Object.create(null);
    this.pointerHeld = Object.create(null);
    this.externalHeld = Object.create(null);
    this.held = {};
    for (const name of ACTIONS) {
      this.keyHeld[name] = false;
      this.pointerHeld[name] = false;
      this.externalHeld[name] = false;
      Object.defineProperty(this.held, name, {
        enumerable: true,
        get: () => this.keyHeld[name] || this.pointerHeld[name] || this.externalHeld[name],
        // Assigning to held.x is meaningful rather than silently ignored: it
        // routes to the programmatic source.
        set: (v) => { this.externalHeld[name] = !!v; },
      });
    }

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

  /* Programmatic hold, used by the development tools. */
  setHeld(name, on) {
    if (name in this.externalHeld) this.externalHeld[name] = !!on;
  }

  clear() {
    this.buffered = Object.create(null);
    for (const name of ACTIONS) {
      this.keyHeld[name] = false;
      this.pointerHeld[name] = false;
      this.externalHeld[name] = false;
    }
    this._touches.clear();
    this._keys.clear();
    if (this._stickReset) this._stickReset();
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
          this.press('jump'); this.keyHeld.jump = true; break;
        case 's': case 'arrowdown':
          this.press('down'); this.keyHeld.down = true; break;
        case 'a': case 'arrowleft':
          this.keyHeld.left = true; this.press('left'); break;
        case 'd': case 'arrowright':
          this.keyHeld.right = true; this.press('right'); break;
        case 'j': case 'enter':
          this.keyHeld.fire = true; this.press('fire'); break;
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
        case ' ': case 'w': case 'arrowup': this.keyHeld.jump = false; break;
        case 's': case 'arrowdown':  this.keyHeld.down = false; break;
        case 'a': case 'arrowleft':  this.keyHeld.left = false; break;
        case 'd': case 'arrowright': this.keyHeld.right = false; break;
        case 'j': case 'enter':      this.keyHeld.fire = false; break;
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
      this._touches.set(id, {
        x: e.clientX, y: e.clientY, t: performance.now() / 1000,
        moved: 0, fired: false, mouse: e.pointerType === 'mouse',
      });
      // A press anywhere that is not a swipe becomes fire-and-hold.
      this.pointerHeld.fire = true;
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
      // A mouse drag is aiming or an accidental wobble, never a gesture: the
      // keyboard is right there. Gestures are for fingers and pens only.
      if (st.mouse) return;

      const min = SWIPE_MIN / Math.max(0.4, this.sensitivity);
      const age = performance.now() / 1000 - st.t;
      if (age > SWIPE_TIME) return;

      if (Math.abs(dy) >= min && Math.abs(dy) > Math.abs(dx) * 1.1) {
        this.press(dy < 0 ? 'jump' : 'down');
        if (dy > 0) this.pointerHeld.down = true;
        st.fired = true;
        this.pointerHeld.fire = false;      // a swipe is not a shot
      } else if (Math.abs(dx) >= min && Math.abs(dx) > Math.abs(dy) * 1.1) {
        // A horizontal swipe holds that direction until the finger lifts.
        this.press(dx > 0 ? 'right' : 'left');
        if (dx > 0) { this.pointerHeld.right = true; this.pointerHeld.left = false; }
        else { this.pointerHeld.left = true; this.pointerHeld.right = false; }
        st.fired = true;
        this.pointerHeld.fire = false;
      }
      e.preventDefault();
    };

    this._onUp = (e) => {
      const id = e.pointerId ?? 0;
      const st = this._touches.get(id);
      this._touches.delete(id);
      // Only the pointer's own contribution is released. Anything the
      // keyboard is holding stays held.
      this.pointerHeld.down = false;
      this.pointerHeld.right = false;
      this.pointerHeld.left = false;
      if (this._touches.size === 0) this.pointerHeld.fire = false;
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

  /* The movement stick.

     `zone` is the invisible region a thumb may land in, `base` the ring that
     moves to meet it, `knob` the part that follows the thumb. The ring is
     repositioned on touchdown rather than fixed, because a fixed stick has to
     be aimed at and a thumb on a phone is already somewhere.

     Left and right are held while pushed. Up and down are discrete — one jump
     or one slide per push, re-armed only once the stick comes back towards
     centre — so resting a thumb on the rim does not machine-gun the action.
     Down is also held, because a slide continues while it is. */
  bindStick(zone, base, knob) {
    if (!zone || !base || !knob) return;
    const DEAD = 0.34;       // how far before a direction counts at all
    const FIRE = 0.55;       // ...and before up or down triggers
    const REARM = 0.32;      // ...and back inside before it can trigger again
    let id = null, cx = 0, cy = 0, radius = 52;
    let upArmed = true, downArmed = true;

    const reset = () => {
      this.pointerHeld.left = false;
      this.pointerHeld.right = false;
      this.pointerHeld.down = false;
      upArmed = downArmed = true;
      knob.style.transform = 'translate(0px, 0px)';
      base.classList.remove('on-up', 'on-down', 'on-left', 'on-right');
      zone.classList.remove('is-live');
      base.style.left = '';
      base.style.bottom = '';
      base.style.top = '';
    };

    const place = (e) => {
      const zr = zone.getBoundingClientRect();
      const br = base.getBoundingClientRect();
      radius = Math.max(28, br.width / 2);
      // Keep the ring wholly inside the zone, so a thumb near an edge still
      // gets its full range of travel rather than half of it.
      cx = Math.min(Math.max(e.clientX, zr.left + radius), zr.right - radius);
      cy = Math.min(Math.max(e.clientY, zr.top + radius), zr.bottom - radius);
      base.style.left = (cx - zr.left) + 'px';
      base.style.top = (cy - zr.top) + 'px';
      base.style.bottom = 'auto';
    };

    const apply = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = dx / len * radius; dy = dy / len * radius; }
      knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      const nx = dx / radius, ny = dy / radius;

      const right = nx > DEAD, left = nx < -DEAD;
      if (right && !this.pointerHeld.right) this.press('right');
      if (left && !this.pointerHeld.left) this.press('left');
      this.pointerHeld.right = right;
      this.pointerHeld.left = left;

      if (ny < -FIRE && upArmed) { this.press('jump'); upArmed = false; }
      if (ny > -REARM) upArmed = true;

      if (ny > FIRE && downArmed) { this.press('down'); downArmed = false; }
      if (ny < REARM) downArmed = true;
      this.pointerHeld.down = ny > DEAD;

      base.classList.toggle('on-right', right);
      base.classList.toggle('on-left', left);
      base.classList.toggle('on-up', ny < -DEAD);
      base.classList.toggle('on-down', ny > DEAD);
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled || id !== null) return;
      id = e.pointerId ?? 0;
      zone.classList.add('is-live');
      try { zone.setPointerCapture(id); } catch (_) { /* not captured, fine */ }
      place(e);
      apply(e);
      this.onAnyInput();
    });
    zone.addEventListener('pointermove', (e) => {
      if (id === null || (e.pointerId ?? 0) !== id) return;
      e.preventDefault();
      e.stopPropagation();
      apply(e);
    });
    const release = (e) => {
      if (id === null || (e.pointerId ?? 0) !== id) return;
      id = null;
      reset();
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('lostpointercapture', release);
    this._stickReset = reset;
  }

  /* On-screen buttons register themselves; each is a large touch target. */
  bindButton(el, action, mode = 'press') {
    if (!el) return;
    el.setAttribute('data-btn', action);
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      el.classList.add('is-down');
      this.press(action);
      if (mode === 'hold') this.pointerHeld[action] = true;
    };
    const up = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      el.classList.remove('is-down');
      if (mode === 'hold') this.pointerHeld[action] = false;
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
