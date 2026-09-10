/* ==========================================================================
   FiDo-5 — Progression.
   Turns the saved upgrade levels into the numbers the run actually uses, and
   owns everything that persists: coins, upgrade purchases, missions, daily
   rewards and the XP level. Nothing here draws or simulates.
   ========================================================================== */

import {
  WEAPONS, WEAPON_UPGRADES, WEAPON_TIERS, GADGETS, DRONE_CORES, DRONE_SKINS,
  DRONE_UPGRADES, DRONE_BASE, OPERATIVE_UPGRADES, OPERATIVE_BASE, MISSIONS, DAILY,
} from './data.js';
import { save as persist } from './save.js';

export const byId = (list, id) => list.find((x) => x.id === id) || list[0];

/* Cost of the *next* level: base * growth^level, rounded to something tidy. */
export function upgradeCost(def, level) {
  if (level >= def.max) return null;
  const [base, growth] = def.cost;
  return Math.round((base * Math.pow(growth, level)) / 5) * 5;
}

export function allDroneUpgrades() {
  return [...DRONE_UPGRADES.combat, ...DRONE_UPGRADES.utility, ...DRONE_UPGRADES.defense];
}

/* ---- Effective stats ---------------------------------------------------- */

/* One place that answers "what are this player's numbers right now". Called
   at the start of a run and whenever the loadout screen needs to show a
   preview, so it must stay pure. */
export function resolveStats(sv) {
  const wDef = byId(WEAPONS, sv.loadout.weapon);
  const wUp = (sv.weapons[wDef.id] || { up: {} }).up || {};
  const opUp = sv.operative;
  const core = byId(DRONE_CORES, sv.loadout.core);
  const dUp = sv.drone.up;
  const mods = core.mods || {};

  const up = (list, id) => (byId(list, id) ? byId(list, id).per : 0);

  // Weapon -----------------------------------------------------------------
  const dmgPer  = up(WEAPON_UPGRADES, 'damage');
  const ratePer = up(WEAPON_UPGRADES, 'rate');
  const critPer = up(WEAPON_UPGRADES, 'crit');
  const enPer   = up(WEAPON_UPGRADES, 'energy');

  const weaponLevels = (wUp.damage || 0) + (wUp.rate || 0) + (wUp.crit || 0) + (wUp.energy || 0);
  let tier = WEAPON_TIERS[0];
  for (const t of WEAPON_TIERS) if (weaponLevels >= t.at) tier = t;

  const weapon = {
    id: wDef.id,
    name: wDef.name,
    short: wDef.short,
    damage: wDef.damage * (1 + dmgPer * (wUp.damage || 0)),
    fireRate: wDef.fireRate * (1 + ratePer * (wUp.rate || 0)),
    cost: wDef.cost * Math.max(0.35, 1 - enPer * (wUp.energy || 0)),
    crit: wDef.crit + critPer * (wUp.crit || 0),
    speed: wDef.speed,
    spread: wDef.spread,
    tracer: wDef.tracer,
    size: wDef.size,
    pierce: (wDef.pierce || 0) + (tier.id === 'pierce' || weaponLevels >= 5 ? 1 : 0),
    effect: tier.id,
    effectName: tier.name,
    levels: weaponLevels,
  };

  // Operative --------------------------------------------------------------
  const operative = {
    maxHealth: OPERATIVE_BASE.maxHealth + up(OPERATIVE_UPGRADES, 'maxHealth') * (opUp.maxHealth || 0),
    startShield: OPERATIVE_BASE.startShield + up(OPERATIVE_UPGRADES, 'startShield') * (opUp.startShield || 0),
    energyMax: OPERATIVE_BASE.energyMax + up(OPERATIVE_UPGRADES, 'energyMax') * (opUp.energyMax || 0),
    energyRegen: OPERATIVE_BASE.energyRegen * (1 + up(OPERATIVE_UPGRADES, 'energyRegen') * (opUp.energyRegen || 0)),
    coinMult: (OPERATIVE_BASE.coinMult + up(OPERATIVE_UPGRADES, 'coinMult') * (opUp.coinMult || 0)) * (mods.coinBonus || 1),
    invulnAfterHit: OPERATIVE_BASE.invulnAfterHit,
  };

  // Drone ------------------------------------------------------------------
  const d = allDroneUpgrades();
  const dper = (id) => (byId(d, id) ? byId(d, id).per : 0);
  const drone = {
    core: core.id,
    coreName: core.name,
    skin: sv.loadout.skin,
    damage: DRONE_BASE.damage * (1 + dper('droneDamage') * (dUp.droneDamage || 0)) * (mods.droneDamage || 1),
    fireRate: DRONE_BASE.fireRate * (1 + dper('droneRate') * (dUp.droneRate || 0)) * (mods.droneRate || 1),
    range: DRONE_BASE.range,
    acquireTime: DRONE_BASE.acquireTime / ((1 + dper('droneAcquire') * (dUp.droneAcquire || 0)) * (mods.droneAcquire || 1)),
    coinRadius: DRONE_BASE.coinRadius * (1 + dper('coinRadius') * (dUp.coinRadius || 0)) * (mods.collectRadius || 1),
    lootRadius: DRONE_BASE.lootRadius * (1 + dper('lootRadius') * (dUp.lootRadius || 0)) * (mods.collectRadius || 1),
    crateDetect: DRONE_BASE.crateDetect * (1 + dper('crateDetect') * (dUp.crateDetect || 0)) * (mods.crateDetect || 1),
    efficiency: 1 + dper('efficiency') * (dUp.efficiency || 0),
    shieldStrength: DRONE_BASE.shieldStrength * (1 + dper('shieldStrength') * (dUp.shieldStrength || 0)) * (mods.shieldStrength || 1),
    rescueHeal: DRONE_BASE.rescueHeal * (1 + dper('rescueHeal') * (dUp.rescueHeal || 0)),
    rescueCooldown: DRONE_BASE.rescueCooldown * Math.max(0.4, 1 - dper('rescueCooldown') * (dUp.rescueCooldown || 0)) * (mods.rescueCooldown || 1),
    shieldTime: DRONE_BASE.shieldTime,
  };

  const gadget = byId(GADGETS, sv.loadout.gadget);
  const skin = byId(DRONE_SKINS, sv.loadout.skin);

  return { weapon, operative, drone, gadget, skin, core };
}

/* ---- Purchases ---------------------------------------------------------- */

/* Returns true when the purchase happened. Upgrades cost coins; a handful of
   the deepest levels also want parts, which come from crates. */
export function buyUpgrade(sv, group, id) {
  const defs = {
    weapon: WEAPON_UPGRADES,
    operative: OPERATIVE_UPGRADES,
    drone: allDroneUpgrades(),
  }[group];
  if (!defs) return false;
  const def = byId(defs, id);
  if (!def) return false;

  const store = group === 'weapon'
    ? (sv.weapons[sv.loadout.weapon].up)
    : group === 'operative' ? sv.operative : sv.drone.up;

  const level = store[id] || 0;
  const cost = upgradeCost(def, level);
  if (cost === null) return false;

  // Levels past halfway also want parts, so crates stay worth chasing.
  const partsNeeded = level >= Math.ceil(def.max / 2) ? 1 : 0;
  if (sv.coins < cost || sv.parts < partsNeeded) return false;

  sv.coins -= cost;
  sv.parts -= partsNeeded;
  store[id] = level + 1;
  persist();
  return true;
}

export function upgradeInfo(sv, group, id) {
  const defs = {
    weapon: WEAPON_UPGRADES,
    operative: OPERATIVE_UPGRADES,
    drone: allDroneUpgrades(),
  }[group];
  const def = byId(defs, id);
  const store = group === 'weapon'
    ? (sv.weapons[sv.loadout.weapon].up)
    : group === 'operative' ? sv.operative : sv.drone.up;
  const level = store[id] || 0;
  const cost = upgradeCost(def, level);
  const parts = level >= Math.ceil(def.max / 2) ? 1 : 0;
  return {
    def, level, max: def.max, cost, parts,
    maxed: cost === null,
    affordable: cost !== null && sv.coins >= cost && sv.parts >= parts,
  };
}

/* ---- Missions ----------------------------------------------------------- */

export function missionTarget(m) {
  const def = byId(MISSIONS, m.id);
  const tier = Math.min(m.tier, def.targets.length - 1);
  return def.targets[tier];
}

export function missionLabel(m) {
  const def = byId(MISSIONS, m.id);
  return def.name.replace('{t}', missionTarget(m).toLocaleString('en-GB'));
}

/* Missions read from lifetime stats, so progress is never lost mid-run.
   `base` records where the mission started counting. */
export function syncMissions(sv) {
  const completed = [];
  for (const m of sv.missions) {
    const def = byId(MISSIONS, m.id);
    const stat = sv.stats[def.stat] || 0;
    if (m.base === undefined || m.base === null) m.base = stat;
    m.progress = Math.max(0, stat - m.base);
    if (m.progress >= missionTarget(m)) {
      completed.push({ id: m.id, label: missionLabel(m), reward: def.reward });
      sv.coins += def.reward.coins || 0;
      sv.parts += def.reward.parts || 0;
      addXp(sv, 120);
      // Advance to the next tier of the same family, or roll to a family the
      // player is not already working on.
      if (m.tier < def.targets.length - 1) {
        m.tier++;
      } else {
        const busy = sv.missions.map((x) => x.id);
        const next = MISSIONS.find((d) => !busy.includes(d.id));
        if (next) { m.id = next.id; m.tier = 0; }
      }
      m.base = sv.stats[byId(MISSIONS, m.id).stat] || 0;
      m.progress = 0;
    }
  }
  if (completed.length) persist();
  return completed;
}

/* ---- XP / level --------------------------------------------------------- */

export function addXp(sv, amount) {
  sv.xp = (sv.xp || 0) + Math.max(0, Math.round(amount));
  persist();
}

export function levelInfo(sv) {
  const xp = sv.xp || 0;
  // Each level costs a little more than the one before.
  let level = 1, need = 500, spent = 0;
  while (xp - spent >= need && level < 99) { spent += need; level++; need = Math.round(need * 1.18); }
  return { level, into: xp - spent, need, xp };
}

/* ---- Daily rewards ------------------------------------------------------ */

function dayStamp(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyState(sv) {
  const today = dayStamp();
  const claimedToday = sv.daily.last === today;
  // Missing a day resets the streak, but never the rewards already taken.
  let day = sv.daily.day || 0;
  if (!claimedToday && sv.daily.last) {
    const prev = new Date(sv.daily.last + 'T00:00:00');
    const diff = Math.round((new Date(today + 'T00:00:00') - prev) / 86400000);
    if (diff > 1) day = 0;
  }
  return { day, claimedToday, next: DAILY[Math.min(day, DAILY.length - 1)] };
}

export function claimDaily(sv) {
  const st = dailyState(sv);
  if (st.claimedToday) return null;
  const reward = st.next;
  if (reward.kind === 'coins') sv.coins += reward.amount;
  if (reward.kind === 'parts') sv.parts += reward.amount;
  if (reward.kind === 'bundle') { sv.coins += reward.coins; sv.parts += reward.parts; }
  if (reward.kind === 'power') sv.pending.push(reward.id);
  sv.daily.day = (st.day + 1) % DAILY.length;
  sv.daily.last = dayStamp();
  addXp(sv, 60);
  persist();
  return reward;
}

/* ---- End of run --------------------------------------------------------- */

/* Folds a finished run into the save and reports what changed, so the
   results screen can show it without recalculating anything. */
export function commitRun(sv, run) {
  const s = sv.stats;
  s.runs++;
  s.kills += run.kills;
  s.elites += run.elites;
  s.distance += Math.floor(run.distance);
  s.coinsEarned += run.coins;
  s.crates += run.crates;
  s.vaults += run.vaults;
  s.rescues += run.rescues;
  s.bestStreak = Math.max(s.bestStreak, run.bestStreak);

  // Anything the sector intermission already made spendable is not paid twice.
  sv.coins += run.coins - (run.banked || 0);
  sv.parts += run.parts - (run.bankedParts || 0);
  sv.keys = Math.max(0, sv.keys + run.keysGained - run.keysUsed);

  const newBestScore = run.score > sv.best.score;
  const newBestDist = run.distance > sv.best.distance;
  if (newBestScore) sv.best.score = Math.floor(run.score);
  if (newBestDist) sv.best.distance = Math.floor(run.distance);

  const beforeLevel = levelInfo(sv).level;
  addXp(sv, Math.round(run.score / 10 + run.distance / 20));
  const afterLevel = levelInfo(sv).level;

  const missions = syncMissions(sv);
  persist();

  return { newBestScore, newBestDist, missions, levelUp: afterLevel > beforeLevel, level: afterLevel };
}
