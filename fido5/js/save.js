/* ==========================================================================
   FiDo-5 — Persistence.
   LocalStorage only, no accounts, nothing leaves the browser. The stored
   blob carries a version so later releases can migrate old saves instead of
   discarding them.
   ========================================================================== */

import { WEAPONS, GADGETS, DRONE_CORES, DRONE_SKINS, MISSIONS } from './data.js';

const KEY = 'fido5.save.v1';
export const SAVE_VERSION = 1;

function freshWeapons() {
  const out = {};
  for (const w of WEAPONS) {
    out[w.id] = { unlocked: !!w.unlocked, up: { damage: 0, rate: 0, crit: 0, energy: 0 } };
  }
  return out;
}

function freshMissions() {
  // Three active missions drawn from distinct families, each at its first tier.
  const picks = ['kills', 'distance', 'crates'];
  return picks.map((id) => ({ id, tier: 0, progress: 0, base: 0 }));
}

export function defaults() {
  const gadgets = {};
  for (const g of GADGETS) gadgets[g.id] = true;
  const cores = {};
  for (const c of DRONE_CORES) cores[c.id] = true;
  const skins = {};
  for (const s of DRONE_SKINS) skins[s.id] = true;

  return {
    v: SAVE_VERSION,
    coins: 0,
    parts: 0,
    keys: 0,
    best: { score: 0, distance: 0 },
    loadout: { weapon: 'assault', gadget: 'shield', core: 'attack', skin: 'standard' },
    weapons: freshWeapons(),
    gadgets,
    operative: { maxHealth: 0, startShield: 0, coinMult: 0, energyMax: 0, energyRegen: 0 },
    drone: {
      cores, skins,
      up: {
        droneDamage: 0, droneRate: 0, droneAcquire: 0,
        coinRadius: 0, lootRadius: 0, crateDetect: 0, efficiency: 0,
        shieldStrength: 0, rescueHeal: 0, rescueCooldown: 0,
      },
    },
    missions: freshMissions(),
    stats: {
      runs: 0, kills: 0, elites: 0, distance: 0, coinsEarned: 0,
      crates: 0, vaults: 0, rescues: 0, bestStreak: 0,
    },
    daily: { day: 0, last: null },
    settings: { sound: true, music: true, haptics: true, quality: 'auto', sensitivity: 1, hiContrast: false },
    seen: {},
    pending: [],   // power-ups granted outside a run, applied to the next one
  };
}

/* Deep-merge stored data over the defaults so a save written by an older
   build gains any new fields without losing what it already had. */
function merge(base, stored) {
  if (stored === null || stored === undefined) return base;
  if (Array.isArray(base)) return Array.isArray(stored) ? stored : base;
  if (typeof base !== 'object') return typeof stored === typeof base ? stored : base;
  const out = Array.isArray(base) ? [] : { ...base };
  for (const k in base) {
    out[k] = Object.prototype.hasOwnProperty.call(stored, k) ? merge(base[k], stored[k]) : base[k];
  }
  // Keep unknown keys from the stored blob — a newer build may have written them.
  for (const k in stored) if (!(k in out)) out[k] = stored[k];
  return out;
}

/* Migration chain. Each step takes a save at version N and returns N+1.
   Nothing to migrate yet; the plumbing is here so v2 is a one-line change. */
const MIGRATIONS = {
  // 1: (s) => { ...; s.v = 2; return s; },
};

function migrate(raw) {
  let s = raw;
  let guard = 0;
  while (s.v < SAVE_VERSION && guard++ < 20) {
    const step = MIGRATIONS[s.v];
    if (!step) { s.v = SAVE_VERSION; break; }
    s = step(s);
  }
  return s;
}

let cache = null;
let writeTimer = 0;

export function load() {
  if (cache) return cache;
  let stored = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) {
    stored = null;   // private mode, quota, or corrupt JSON — start clean
  }
  cache = stored ? migrate(merge(defaults(), stored)) : defaults();
  // Repair anything structurally impossible rather than trusting the blob.
  if (!Array.isArray(cache.missions) || cache.missions.length === 0) cache.missions = freshMissions();
  cache.missions = cache.missions.filter((m) => MISSIONS.some((d) => d.id === m.id));
  if (cache.missions.length === 0) cache.missions = freshMissions();
  if (!cache.weapons[cache.loadout.weapon]) cache.loadout.weapon = 'assault';
  return cache;
}

/* Writes are coalesced: gameplay can call save() freely. */
export function save() {
  if (!cache) return;
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 350);
}

export function flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = 0; }
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    /* Storage unavailable or full. The run still plays; progress just is not
       kept. Deliberately silent — there is nothing the player can do here. */
  }
}

export function reset() {
  cache = defaults();
  flush();
  return cache;
}

/* Flush on the way out so the last few coins are never lost. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
}
