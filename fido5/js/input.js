/* ==========================================================================
   FiDo-5 — Input.
   One action vocabulary, three sources: keyboard, the movement stick and the
   on-screen buttons. Discrete actions are buffered for a short window so a
   press that lands a frame early still counts — the brief asks for forgiving
   controls and this is where that happens.

   Keyboard and pointer state are tracked separately and combined on read.
   Sharing one object meant releasing the mouse cleared directions the
   keyboard was still holding, so clicking to fire stopped the player dead.
   ========================================================================== */

const BUFFER = 0.15;        // s an unconsumed discrete action stays live
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
    this._btnReleases = [];
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
    for (const up of this._btnReleases) up(null);
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
        x: e.clientX, y: e.clientY, t: performance.now() / 1000, moved: 0,
      });
      // A press anywhere that is not a swipe becomes fire-and-hold.
      this.pointerHeld.fire = true;
      this.press('fire');
      if (t.setPointerCapture) { try { t.setPointerCapture(id); } catch (_) {} }
      e.preventDefault();
    };

    /* Movement gestures used to live here — swipe up to jump, down to slide,
       sideways to run. They are gone. Every direction is on the stick and jump
       has a button of its own, so a swipe could only ever be a second, less
       precise way to do the same thing, firing off a threshold the player
       cannot see. Two paths to one action is how a jump comes out as a slide.

       Tap-and-hold to fire stays: it is the one action with no direction to
       get wrong, there is no auto-fire, and a thumb anywhere on the open right
       of the screen shooting is worth keeping. */
    this._onMove = (e) => {
      const id = e.pointerId ?? 0;
      const st = this._touches.get(id);
      if (!st) return;
      st.moved = Math.max(st.moved, Math.hypot(e.clientX - st.x, e.clientY - st.y));
    };

    this._onUp = (e) => {
      const id = e.pointerId ?? 0;
      const st = this._touches.get(id);
      this._touches.delete(id);
      // Only the pointer's own contribution is released. Anything the
      // keyboard is holding stays held.
      if (this._touches.size === 0) this.pointerHeld.fire = false;
      if (st && st.moved <= TAP_MAX && performance.now() / 1000 - st.t <= TAP_TIME) {
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

     Three directions, not four: left and right are held while pushed, down is
     discrete and re-arms only once the stick comes back towards centre, so
     resting a thumb on the rim does not machine-gun a slide. Down is held as
     well as pressed, because a slide continues while it is. Up is deliberately
     nothing — jump has a button. */
  bindStick(zone, base, knob) {
    if (!zone || !base || !knob) return;
    const DEAD = 0.34;       // how far before a direction counts at all
    const FIRE = 0.55;       // ...and before down triggers a slide
    const REARM = 0.32;      // ...and back inside before it can trigger again
    let id = null, cx = 0, cy = 0, radius = 52, ringR = 52;
    let downArmed = true;

    const reset = () => {
      this.pointerHeld.left = false;
      this.pointerHeld.right = false;
      this.pointerHeld.down = false;
      downArmed = true;
      knob.style.transform = 'translate(0px, 0px)';
      base.classList.remove('on-down', 'on-left', 'on-right');
      zone.classList.remove('is-live');
      base.style.left = '';
      base.style.bottom = '';
      base.style.top = '';
    };

    /* The origin is the point the thumb actually landed on, never a clamped
       one. Clamping it and then measuring the raw touch against it reports a
       full deflection on the very first frame — land low in the zone and the
       game reads a slide before the thumb has moved at all, which on a
       landscape phone is most of the time, because thumbs rest low.

       Only the ring's drawn position is clamped, and only so it stays on
       screen. A touchdown always starts neutral. */
    const place = (e) => {
      const zr = zone.getBoundingClientRect();
      const br = base.getBoundingClientRect();
      ringR = Math.max(28, br.width / 2);
      // Sensitivity is how far the thumb travels for full deflection, which is
      // not the same as how big the ring is drawn: the knob is always scaled
      // back to the rim so the ring keeps telling the truth about deflection.
      radius = ringR / Math.min(2, Math.max(0.5, this.sensitivity || 1));
      cx = e.clientX;
      cy = e.clientY;
      const drawX = Math.min(Math.max(cx, zr.left + radius), zr.right - radius);
      const drawY = Math.min(Math.max(cy, zr.top + radius), zr.bottom - radius);
      base.style.left = (drawX - zr.left) + 'px';
      base.style.top = (drawY - zr.top) + 'px';
      base.style.bottom = 'auto';
    };

    const apply = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        // Full deflection reached: drag the origin along behind the thumb.
        // Without the centre clamp there is nothing else keeping a direction
        // reachable from a touchdown near an edge — the thumb simply runs out
        // of screen. Sliding the origin gives every direction its full travel
        // wherever the thumb started, and reversing gets the range back at
        // once.
        cx = e.clientX - (dx / len) * radius;
        cy = e.clientY - (dy / len) * radius;
        dx = dx / len * radius;
        dy = dy / len * radius;
      }
      const nx = dx / radius, ny = dy / radius;
      knob.style.transform =
        `translate(${(nx * ringR).toFixed(1)}px, ${(ny * ringR).toFixed(1)}px)`;

      const right = nx > DEAD, left = nx < -DEAD;
      if (right && !this.pointerHeld.right) this.press('right');
      if (left && !this.pointerHeld.left) this.press('left');
      this.pointerHeld.right = right;
      this.pointerHeld.left = left;

      /* Up does nothing. Jump is a button, and it was the only thing the stick
         did that also lived somewhere else — two ways to jump meant a thumb
         drifting up mid-turn produced one the player never asked for. Pushing
         up is neutral now, and up-and-right is simply right. */
      if (ny > FIRE && downArmed) { this.press('down'); downArmed = false; }
      if (ny < REARM) downArmed = true;
      this.pointerHeld.down = ny > DEAD;

      base.classList.toggle('on-right', right);
      base.classList.toggle('on-left', left);
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

  /* On-screen buttons register themselves; each is a large touch target.

     The release is also watched on the window, not only on the button. Touch
     gives the element implicit pointer capture, so the matching pointerup
     usually comes back here — but not when the capture is lost, and a
     held button whose release went missing stays held for the rest of the run:
     permanent auto-fire, or a jump that can never be cut short. */
  bindButton(el, action, mode = 'press') {
    if (!el) return;
    el.setAttribute('data-btn', action);
    let heldBy = null;
    const up = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      heldBy = null;
      el.classList.remove('is-down');
      if (mode === 'hold') this.pointerHeld[action] = false;
    };
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      heldBy = e.pointerId ?? 0;
      el.classList.add('is-down');
      this.press(action);
      if (mode === 'hold') this.pointerHeld[action] = true;
    };
    const release = (e) => { if (heldBy !== null && (e.pointerId ?? 0) === heldBy) up(null); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this._btnReleases.push(up);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }
}
