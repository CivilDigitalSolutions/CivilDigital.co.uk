/* ==========================================================================
   FiDo-5 — Bosses.
   A boss is a sector gate: the camera stops, the walls come in, and the run
   does not continue until the thing in front of you is dead.

   The state machine is deliberately readable, because every attack has to be
   readable too. A boss that kills you without warning is a bug in a game
   whose whole first minute teaches you to watch for a telegraph.

   Lives are spent here and nowhere else — see Game._onDeath.
   ========================================================================== */

import { WORLD, BOSSES, BOSS_ATTACKS, SECTORS } from './data.js';
import { clamp } from './world.js';

/* Phases, in the order they cycle:
     wait     — pacing, choosing what to do next
     telegraph— winding up, attack colour showing, still armoured
     strike   — the attack lands
     recover  — core exposed, armour off: this is the damage window
     dying    — death throes, then the gate opens */

export class Boss {
  constructor() {
    this.active = false;
    this.def = null;
    this.dying = 0;
    this.shots = [];        // arcing flak in flight
    this.waves = [];        // stomp shockwaves in flight
  }

  /* `pass` is how many times the roster has looped; each pass hardens it. */
  spawn(ctx, def, arena, pass = 0) {
    const hpMul = 1 + pass * 0.55;
    this.def = def;
    this.active = true;
    this.arena = arena;
    this.pass = pass;
    this.maxHp = Math.round(def.health * hpMul);
    this.hp = this.maxHp;
    this.tier = def.tier;
    // Enters from the far end of the arena, facing the player.
    this.x = arena.endX - def.w;
    this.y = WORLD.tierY[def.tier] - def.h / 2;
    this.vx = 0;
    this.dir = -1;
    this.phase = 'wait';
    this.t = 0;
    this.phaseT = 1.2;
    this.attack = null;
    this.flash = 0;
    this.hitT = 0;
    this.shots = [];        // arcing flak
    this.waves = [];        // stomp shockwaves
    this.collapsed = [];    // walkway columns already taken away
    this.dying = 0;
    this.speedMul = 1 + pass * 0.15;
  }

  clear() {
    this.active = false;
    this.shots.length = 0;
    this.waves.length = 0;
  }

  get exposed() { return this.phase === 'recover'; }
  get hpFrac() { return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0; }

  /* ---- Damage --------------------------------------------------------- */

  hurt(ctx, amount) {
    if (!this.active || this.dying > 0) return 0;
    const mul = this.exposed ? 1 : this.def.armour;
    const dealt = amount * mul;
    this.hp = Math.max(0, this.hp - dealt);
    this.flash = 0.12;
    this.hitT = 0.2;
    if (this.hp <= 0) this._die(ctx);
    return dealt;
  }

  _die(ctx) {
    this.dying = 1.6;
    this.phase = 'dying';
    this.shots.length = 0;
    this.waves.length = 0;
    ctx.audio.play('explosion');
  }

  /* ---- Update --------------------------------------------------------- */

  update(dt, ctx) {
    if (!this.active) return;
    const p = ctx.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hitT = Math.max(0, this.hitT - dt);

    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < 0.5) this._debris(ctx);
      if (this.dying <= 0) this.active = false;   // _sector picks the clear up
      return;
    }

    this._updateWaves(dt, ctx);
    this._updateShots(dt, ctx);

    this.phaseT -= dt;
    switch (this.phase) {
      case 'wait':      this._wait(dt, ctx, p); break;
      case 'telegraph': if (this.phaseT <= 0) this._strike(ctx, p); break;
      case 'strike':
        if (this.attack === 'charge') this._charge(dt, ctx, p);
        if (this.phaseT <= 0) this._enter('recover', this.def.recover);
        break;
      case 'recover':   if (this.phaseT <= 0) this._enter('wait', 0.5 + Math.random() * 0.7); break;
    }

    // Walking into it hurts, so it cannot be simply stood on top of.
    if (this._overlaps(p)) ctx.onPlayerHit && ctx.onPlayerHit(this.def.contact * dt * 2);
  }

  _enter(phase, time) { this.phase = phase; this.phaseT = time; }

  /* The charge commits: it picks a direction on the wind-up and does not
     steer, so it is dodged by moving, not by out-running it. Hitting a wall
     ends it early and leaves the boss exposed for longer, which is the
     reward for baiting it. */
  _charge(dt, ctx, p) {
    const a = BOSS_ATTACKS.charge;
    const speed = a.speed * this.speedMul;
    this.x += this.dir * speed * dt;
    ctx.particles.dust(this.x - this.dir * this.def.w / 2, WORLD.tierY[0]);
    if (this._overlaps(p) && !this.chargeHit) {
      this.chargeHit = true;
      ctx.onPlayerHit && ctx.onPlayerHit(a.damage * this._dmgMul());
    }
    const min = this.arena.startX + this.def.w / 2;
    const max = this.arena.endX - this.def.w / 2;
    if (this.x <= min || this.x >= max) {
      this.x = clamp(this.x, min, max);
      ctx.audio.play('explosion');
      ctx.particles.debris(this.x + this.dir * this.def.w / 2, WORLD.tierY[0] - 10, 'A');
      // Stunned by its own momentum: a longer damage window.
      this._enter('recover', this.def.recover * 1.6);
    }
  }

  _wait(dt, ctx, p) {
    // Drift towards the player so the fight does not stall at opposite ends.
    const want = p.x + (p.x < this.x ? 60 : -60);
    const step = this.def.walkSpeed * this.speedMul * dt;
    if (Math.abs(want - this.x) > 4) this.x += Math.sign(want - this.x) * step;
    this.dir = p.x < this.x ? -1 : 1;
    this.x = clamp(this.x, this.arena.startX + this.def.w / 2, this.arena.endX - this.def.w / 2);

    if (this.phaseT <= 0) {
      const pool = this.def.attacks;
      this.attack = pool[Math.floor(Math.random() * pool.length)];
      this._enter('telegraph', this.def.telegraph);
      ctx.audio.play('turret.charge');
    }
  }

  _strike(ctx, p) {
    const a = BOSS_ATTACKS[this.attack];
    switch (this.attack) {
      case 'stomp': {
        ctx.audio.play('explosion');
        ctx.particles.dust(this.x, WORLD.tierY[0]);
        for (const dir of [-1, 1]) {
          this.waves.push({ x: this.x, dir, life: a.waveLife, hit: false });
        }
        if (a.collapse) this._collapse(ctx);
        this._enter('strike', 0.25);
        break;
      }
      case 'flak': {
        ctx.audio.play('enemy.fire');
        for (let i = 0; i < a.shots; i++) {
          const spread = (i / (a.shots - 1) - 0.5) * 2 * a.spread;
          this.shots.push({
            x: this.x, y: this.y - this.def.h / 2,
            vx: this.dir * a.speed * (0.6 + Math.abs(spread)),
            vy: -150 - Math.random() * 40 + spread * 60,
            life: 3,
          });
        }
        this._enter('strike', 0.3);
        break;
      }
      case 'charge': {
        ctx.audio.play('enemy.fire');
        this.chargeHit = false;
        this.dir = p.x < this.x ? -1 : 1;
        this._enter('strike', a.duration);
        break;
      }
    }
  }

  /* The stomp takes a walkway ledge away, so the arena closes down over the
     course of the fight and the safe options run out. */
  _collapse(ctx) {
    const w = ctx.world;
    const cols = [];
    for (let c = this.arena.startCol; c <= this.arena.endCol; c++) {
      if (w.hasPlatform(c, 1) && !this.collapsed.includes(c)) cols.push(c);
    }
    if (!cols.length) return;
    // Take the run of ledge nearest the boss.
    const near = cols.reduce((a, b) =>
      Math.abs(w.xOfCol(b) - this.x) < Math.abs(w.xOfCol(a) - this.x) ? b : a);
    for (let c = near - 3; c <= near + 3; c++) {
      const col = w.col(c);
      if (col && col.p[1]) {
        col.p[1] = 0;
        this.collapsed.push(c);
        ctx.particles.dust(w.xOfCol(c), WORLD.tierY[1]);
      }
    }
    // A player standing on the piece that just went finds themselves falling,
    // which is the point — but they must not be left inside geometry.
    const p = ctx.player;
    if (p.tier === 1 && !w.hasPlatform(w.colOfX(p.x), 1)) p.grounded = false;
  }

  _updateWaves(dt, ctx) {
    const a = BOSS_ATTACKS.stomp;
    const p = ctx.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.x += wv.dir * a.waveSpeed * dt;
      wv.life -= dt;
      // Only catches a player on the ground: being airborne is the answer.
      if (!wv.hit && p.tier === 0 && p.grounded && Math.abs(p.x - wv.x) < 12) {
        wv.hit = true;
        ctx.onPlayerHit && ctx.onPlayerHit(a.damage * this._dmgMul());
      }
      if (wv.life <= 0 || wv.x < this.arena.startX - 20 || wv.x > this.arena.endX + 20) {
        this.waves.splice(i, 1);
      }
    }
  }

  _updateShots(dt, ctx) {
    const a = BOSS_ATTACKS.flak;
    const p = ctx.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.vy += WORLD.gravity * 0.55 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (Math.abs(s.x - p.x) < 9 && Math.abs(s.y - p.midY) < 11) {
        ctx.onPlayerHit && ctx.onPlayerHit(a.damage * this._dmgMul());
        this.shots.splice(i, 1);
        continue;
      }
      if (s.life <= 0 || s.y > WORLD.tierY[0] + 8) {
        ctx.particles.dust(s.x, s.y);
        this.shots.splice(i, 1);
      }
    }
  }

  _dmgMul() { return 1 + this.pass * 0.2; }

  _overlaps(p) {
    return Math.abs(p.x - this.x) < (this.def.w / 2 + 6)
        && Math.abs(p.midY - this.y) < (this.def.h / 2 + 8);
  }

  _debris(ctx) {
    ctx.particles.spawn(3, (q) => {
      q.x = this.x + (Math.random() - 0.5) * this.def.w;
      q.y = this.y + (Math.random() - 0.5) * this.def.h;
      q.vx = (Math.random() - 0.5) * 90;
      q.vy = -40 - Math.random() * 90;
      q.life = q.max = 0.5;
      q.colour = Math.random() < 0.5 ? 'A' : 'R';
      q.size = 1 + (Math.random() < 0.3 ? 1 : 0);
    });
  }
}

/* Which boss a gate uses, and how many times the roster has looped. */
export function bossForGate(gate) {
  const i = gate % BOSSES.length;
  return { def: BOSSES[i], pass: Math.floor(gate / BOSSES.length) };
}

/* Arena width in columns: as wide as the viewport, so a fixed camera can hold
   the whole fight without scrolling. */
export function arenaCols() {
  const cols = Math.round(WORLD.viewW / WORLD.metre) - SECTORS.arenaPadCols;
  return clamp(cols, SECTORS.arenaMinCols, SECTORS.arenaMaxCols);
}
