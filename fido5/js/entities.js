/* ==========================================================================
   FiDo-5 — Pools and particles.
   Every transient object in the run comes from a fixed-size pool, so a long
   session allocates almost nothing after the first few seconds. Caps are hard:
   when a pool is full the oldest-style request simply fails, which keeps the
   frame budget predictable on a phone instead of degrading without limit.
   ========================================================================== */

export class Pool {
  constructor(make, cap) {
    this.make = make;
    this.cap = cap;
    this.items = [];
    this.cursor = 0;
    this.live = 0;
  }

  /* Reuse a dead slot if there is one, else grow up to the cap. */
  get() {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const o = this.items[idx];
      if (!o.alive) {
        this.cursor = (idx + 1) % n;
        o.alive = true;
        this.live++;
        return o;
      }
    }
    if (n >= this.cap) return null;
    const o = this.make();
    o.alive = true;
    this.items.push(o);
    this.live++;
    return o;
  }

  kill(o) { if (o.alive) { o.alive = false; this.live--; } }

  each(fn) {
    for (let i = 0; i < this.items.length; i++) {
      const o = this.items[i];
      if (o.alive) fn(o, i);
    }
  }

  /* Iterate and drop anything the callback returns false for. */
  sweep(fn) {
    for (let i = 0; i < this.items.length; i++) {
      const o = this.items[i];
      if (!o.alive) continue;
      if (fn(o) === false) { o.alive = false; this.live--; }
    }
  }

  clear() {
    for (const o of this.items) o.alive = false;
    this.live = 0;
  }
}

/* ---- Factories ---------------------------------------------------------- */

export const makeBullet = () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, crit: false,
  from: 'player', pierce: 0, hit: null, life: 0, colour: 'A', w: 5, h: 2, effect: null,
});

export const makeParticle = () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1,
  size: 1, colour: 'E', grav: 0, fade: true, kind: 'dot', spin: 0, a: 0,
});

export const makeCoin = () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, drawn: false, magnet: false, value: 1,
});

export const makePickup = () => ({
  alive: false, x: 0, y: 0, vy: 0, t: 0, kind: 'health', amount: 0, id: null, tier: 0,
});

export const makeCrate = () => ({
  alive: false, x: 0, y: 0, tier: 0, rarity: 'common', state: 'idle',
  scan: 0, scanTime: 1, opened: false, detected: false, bob: 0,
  carried: false, lingering: 0,
});

export const makeEnemy = () => ({
  alive: false, def: null, x: 0, y: 0, tier: 0, hp: 0, maxHp: 0,
  elite: false, scale: 1, t: 0, vy: 0, vx: 0, cool: 0, state: 'idle',
  charge: 0, stun: 0, flash: 0, burn: 0, burnT: 0, dying: 0, aim: 0,
  bobPhase: 0, damage: 0, score: 0, coins: 0, marked: false, seen: false,
});

export const makeFloater = () => ({
  alive: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', colour: 'E', size: 1,
});

export const makeBlast = () => ({
  alive: false, x: 0, y: 0, r: 0, maxR: 40, life: 0, max: 0.4, colour: 'A', from: 'enemy', dmg: 0, done: false,
});

/* ---- Particle helpers ---------------------------------------------------
   `quality` scales every burst so the low setting genuinely costs less rather
   than just drawing smaller. */

export class Particles {
  constructor(cap = 420) {
    this.pool = new Pool(makeParticle, cap);
    this.quality = 1;
  }

  set(quality) { this.quality = quality; }

  spawn(n, fn) {
    const count = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < count; i++) {
      const p = this.pool.get();
      if (!p) return;
      p.grav = 0; p.fade = true; p.kind = 'dot'; p.spin = 0; p.a = 0; p.size = 1;
      fn(p, i, count);
    }
  }

  update(dt, scrollX) {
    this.pool.sweep((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.a += p.spin * dt;
      if (p.x < scrollX - 80) return false;
      return true;
    });
  }

  clear() { this.pool.clear(); }

  /* --- Named effects. Each is a recipe so callers stay readable. --- */

  muzzle(x, y, colour) {
    this.spawn(4, (p, i) => {
      p.x = x; p.y = y;
      p.vx = 120 + Math.random() * 220;
      p.vy = (Math.random() - 0.5) * 90;
      p.life = p.max = 0.07 + Math.random() * 0.06;
      p.colour = i === 0 ? 'E' : colour;
      p.size = i === 0 ? 2 : 1;
    });
  }

  impact(x, y, colour) {
    this.spawn(5, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 130;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s - 40;
      p.vy = Math.sin(a) * s;
      p.life = p.max = 0.12 + Math.random() * 0.14;
      p.colour = Math.random() < 0.4 ? 'E' : colour;
      p.size = 1;
    });
  }

  explode(x, y, size = 1, colour = 'A') {
    this.spawn(Math.round(16 * size), (p, i, n) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const s = (50 + Math.random() * 190) * size;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - 30;
      p.life = p.max = 0.25 + Math.random() * 0.35;
      p.grav = 260;
      p.colour = Math.random() < 0.35 ? 'E' : (Math.random() < 0.6 ? colour : 'O');
      p.size = Math.random() < 0.3 ? 2 : 1;
    });
    this.spawn(Math.round(6 * size), (p) => {
      p.x = x + (Math.random() - 0.5) * 14 * size;
      p.y = y + (Math.random() - 0.5) * 14 * size;
      p.vx = (Math.random() - 0.5) * 30;
      p.vy = -20 - Math.random() * 40;
      p.life = p.max = 0.4 + Math.random() * 0.4;
      p.colour = 'b';
      p.kind = 'smoke';
      p.size = 2 + Math.random() * 2;
    });
  }

  debris(x, y, colour) {
    this.spawn(7, (p) => {
      p.x = x; p.y = y;
      p.vx = (Math.random() - 0.5) * 180 - 30;
      p.vy = -60 - Math.random() * 150;
      p.grav = 620;
      p.life = p.max = 0.4 + Math.random() * 0.5;
      p.colour = colour;
      p.size = 1 + (Math.random() < 0.4 ? 1 : 0);
    });
  }

  thruster(x, y, colour) {
    this.spawn(1, (p) => {
      p.x = x; p.y = y;
      p.vx = -50 - Math.random() * 40;
      p.vy = 20 + Math.random() * 40;
      p.life = p.max = 0.14 + Math.random() * 0.1;
      p.colour = colour;
      p.size = 1;
    });
  }

  dust(x, y) {
    this.spawn(3, (p) => {
      p.x = x + (Math.random() - 0.5) * 10;
      p.y = y;
      p.vx = -60 - Math.random() * 70;
      p.vy = -10 - Math.random() * 40;
      p.grav = 120;
      p.life = p.max = 0.2 + Math.random() * 0.2;
      p.colour = 'b';
      p.size = 1;
    });
  }

  sparkle(x, y, colour) {
    this.spawn(8, (p, i, n) => {
      const a = (i / n) * Math.PI * 2;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * 90;
      p.vy = Math.sin(a) * 90 - 20;
      p.grav = 180;
      p.life = p.max = 0.3 + Math.random() * 0.25;
      p.colour = i % 2 ? 'E' : colour;
      p.size = 1;
    });
  }

  shieldRing(x, y, colour) {
    this.spawn(14, (p, i, n) => {
      const a = (i / n) * Math.PI * 2;
      p.x = x + Math.cos(a) * 6;
      p.y = y + Math.sin(a) * 6;
      p.vx = Math.cos(a) * 150;
      p.vy = Math.sin(a) * 150;
      p.life = p.max = 0.3;
      p.colour = colour;
      p.size = 2;
    });
  }
}
