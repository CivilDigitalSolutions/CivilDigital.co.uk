/* ==========================================================================
   FiDo-5 — Combat.
   Enemy behaviour, projectiles, blasts, gadgets and damage resolution. The
   game loop calls into here; nothing in this file knows about rendering.

   Enemies are placed in world space and mostly hold position while the player
   runs into them, so an encounter is something you arrive at rather than
   something that chases you down a corridor.
   ========================================================================== */

import { WORLD, ELITE, POWERUPS, DIFFICULTY } from './data.js';
import { pick } from './world.js';

const FLYERS = { drifter: 1, shielder: 1, bomber: 1 };

export function isFlyer(def) { return !!FLYERS[def.behaviour]; }

/* ---- Spawning ----------------------------------------------------------- */

export function spawnEnemy(ctx, spec) {
  const e = ctx.pools.enemies.get();
  if (!e) return null;
  const { def, tier, elite } = spec;
  const diff = ctx.run.diff;

  const hpMul = pick(DIFFICULTY.enemyHealth, diff) * (elite ? ELITE.health : 1);
  const dmgMul = pick(DIFFICULTY.enemyDamage, diff) * (elite ? ELITE.damage : 1);

  e.def = def;
  e.elite = elite;
  e.scale = elite ? ELITE.scale : 1;
  e.tier = tier;
  e.maxHp = e.hp = Math.round(def.health * hpMul);
  e.damage = def.damage * dmgMul;
  e.score = Math.round(def.score * (elite ? ELITE.score : 1));
  e.coins = Math.round(def.coins * (elite ? ELITE.coins : 1));
  e.x = spec.x;
  const h = def.h * e.scale;
  // Flyers hover on the player's firing line rather than above it. The
  // player cannot aim in a runner, so an enemy their shots pass under is an
  // enemy they can never kill.
  e.y = isFlyer(def) ? WORLD.tierY[tier] - 15 : WORLD.tierY[tier] - h / 2;
  e.baseY = e.y;
  e.vy = 0; e.vx = 0;
  e.t = 0;
  e.bobPhase = Math.random() * Math.PI * 2;
  e.cool = 0.4 + Math.random() * (1 / Math.max(0.05, def.fireRate));
  e.state = 'idle';
  e.charge = 0; e.stun = 0; e.flash = 0; e.burn = 0; e.burnT = 0;
  e.dying = 0; e.aim = 0; e.marked = false; e.seen = false;
  e.bombT = 0;
  // How long this enemy will hold pace with the player once they close.
  // Without it an elite is only in weapons range for about a second, which is
  // not an encounter — it is a thing that goes past.
  e.paceT = elite ? 5.5 : (def.behaviour === 'tank' ? 3.5 : 0);
  return e;
}

/* ---- Enemy update ------------------------------------------------------- */

export function updateEnemies(dt, ctx) {
  const { player, pools, particles, audio, run } = ctx;
  const camX = run.camX;

  pools.enemies.sweep((e) => {
    // Off the back of the screen: recycle silently, no reward.
    if (e.x < camX - WORLD.despawnBehind) return false;

    if (e.dying > 0) {
      e.dying -= dt;
      return e.dying > 0;
    }

    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);

    // Burning (from an upgraded weapon) ticks even while stunned.
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.burn -= dt;
      if (e.burn <= 0) {
        e.burn = 0.35;
        damageEnemy(ctx, e, e.def.health * 0.06 + 1.5, false, 'burn');
        if (!e.alive) return false;
      }
    }

    if (e.stun > 0) {
      e.stun -= dt;
      e.y = e.baseY + Math.sin(e.t * 24) * 1.5;
      return true;
    }

    const dx = player.x - e.x;
    const dy = player.midY - e.y;
    const dist = Math.hypot(dx, dy);
    const onScreen = e.x < camX + WORLD.viewW + 30;

    // Elites and tanks hold a standoff while their pacing budget lasts, so
    // closing on one is a fight rather than something you walk past.
    if (e.paceT > 0 && onScreen) {
      const gap = e.x - player.x;
      if (gap < 135 && gap > -50) {
        e.x += 58 * dt;
        e.paceT -= dt;
      }
    }

    if (onScreen && !e.seen) {
      e.seen = true;
      ctx.onEnemySeen && ctx.onEnemySeen(e);
    }

    switch (e.def.behaviour) {
      case 'drifter':
        e.y = e.baseY + Math.sin(e.t * 3.1 + e.bobPhase) * 5;
        if (onScreen) e.x -= e.def.speed * dt;
        maybeFire(ctx, e, dt, dist, 230);
        break;

      case 'shielder':
        e.y = e.baseY + Math.sin(e.t * 2.2 + e.bobPhase) * 3;
        if (onScreen) e.x -= e.def.speed * dt;
        maybeFire(ctx, e, dt, dist, 222);
        break;

      case 'bomber':
        e.y = e.baseY + Math.sin(e.t * 4.2 + e.bobPhase) * 7;
        if (onScreen) e.x -= e.def.speed * dt;
        // Arms a bomb when the player is roughly underneath or ahead.
        e.cool -= dt;
        if (onScreen && e.cool <= 0 && Math.abs(dx) < 128) {
          e.cool = 1 / (e.def.fireRate * (e.elite ? ELITE.fireRate : 1));
          dropBomb(ctx, e);
        }
        break;

      case 'turret': {
        // Static. Charges with a visible beam along its own level, then fires.
        if (!onScreen) break;
        if (e.state === 'idle') {
          e.cool -= dt;
          if (e.cool <= 0 && dx < 0 && Math.abs(dx) < 244) {
            e.state = 'charge';
            e.charge = e.def.chargeTime;
            audio.play('turret.charge');
            ctx.onTurretCharge && ctx.onTurretCharge(e);
          }
        } else if (e.state === 'charge') {
          e.charge -= dt;
          if (e.charge <= 0) {
            e.state = 'idle';
            e.cool = 1 / (e.def.fireRate * (e.elite ? ELITE.fireRate : 1));
            fireEnemyShot(ctx, e, -1, 0, e.def.projSpeed, 3);
          }
        }
        break;
      }

      case 'tank':
        if (onScreen) e.x -= e.def.speed * dt;
        maybeFire(ctx, e, dt, dist, 270);
        break;
    }

    // Elites hum with a marker so they read at a glance, not by colour alone.
    if (e.elite && Math.random() < 0.10 * ctx.particles.quality) {
      particles.spawn(1, (p) => {
        p.x = e.x + (Math.random() - 0.5) * e.def.w;
        p.y = e.y + (Math.random() - 0.5) * e.def.h;
        p.vx = -20; p.vy = -30 - Math.random() * 20;
        p.life = p.max = 0.3;
        p.colour = 'P'; p.size = 1;
      });
    }
    return true;
  });
}

function maybeFire(ctx, e, dt, dist, range) {
  e.cool -= dt;
  if (e.cool > 0) return;
  if (dist > range) return;
  const { player } = ctx;
  e.cool = 1 / (e.def.fireRate * (e.elite ? ELITE.fireRate : 1));
  const dx = player.x - e.x, dy = player.midY - e.y;
  const len = Math.hypot(dx, dy) || 1;
  fireEnemyShot(ctx, e, dx / len, dy / len, e.def.projSpeed, 2);
}

function fireEnemyShot(ctx, e, dirx, diry, speed, size) {
  const b = ctx.pools.bullets.get();
  if (!b) return;
  b.x = e.x; b.y = e.y;
  b.vx = dirx * speed; b.vy = diry * speed;
  b.dmg = e.damage;
  b.from = 'enemy';
  b.pierce = 0;
  b.crit = false;
  b.life = 3.2;
  b.colour = e.elite ? 'P' : 'R';
  b.w = size + 2; b.h = size;
  b.effect = null;
  ctx.audio.play('enemy.fire');
  ctx.particles.muzzle(e.x - 4, e.y, 'R');
}

function dropBomb(ctx, e) {
  const bl = ctx.pools.blasts.get();
  if (!bl) return;
  bl.x = e.x - 7;
  bl.y = WORLD.tierY[e.tier] - 5;
  bl.r = 0;
  bl.maxR = e.def.blastRadius * (e.elite ? 1.3 : 1);
  bl.life = -e.def.blastDelay;      // negative life = arming, telegraphed
  bl.max = 0.42;
  bl.colour = 'O';
  bl.from = 'enemy';
  bl.dmg = e.damage;
  bl.done = false;
  ctx.audio.play('bomb.arm');
  ctx.onBombArmed && ctx.onBombArmed(bl);
}

/* ---- Player and drone fire ---------------------------------------------- */

export function tryPlayerFire(ctx, dt, wantFire) {
  const { player, run } = ctx;
  player.firing = false;
  if (player.dead || player.state === 'rescue') return;
  if (!wantFire) return;
  if (player.fireCool > 0) return;

  const w = run.weapon;
  const rateMul = run.mods.fireRate || 1;
  const dmgMul = run.mods.damage || 1;
  const free = !!run.mods.freeEnergy;
  const cost = free ? 0 : w.cost;

  if (player.energy < cost) {
    // Out of energy: a dry click, and the HUD flashes the bar.
    run.energyWarn = 0.4;
    return;
  }

  player.energy -= cost;
  player.fireCool = 1 / (w.fireRate * rateMul);
  player.firing = true;
  player.recoil = 1;

  const m = player.muzzle();
  const crit = Math.random() < w.crit;
  const b = ctx.pools.bullets.get();
  if (b) {
    b.x = m.x; b.y = m.y;
    const spread = (Math.random() - 0.5) * w.spread * 2;
    b.vx = w.speed * player.facing;
    b.vy = spread * w.speed;
    b.dmg = w.damage * dmgMul * (crit ? 2 : 1);
    b.crit = crit;
    b.from = 'player';
    b.pierce = w.pierce;
    b.life = 1.4;
    b.colour = w.tracer;
    b.w = w.size[0]; b.h = w.size[1];
    b.effect = w.effect;
  }
  ctx.particles.muzzle(m.x, m.y, w.tracer);
  ctx.audio.play('fire.' + w.id);
}

export function fireDroneShot(ctx, drone, target) {
  const b = ctx.pools.bullets.get();
  if (!b) return;
  const dx = target.x - drone.x, dy = target.y - drone.y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 290;
  b.x = drone.x; b.y = drone.y + 4;
  b.vx = (dx / len) * speed;
  b.vy = (dy / len) * speed;
  b.dmg = ctx.run.drone.damage;
  b.crit = false;
  b.from = 'drone';
  b.pierce = 0;
  b.life = 1.2;
  b.colour = 'C';
  b.w = 3; b.h = 3;
  b.effect = null;
  ctx.particles.muzzle(drone.x + 3, drone.y + 4, 'C');
  ctx.audio.play('drone.fire');
}

/* ---- Projectiles -------------------------------------------------------- */

export function updateBullets(dt, ctx) {
  const { pools, player, run, particles } = ctx;
  const camX = run.camX;

  pools.bullets.sweep((b) => {
    b.life -= dt;
    if (b.life <= 0) return false;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < camX - 40 || b.x > camX + WORLD.viewW + 60) return false;
    if (b.y < -20 || b.y > WORLD.viewH + 20) return false;

    if (b.from === 'enemy') {
      if (!player.dead && player.state !== 'rescue' &&
          b.x > player.left - 2 && b.x < player.right + 2 &&
          b.y > player.top && b.y < player.bottom) {
        const took = player.hurt(b.dmg, ctx.audio, particles, 'shot');
        if (took > 0) ctx.onPlayerHit && ctx.onPlayerHit(b.dmg);
        particles.impact(b.x, b.y, 'R');
        return false;
      }
      // Enemy fire is stopped by full-height barriers, which makes taking
      // cover behind one a real option.
      if (hitsBarrier(ctx, b)) { particles.impact(b.x, b.y, 'b'); return false; }
      return true;
    }

    // Player and drone fire.
    let consumed = false;

    // A boss is not in the enemy pool — it has its own state machine — so it
    // is checked first and takes the shot before anything else can.
    const boss = ctx.boss;
    if (boss && boss.active && boss.dying <= 0 && !boss.hold) {
      const hw = boss.def.w / 2, hh = boss.def.h / 2;
      if (b.x > boss.x - hw && b.x < boss.x + hw &&
          b.y + 2 > boss.y - hh && b.y - 2 < boss.y + hh) {
        const dealt = boss.hurt(ctx, b.dmg);
        // The armour has to be legible or the fight reads as a bullet sponge:
        // a dull thud and a grey spark while plated, the usual hit when open.
        particles.impact(b.x, b.y, boss.exposed ? (b.crit ? 'Y' : b.colour) : 'C');
        ctx.audio.play(boss.exposed ? 'hit' : 'hit.shielded');
        if (dealt > 0 && boss.exposed) ctx.floater(b.x, b.y - 6, Math.round(dealt), 'Y', 1);
        return false;
      }
    }
    pools.enemies.each((e) => {
      if (consumed || e.dying > 0) return;
      const hw = (e.def.w * e.scale) / 2, hh = (e.def.h * e.scale) / 2;
      if (b.x < e.x - hw || b.x > e.x + hw) return;
      // A little vertical tolerance: the player has no way to aim, so a shot
      // that visually clips the target should count.
      if (b.y + 2 < e.y - hh || b.y - 2 > e.y + hh) return;

      let dmg = b.dmg;
      let blocked = false;
      // A shield drone's plate faces the way it came from. Shooting it from a
      // different level angles past the plate, which is the "positioning"
      // answer the design asks for.
      if (e.def.shieldFront && b.from !== 'drone') {
        const sameLevel = Math.abs(b.y - e.y) < e.def.h * 0.34;
        if (sameLevel && b.vx > 0) { dmg *= 1 - e.def.shieldFront; blocked = true; }
      }
      damageEnemy(ctx, e, dmg, b.crit, b.from);
      particles.impact(b.x, b.y, blocked ? 'C' : (b.crit ? 'Y' : b.colour));
      ctx.audio.play(blocked ? 'hit.shielded' : 'hit');

      if (b.effect === 'burn' && e.alive) { e.burnT = 3.0; e.burn = 0.35; }
      if (b.effect === 'chain' && e.alive) chainTo(ctx, e, dmg * 0.5);
      if (b.effect === 'explode') {
        makeBlast(ctx, b.x, b.y, 23, dmg * 0.55, 'player', 'A');
      }

      if (b.pierce > 0) { b.pierce--; b.dmg *= 0.75; }
      else consumed = true;
    });
    if (consumed) return false;

    return true;
  });
}

function hitsBarrier(ctx, b) {
  const world = ctx.world;
  const c = world.colOfX(b.x);
  for (let t = 0; t < WORLD.tierCount; t++) {
    if (world.obstacleAt(c, t) !== 1) continue;
    const surface = WORLD.tierY[t];
    if (b.y > surface - 24 && b.y < surface) return true;
  }
  return false;
}

function chainTo(ctx, from, dmg) {
  let best = null, bestD = 90;
  ctx.pools.enemies.each((e) => {
    if (e === from || e.dying > 0) return;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestD) { bestD = d; best = e; }
  });
  if (!best) return;
  damageEnemy(ctx, best, dmg, false, 'chain');
  ctx.run.arcs.push({ x1: from.x, y1: from.y, x2: best.x, y2: best.y, life: 0.12 });
}

/* ---- Blasts ------------------------------------------------------------- */

export function makeBlast(ctx, x, y, radius, dmg, from, colour) {
  const bl = ctx.pools.blasts.get();
  if (!bl) return null;
  bl.x = x; bl.y = y; bl.r = 0; bl.maxR = radius;
  bl.life = 0; bl.max = 0.38;
  bl.colour = colour || 'A';
  bl.from = from;
  bl.dmg = dmg;
  bl.done = false;
  return bl;
}

export function updateBlasts(dt, ctx) {
  const { pools, player, particles, audio, run } = ctx;
  pools.blasts.sweep((bl) => {
    if (bl.life < 0) {
      // Arming: a warning ring pulses before anything happens.
      bl.life += dt;
      if (bl.life >= 0) {
        bl.life = 0;
        audio.play('explosion');
        particles.explode(bl.x, bl.y, bl.maxR / 40, bl.colour);
      }
      return true;
    }
    bl.life += dt;
    bl.r = bl.maxR * Math.min(1, bl.life / (bl.max * 0.55));
    if (!bl.done && bl.life > bl.max * 0.15) {
      bl.done = true;
      if (bl.from === 'enemy') {
        const d = Math.hypot(player.x - bl.x, player.midY - bl.y);
        if (d < bl.maxR && !player.dead) {
          const took = player.hurt(bl.dmg, audio, particles, 'blast');
          if (took > 0) ctx.onPlayerHit && ctx.onPlayerHit(bl.dmg);
        }
      } else {
        pools.enemies.each((e) => {
          if (e.dying > 0) return;
          const d = Math.hypot(e.x - bl.x, e.y - bl.y);
          if (d < bl.maxR) damageEnemy(ctx, e, bl.dmg * (1 - d / bl.maxR * 0.5), false, 'blast');
        });
      }
    }
    return bl.life < bl.max;
  });
}

/* ---- Damage and death --------------------------------------------------- */

export function damageEnemy(ctx, e, amount, crit, source) {
  if (e.dying > 0 || !e.alive) return;
  e.hp -= amount;
  e.flash = 0.09;
  if (amount >= 1) {
    ctx.floater(e.x, e.y - e.def.h * 0.6, Math.round(amount).toString(), crit ? 'Y' : 'E', crit ? 1.3 : 1);
  }
  if (e.hp <= 0) killEnemy(ctx, e, source);
}

export function killEnemy(ctx, e, source) {
  const { particles, audio, run } = ctx;
  e.dying = 0.28;
  e.hp = 0;
  particles.explode(e.x, e.y, e.elite ? 1.6 : 0.9, e.elite ? 'P' : 'A');
  particles.debris(e.x, e.y, 'M');
  audio.play(e.elite ? 'elite.die' : 'enemy.die');
  ctx.onEnemyKilled && ctx.onEnemyKilled(e, source);
}

/* ---- Gadgets ------------------------------------------------------------ */

export function useGadget(ctx, force) {
  const { run, player, audio, particles, pools } = ctx;
  const g = run.gadget;
  const free = run.mods.freeGadget;
  if (!force && !free && run.gadgetCool > 0) { audio.play('gadget.deny'); return false; }
  if (player.dead) return false;

  run.gadgetCool = free ? 0.5 : g.cooldown;

  switch (g.id) {
    case 'shield':
      run.gadgetShield = g.duration;
      player.powerInvuln = true;
      audio.play('gadget.shield');
      particles.shieldRing(player.x, player.midY, 'C');
      break;

    case 'emp': {
      audio.play('gadget.emp');
      particles.spawn(26, (p, i, n) => {
        const a = (i / n) * Math.PI * 2;
        p.x = player.x; p.y = player.midY;
        p.vx = Math.cos(a) * 200; p.vy = Math.sin(a) * 200;
        p.life = p.max = 0.35; p.colour = i % 2 ? 'C' : 'E'; p.size = 2;
      });
      pools.enemies.each((e) => {
        if (e.dying > 0) return;
        const d = Math.hypot(e.x - player.x, e.y - player.midY);
        if (d > g.radius) return;
        e.stun = g.stun;
        damageEnemy(ctx, e, g.damage, false, 'emp');
      });
      run.empFlash = 0.3;
      break;
    }

    case 'missile': {
      audio.play('gadget.missile');
      for (let i = 0; i < g.salvo; i++) {
        const x = player.x + 62 + i * 42 + Math.random() * 16;
        const tier = pickTargetTier(ctx, x);
        run.incoming.push({ x, y: WORLD.tierY[tier] - 8, t: 0.28 + i * 0.11, radius: g.radius, dmg: g.damage });
      }
      break;
    }
  }
  return true;
}

/* Aim the salvo where the enemies actually are. */
function pickTargetTier(ctx, x) {
  let best = ctx.player.tier, bestScore = -1;
  for (let t = 0; t < WORLD.tierCount; t++) {
    let score = 0;
    ctx.pools.enemies.each((e) => {
      if (e.tier === t && Math.abs(e.x - x) < 70) score += e.elite ? 3 : 1;
    });
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

export function updateIncoming(dt, ctx) {
  const list = ctx.run.incoming;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.t -= dt;
    if (m.t <= 0) {
      makeBlast(ctx, m.x, m.y, m.radius, m.dmg, 'player', 'O');
      ctx.audio.play('explosion');
      ctx.particles.explode(m.x, m.y, 1.3, 'O');
      list.splice(i, 1);
    }
  }
}

/* ---- Power-ups ---------------------------------------------------------- */

export function applyPowerUp(ctx, id) {
  const def = POWERUPS.find((p) => p.id === id);
  if (!def) return null;
  ctx.run.actives.set(id, { def, t: def.duration });
  recomputeMods(ctx.run);
  ctx.audio.play('powerup');
  ctx.floater(ctx.player.x, ctx.player.y - 34, def.name, def.colour, 1.2);
  return def;
}

export function updatePowerUps(dt, ctx) {
  const { run, player } = ctx;
  let changed = false;
  for (const [id, a] of run.actives) {
    a.t -= dt;
    if (a.t <= 0) { run.actives.delete(id); changed = true; }
  }
  if (run.gadgetShield > 0) {
    run.gadgetShield -= dt;
    if (run.gadgetShield <= 0) changed = true;
  }
  if (changed) recomputeMods(run);
  player.powerInvuln = !!run.mods.invuln || run.gadgetShield > 0;
}

export function recomputeMods(run) {
  const m = { fireRate: 1, damage: 1, magnet: 0, invuln: false, freeEnergy: false, freeGadget: null };
  for (const [, a] of run.actives) {
    const mod = a.def.mods || {};
    if (mod.fireRate) m.fireRate *= mod.fireRate;
    if (mod.damage) m.damage *= mod.damage;
    if (mod.magnet) m.magnet = Math.max(m.magnet, mod.magnet);
    if (mod.invuln) m.invuln = true;
    if (mod.freeEnergy) m.freeEnergy = true;
    if (mod.freeGadget) m.freeGadget = mod.freeGadget;
  }
  run.mods = m;
}
