/* ==========================================================================
   FiDo-5 — Coins, crates, keys and power-ups.
   Loot tables are data (see CRATES in data.js); this file only rolls them and
   turns the result into things in the world. Crate rewards come out as
   physical coins and canisters where that reads better than a number popping
   up, because collecting the burst is half the point.
   ========================================================================== */

import { WORLD, CRATES, POWERUPS } from './data.js';
import { applyPowerUp } from './combat.js';

export function crateDef(rarity) {
  return CRATES.find((c) => c.rarity === rarity) || CRATES[0];
}

/* ---- Spawning ----------------------------------------------------------- */

export function spawnCoin(ctx, x, y, value = 1) {
  const c = ctx.pools.coins.get();
  if (!c) return null;
  c.x = x; c.y = y; c.vx = 0; c.vy = 0;
  c.t = Math.random() * 4;
  c.magnet = false;
  c.value = value;
  return c;
}

export function spawnCrate(ctx, x, tier, rarity) {
  const c = ctx.pools.crates.get();
  if (!c) return null;
  const def = crateDef(rarity);
  c.x = x;
  c.tier = tier;
  c.y = WORLD.tierY[tier] - 7;
  c.rarity = rarity;
  c.state = 'idle';
  c.scan = 0;
  c.scanTime = def.scanTime;
  c.opened = false;
  c.detected = false;
  c.carried = false;
  c.lingering = 0;
  c.bob = Math.random() * Math.PI * 2;
  return c;
}

export function spawnPickup(ctx, x, y, kind, amount, id) {
  const p = ctx.pools.pickups.get();
  if (!p) return null;
  p.x = x; p.y = y; p.vy = -42 - Math.random() * 28;
  p.t = 0;
  p.kind = kind;
  p.amount = amount || 0;
  p.id = id || null;
  return p;
}

export function spawnPowerUp(ctx, x, tier, id) {
  const pool = POWERUPS.filter((p) => ['rapid', 'shield', 'magnet', 'overcharge', 'missile'].includes(p.id));
  const def = id ? POWERUPS.find((p) => p.id === id) : pool[Math.floor(Math.random() * pool.length)];
  return spawnPickup(ctx, x, WORLD.tierY[tier] - 16, 'power', 0, def.id);
}

/* ---- Loot rolls --------------------------------------------------------- */

export function rollTable(table, rng = Math.random) {
  let total = 0;
  for (const row of table) total += row.w;
  let r = rng() * total;
  for (const row of table) { r -= row.w; if (r <= 0) return row; }
  return table[table.length - 1];
}

function amountOf(row, rng = Math.random) {
  if (row.min === undefined) return 0;
  return Math.round(row.min + rng() * (row.max - row.min));
}

/* Opens a crate: applies the reward and throws the visible half of it into
   the world. Returns a short label for the HUD. */
export function openCrate(ctx, crate, drone) {
  const def = crateDef(crate.rarity);
  const { run, player, particles, audio } = ctx;

  if (def.needsKey) {
    if (run.keys <= 0) { crate.state = 'idle'; return null; }
    run.keys--;
    run.keysUsed++;
    run.vaults++;
  }

  crate.opened = true;
  crate.state = 'open';
  run.crates++;
  run.score += (ctx.scoreForCrate(crate.rarity) || 0);
  ctx.bumpStreak();

  audio.play('crate.open');
  particles.explode(crate.x, crate.y - 5, 1.1, def.accent);
  particles.sparkle(crate.x, crate.y - 6, def.colour);

  const row = rollTable(def.table);
  let label = '';

  switch (row.kind) {
    case 'coins': {
      const n = amountOf(row);
      // Thrown out as real coins so the player has to gather them.
      const count = Math.min(26, Math.max(4, Math.round(n / 9)));
      const per = Math.max(1, Math.round(n / count));
      for (let i = 0; i < count; i++) {
        const c = spawnCoin(ctx, crate.x, crate.y - 8, per);
        if (!c) break;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        c.vx = Math.cos(a) * (48 + Math.random() * 74);
        c.vy = Math.sin(a) * (60 + Math.random() * 80);
      }
      label = `${n} coins`;
      break;
    }
    case 'health': {
      const n = amountOf(row);
      player.heal(n);
      label = `+${n} health`;
      break;
    }
    case 'energy': {
      const n = amountOf(row);
      player.addEnergy(n);
      label = `+${n} energy`;
      break;
    }
    case 'shield': {
      const n = amountOf(row);
      player.addShield(n);
      label = `+${n} shield`;
      break;
    }
    case 'parts': {
      const n = amountOf(row);
      run.parts += n;
      label = n === 1 ? '1 upgrade part' : `${n} upgrade parts`;
      break;
    }
    case 'key': {
      run.keys++;
      run.keysGained++;
      audio.play('key');
      label = 'Vault key';
      break;
    }
    case 'power': {
      const id = row.pool[Math.floor(Math.random() * row.pool.length)];
      spawnPickup(ctx, crate.x, crate.y - 10, 'power', 0, id);
      const def2 = POWERUPS.find((p) => p.id === id);
      label = def2 ? def2.name : 'Power-up';
      break;
    }
    case 'droneBoost': {
      if (drone) drone.enhance(row.duration);
      label = 'FiDo-5 enhanced';
      break;
    }
  }

  ctx.floater(crate.x, crate.y - 20, label, def.accent, 1.15);
  // Also state it in the HUD: the in-world label goes with the crate, which is
  // not long enough to actually read what you just found.
  if (ctx.announce) ctx.announce(def.name, label, def.accent);
  return label;
}

/* ---- Updates ------------------------------------------------------------ */

export function updateCoins(dt, ctx) {
  const { pools, player, run, audio, particles } = ctx;
  const camX = run.camX;
  const magnetR = run.mods.magnet || 0;

  pools.coins.sweep((c) => {
    if (c.x < camX - 45) return false;
    c.t += dt * 8;

    // Thrown coins arc before settling.
    if (c.vx !== 0 || c.vy !== 0) {
      c.vy += 352 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const floor = WORLD.tierY[0] - 6;
      if (c.y > floor) { c.y = floor; c.vy *= -0.35; c.vx *= 0.7; if (Math.abs(c.vy) < 20) { c.vy = 0; c.vx = 0; } }
    }

    const dx = player.x - c.x, dy = player.midY - c.y;
    const dist = Math.hypot(dx, dy);

    if (c.magnet || dist < magnetR) {
      const pull = 310;
      const len = dist || 1;
      c.x += (dx / len) * pull * dt;
      c.y += (dy / len) * pull * dt;
    }

    if (dist < 10) {
      ctx.collectCoin(c);
      return false;
    }
    return true;
  });
}

export function updatePickups(dt, ctx) {
  const { pools, player, run } = ctx;
  const camX = run.camX;
  const magnetR = run.mods.magnet || 0;

  pools.pickups.sweep((p) => {
    if (p.x < camX - 45) return false;
    p.t += dt;
    // Settle onto the nearest surface below, then bob.
    p.vy += 420 * dt;
    p.y += p.vy * dt;
    let rest = null;
    for (let t = WORLD.tierCount - 1; t >= 0; t--) {
      const s = WORLD.tierY[t] - 14;
      if (p.y >= s && ctx.world.hasPlatform(ctx.world.colOfX(p.x), t)) { rest = s; break; }
    }
    if (rest !== null && p.y >= rest) { p.y = rest; p.vy = 0; }
    if (p.vy === 0) p.y = (rest !== null ? rest : p.y) + Math.sin(p.t * 3) * 2;

    const dx = player.x - p.x, dy = player.midY - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < magnetR) {
      const len = dist || 1;
      p.x += (dx / len) * 256 * dt;
      p.y += (dy / len) * 256 * dt;
    }
    if (dist < 12) { ctx.collectPickup(p); return false; }
    return true;
  });
}

export function updateCrates(dt, ctx) {
  const { pools, run } = ctx;
  const camX = run.camX;
  pools.crates.sweep((c) => {
    if (!c.carried && c.x < camX - 60) return false;
    c.bob += dt * 2;
    // An opened crate lingers briefly so the player sees what happened.
    if (c.opened) {
      c.lingering = (c.lingering || 0) + dt;
      if (c.lingering > 2.4) return false;
    }
    return true;
  });
}

/* Applies a collected pickup. Kept here so crates and the world agree on what
   each kind means. */
export function applyPickup(ctx, p) {
  const { player, run, audio } = ctx;
  switch (p.kind) {
    case 'health': player.heal(p.amount); ctx.floater(p.x, p.y - 10, `+${p.amount}`, 'G'); audio.play('pickup'); break;
    case 'energy': player.addEnergy(p.amount); ctx.floater(p.x, p.y - 10, `+${p.amount}`, 'C'); audio.play('pickup'); break;
    case 'shield': player.addShield(p.amount); ctx.floater(p.x, p.y - 10, `+${p.amount}`, 'P'); audio.play('pickup'); break;
    case 'parts':  run.parts += p.amount; ctx.floater(p.x, p.y - 10, `+${p.amount} parts`, 'A'); audio.play('pickup'); break;
    case 'key':    run.keys++; run.keysGained++; ctx.floater(p.x, p.y - 10, 'Key', 'A'); audio.play('key'); break;
    case 'power':  applyPowerUp(ctx, p.id); break;
  }
}
