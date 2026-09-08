/* ==========================================================================
   FiDo-5 — The companion drone.
   Permanent, present in every run, and deliberately not a copy of the
   player's gun: it picks its own targets, prefers the ones the player is not
   already killing, fetches loot, cracks crates open, and once per cooldown it
   throws itself in front of a killing blow.

   Priority order is rescue > crate > loot > combat > follow, so the drone is
   never fetching a coin during the moment that matters.
   ========================================================================== */

import { WORLD, DRONE_LINES } from './data.js';
import { fireDroneShot } from './combat.js';

const SAY_GAP = 4.5;        // s minimum between any two lines
const SAY_KEY_GAP = 22;     // s minimum before the same category repeats

export class Fido {
  constructor(stats, skinId) {
    this.reset(stats, skinId);
  }

  reset(stats, skinId) {
    this.stats = stats;
    this.skin = skinId || 'standard';
    this.x = 40;
    this.y = WORLD.tierY[0] - 42;
    this.vx = 0;
    this.vy = 0;
    this.state = 'follow';
    this.t = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.target = null;
    this.lock = 0;
    this.fireCool = 0;
    this.scanT = 0;
    this.scanning = 0;
    this.crate = null;
    this.fetch = null;
    this.flash = 0;
    this.boost = 0;               // temporary enhancement from loot

    this.rescueCool = 0;          // ready at 0
    this.rescuePhase = null;
    this.rescueT = 0;
    this.rescues = 0;

    this.sayT = 0;
    this.saidAt = Object.create(null);
    this.line = null;
    this.lineT = 0;

    this.eyeHue = 0;
  }

  get ready() { return this.rescueCool <= 0; }

  /* ---- Dialogue ---- */

  say(key, force) {
    const lines = DRONE_LINES[key];
    if (!lines || !lines.length) return;
    const now = this.t;
    if (!force) {
      if (this.sayT > 0) return;
      if (this.saidAt[key] !== undefined && now - this.saidAt[key] < SAY_KEY_GAP) return;
    }
    this.saidAt[key] = now;
    this.sayT = SAY_GAP;
    this.line = lines[Math.floor(Math.random() * lines.length)];
    this.lineT = 2.6;
  }

  /* ---- Rescue ---- */

  /* Called when the player has taken lethal damage. Returns true when the
     drone is taking the hit, in which case the run continues. */
  tryRescue(ctx) {
    if (!this.ready || this.rescuePhase) return false;
    const d = this.stats.drone;
    this.rescuePhase = 'dash';
    this.rescueT = 0.26;
    this.rescueCool = d.rescueCooldown;
    this.rescues++;
    this.state = 'rescue';
    this.target = null;
    this.crate = null;
    this.fetch = null;
    // Nothing else may land on the player while the drone is closing in.
    ctx.player.invuln = Math.max(ctx.player.invuln, 0.5);
    ctx.audio.play('rescue');
    this.say('rescue', true);
    ctx.onRescueStart && ctx.onRescueStart();
    return true;
  }

  _updateRescue(dt, ctx) {
    const { player, particles } = ctx;
    const d = this.stats.drone;
    this.rescueT -= dt;

    if (this.rescuePhase === 'dash') {
      // Snap to the player, fast and readable.
      const tx = player.x, ty = player.midY;
      const k = Math.min(1, dt * 16);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      particles.thruster(this.x + 4, this.y + 3, 'C');
      if (this.rescueT <= 0) {
        this.rescuePhase = 'deploy';
        this.rescueT = 0.55;
        player.applyRescue(d.rescueHeal, d.shieldStrength, d.shieldTime, 0.55);
        particles.shieldRing(player.x, player.midY, 'C');
        particles.spawn(24, (p, i, n) => {
          const a = (i / n) * Math.PI * 2;
          p.x = player.x; p.y = player.midY;
          p.vx = Math.cos(a) * 150; p.vy = Math.sin(a) * 150;
          p.life = p.max = 0.45; p.colour = i % 3 ? 'C' : 'E'; p.size = 2;
        });
        ctx.onRescueShield && ctx.onRescueShield();
      }
    } else if (this.rescuePhase === 'deploy') {
      // Hold in front of the player with the shield up.
      const tx = player.x + 12, ty = player.midY - 2;
      const k = Math.min(1, dt * 9);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      if (this.rescueT <= 0) {
        this.rescuePhase = null;
        this.state = 'follow';
        this.say('rescueDown');
        ctx.onRescueEnd && ctx.onRescueEnd();
      }
    }
  }

  /* ---- Target selection ----------------------------------------------------
     Deliberately not "nearest enemy". The drone goes for what the player is
     least likely to be handling: things that are already hurt, weak things
     that can be finished in one shot, and secondary threats away from the
     player's line of fire. An Attack core overrides that to chase elites. */

  _chooseTarget(ctx) {
    const { pools, player } = ctx;
    const d = this.stats.drone;
    const attackCore = d.core === 'attack';
    let best = null, bestScore = -Infinity;

    pools.enemies.each((e) => {
      if (e.dying > 0) return;
      const dx = e.x - this.x, dy = e.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > d.range) return;
      if (e.x < player.x - 22) return;          // do not bother with what is behind

      let score = 0;
      score += (1 - dist / d.range) * 30;                      // prefer close
      score += (1 - e.hp / e.maxHp) * 45;                      // finish the wounded
      if (e.hp <= d.damage * 1.2) score += 40;                 // one shot will do it
      if (Math.abs(e.y - player.midY) > 17) score += 22;        // off the player's line
      if (e.tier !== player.tier) score += 14;                  // a threat on another level
      if (e.elite) score += attackCore ? 60 : -10;              // attack core hunts elites
      if (e.def.behaviour === 'turret' || e.def.behaviour === 'bomber') score += 26; // priority threats
      if (e.stun > 0) score -= 25;                             // already handled
      if (score > bestScore) { bestScore = score; best = e; }
    });
    return best;
  }

  /* ---- Loot ---- */

  _findCrate(ctx) {
    const d = this.stats.drone;
    let best = null, bestD = d.crateDetect;
    ctx.pools.crates.each((c) => {
      if (c.opened || c.state === 'opening') return;
      if (c.rarity === 'vault' && ctx.run.keys <= 0) return;    // no key, no point
      const dist = Math.hypot(c.x - this.x, c.y - this.y);
      if (dist < bestD) { bestD = dist; best = c; }
    });
    return best;
  }

  _findLoot(ctx) {
    const d = this.stats.drone;
    let best = null, bestD = d.lootRadius * 2.2;
    const consider = (o) => {
      const dist = Math.hypot(o.x - this.x, o.y - this.y);
      if (dist < bestD) { bestD = dist; best = o; }
    };
    ctx.pools.pickups.each(consider);
    // Coins are swept up passively rather than chased one at a time, except
    // when a Utility core makes the radius big enough to be worth a detour.
    if (d.coinRadius > 60) ctx.pools.coins.each(consider);
    return best;
  }

  /* ---- Main update ---- */

  update(dt, ctx) {
    const { player, particles, audio, run } = ctx;
    const d = this.stats.drone;
    this.t += dt;
    this.bob += dt * 3.4;
    this.flash = Math.max(0, this.flash - dt);
    this.sayT = Math.max(0, this.sayT - dt);
    this.lineT = Math.max(0, this.lineT - dt);
    this.rescueCool = Math.max(0, this.rescueCool - dt);
    this.fireCool = Math.max(0, this.fireCool - dt);
    this.boost = Math.max(0, this.boost - dt);
    if (this.lineT <= 0) this.line = null;

    if (this.rescuePhase) { this._updateRescue(dt, ctx); this._trail(ctx); return; }

    if (player.dead) {
      // Hover near the player, subdued.
      this._moveToward(player.x - 14, player.midY - 19, dt, 4);
      this._trail(ctx);
      return;
    }

    // --- pick a job ------------------------------------------------------
    const crate = this._findCrate(ctx);
    if (crate && crate !== this.crate) {
      this.crate = crate;
      if (!crate.detected) {
        crate.detected = true;
        audio.play('crate.detect');
        this.say(crate.rarity === 'vault' ? 'vault' : 'crate');
        ctx.onCrateDetected && ctx.onCrateDetected(crate);
      }
    }
    if (this.crate && (this.crate.opened || !this.crate.alive)) this.crate = null;

    if (this.crate) this.state = 'crate';
    else {
      const loot = this._findLoot(ctx);
      if (loot) { this.fetch = loot; this.state = 'fetch'; }
      else {
        this.fetch = null;
        const t = this._chooseTarget(ctx);
        if (t) {
          if (t !== this.target) { this.target = t; this.lock = d.acquireTime; }
          this.state = 'engage';
        } else { this.target = null; this.state = 'follow'; }
      }
    }

    // --- act -------------------------------------------------------------
    switch (this.state) {
      case 'crate': {
        const c = this.crate;
        const tx = c.x, ty = c.y - 12;
        this._moveToward(tx, ty, dt, 7);
        const near = Math.hypot(this.x - tx, this.y - ty) < 12;
        // The player has to be close too — the crate is the risk, not a freebie.
        const playerNear = Math.abs(player.x - c.x) < 102;
        if (near && playerNear) {
          if (c.state !== 'opening') {
            c.state = 'opening';
            c.scan = c.scanTime / d.efficiency;
            audio.play('crate.scan', { dur: c.scan });
          }
          this.scanning = 0.2;
          c.scan -= dt;
          particles.spawn(1, (p) => {
            p.x = c.x + (Math.random() - 0.5) * 14;
            p.y = c.y + (Math.random() - 0.5) * 12;
            p.vx = 0; p.vy = -20;
            p.life = p.max = 0.25; p.colour = 'C'; p.size = 1;
          });
          if (c.scan <= 0) {
            ctx.openCrate(c, this);
            this.say('crateOpen');
            this.crate = null;
          }
        } else if (c.state === 'opening' && !playerNear) {
          c.state = 'idle';          // player left; the crate waits
        }
        break;
      }

      case 'fetch': {
        const o = this.fetch;
        if (!o || !o.alive) { this.fetch = null; break; }
        this._moveToward(o.x, o.y, dt, 8);
        if (Math.hypot(this.x - o.x, this.y - o.y) < 10) {
          ctx.droneCollect(o, this);
          this.fetch = null;
        }
        break;
      }

      case 'engage': {
        const t = this.target;
        // Take up a firing position off to the side of the player, not on top
        // of the target, so the drone stays readable.
        const ax = player.x + 13 + Math.min(28, (t.x - player.x) * 0.22);
        const ay = Math.min(player.midY - 13, t.y - 14);
        this._moveToward(ax, ay, dt, 6);
        if (this.lock > 0) {
          this.lock -= dt;
          if (this.lock <= 0) {
            audio.play('drone.lock');
            this.say('target');
          }
        } else if (this.fireCool <= 0 && t.alive && t.dying <= 0) {
          const rate = d.fireRate * (this.boost > 0 ? 2 : 1);
          this.fireCool = 1 / rate;
          fireDroneShot(ctx, this, t);
        }
        break;
      }

      default: {
        // Follow: tuck in behind and above, and sweep the environment.
        const ax = player.x - 17;
        const ay = player.midY - 22;
        this._moveToward(ax, ay, dt, 5);
        this.scanT -= dt;
        if (this.scanT <= 0) { this.scanT = 3.2 + Math.random() * 3; this.scanning = 0.7; }
        break;
      }
    }

    this.scanning = Math.max(0, this.scanning - dt);

    // Coin sweep: anything inside the collection radius is drawn in. This is
    // the Utility core's whole reason to exist.
    const cr = d.coinRadius * (this.boost > 0 ? 1.6 : 1);
    ctx.pools.coins.each((c) => {
      const dist = Math.hypot(c.x - this.x, c.y - this.y);
      if (dist < cr) c.magnet = true;
    });

    this._trail(ctx);
  }

  _moveToward(tx, ty, dt, k) {
    // Critically damped-ish follow: quick to respond, never overshoots badly.
    const s = Math.min(1, dt * k);
    this.vx += ((tx - this.x) * 9 - this.vx) * s;
    this.vy += ((ty - this.y) * 9 - this.vy) * s;
    const max = 420;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > max) { this.vx = this.vx / sp * max; this.vy = this.vy / sp * max; }
    this.x += this.vx * dt;
    this.y += this.vy * dt + Math.sin(this.bob) * 4 * dt;
  }

  _trail(ctx) {
    if (Math.random() < 0.30 * ctx.particles.quality) {
      const glow = ctx.droneGlow || 'C';
      ctx.particles.thruster(this.x - 2, this.y + 4, glow);
    }
  }

  /* Reacts when the player is hit — a recoil the player can see. */
  onPlayerHurt(ctx, healthFrac) {
    this.flash = 0.25;
    this.vy -= 90;
    if (healthFrac < 0.28) this.say('low');
    else this.say('hurt');
  }

  onPlayerKill() { this.say('playerKill'); }
  onDroneKill() { this.say('droneKill'); }
  onEliteSeen() { this.say('elite'); }
  onThreat() { this.say('threat'); }
  onBomb() { this.say('bomb', true); }
  onTurret() { this.say('turret', true); }
  onStreak() { this.say('streak'); }
  onRunStart() { this.say('runStart', true); }
  onDeath() { this.say('death', true); }

  /* Temporary enhancement from a rare crate. */
  enhance(seconds) { this.boost = Math.max(this.boost, seconds); }
}
