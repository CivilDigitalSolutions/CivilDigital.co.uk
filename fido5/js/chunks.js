/* ==========================================================================
   FiDo-5 — Chunk templates.
   Pure data. A chunk is 30-50 columns long and one column is one metre.
   Tier 0 is the street and exists for the whole span unless `gaps` says
   otherwise; tiers 1 and 2 exist only where `plat` lists a span.

   Coordinates are column indices local to the chunk.
     blocks kind: 'block' = must be jumped, 'low' = must be slid under
     coins  pattern: 'line' | 'arc' | 'up' | 'cluster'
   `from`/`to` gate a template to a slice of the difficulty curve (0..1).
   ========================================================================== */

export const CHUNK_TYPES = ['coin', 'ambush', 'obstacle', 'mixed', 'elite'];

export const CHUNKS = [

  /* ---- Coin Corridor ---------------------------------------------------- */

  {
    id: 'coin_street', type: 'coin', len: 34, weight: 30, from: 0, to: 1,
    plat: [null, [[10, 22]], []],
    enemies: [{ c: 20, t: 0 }, { c: 30, t: 0 }],
    coins: [
      { c: 4, t: 0, n: 8, pattern: 'line' },
      { c: 12, t: 1, n: 9, pattern: 'line' },
      { c: 26, t: 0, n: 6, pattern: 'line' },
      { c: 9, t: 0, pattern: 'up', n: 4 },        // guides the climb
    ],
  },
  {
    id: 'coin_climb', type: 'coin', len: 40, weight: 24, from: 0.08, to: 1,
    plat: [null, [[6, 18], [24, 36]], [[10, 15], [28, 34]]],
    coins: [
      { c: 5, t: 0, pattern: 'up', n: 4 },
      { c: 8, t: 1, n: 4, pattern: 'line' },
      { c: 11, t: 2, n: 5, pattern: 'line' },
      { c: 20, t: 0, n: 5, pattern: 'line' },
      { c: 26, t: 1, n: 5, pattern: 'line' },
      { c: 29, t: 2, n: 5, pattern: 'line' },
    ],
    enemies: [{ c: 14, t: 1 }, { c: 32, t: 0 }],
    crates: [{ c: 31, t: 2, rarity: 'rare' }],   // the reward for going high
  },
  {
    id: 'coin_arcs', type: 'coin', len: 36, weight: 20, from: 0.05, to: 1,
    plat: [null, [], []],
    gaps: [[10, 12], [22, 24]],
    blocks: [{ c: 17, t: 0, kind: 'low' }],
    enemies: [{ c: 14, t: 0 }, { c: 27, t: 0 }],
    coins: [
      { c: 8, t: 0, pattern: 'arc', n: 7 },
      { c: 20, t: 0, pattern: 'arc', n: 7 },
      { c: 30, t: 0, n: 5, pattern: 'line' },
    ],
  },
  {
    id: 'coin_high_road', type: 'coin', len: 44, weight: 16, from: 0.25, to: 1,
    plat: [null, [[4, 40]], [[12, 20], [26, 36]]],
    blocks: [{ c: 14, t: 1, kind: 'block' }, { c: 28, t: 1, kind: 'low' }],
    enemies: [{ c: 22, t: 0 }],
    coins: [
      { c: 6, t: 1, n: 6, pattern: 'line' },
      { c: 13, t: 2, n: 7, pattern: 'line' },
      { c: 27, t: 2, n: 8, pattern: 'line' },
      { c: 34, t: 1, n: 5, pattern: 'line' },
    ],
    crates: [{ c: 18, t: 2, rarity: 'common' }],
  },

  /* ---- Drone Ambush ----------------------------------------------------- */

  {
    id: 'ambush_low', type: 'ambush', len: 32, weight: 28, from: 0, to: 0.55,
    plat: [null, [[14, 26]], []],
    enemies: [{ c: 12, t: 0 }, { c: 18, t: 0 }, { c: 24, t: 1 }],
    coins: [{ c: 8, t: 0, n: 5, pattern: 'line' }, { c: 28, t: 0, n: 4, pattern: 'line' }],
  },
  {
    id: 'ambush_stack', type: 'ambush', len: 38, weight: 26, from: 0.15, to: 1,
    plat: [null, [[8, 30]], [[16, 28]]],
    enemies: [{ c: 12, t: 0 }, { c: 14, t: 1 }, { c: 20, t: 1 }, { c: 22, t: 2 }, { c: 30, t: 0 }],
    coins: [{ c: 24, t: 2, n: 5, pattern: 'line' }],
  },
  {
    id: 'ambush_gauntlet', type: 'ambush', len: 46, weight: 22, from: 0.35, to: 1,
    plat: [null, [[6, 20], [28, 42]], [[10, 16], [32, 40]]],
    enemies: [
      { c: 10, t: 0 }, { c: 13, t: 1 }, { c: 18, t: 0 }, { c: 24, t: 0 },
      { c: 30, t: 1 }, { c: 34, t: 2 }, { c: 40, t: 0 },
    ],
    coins: [{ c: 20, t: 0, n: 6, pattern: 'line' }, { c: 35, t: 2, n: 5, pattern: 'line' }],
    crates: [{ c: 38, t: 2, rarity: 'rare' }],
  },
  {
    id: 'ambush_turrets', type: 'ambush', len: 40, weight: 18, from: 0.32, to: 1,
    plat: [null, [[10, 34]], [[18, 30]]],
    enemies: [
      { c: 14, t: 0, type: 'turret' }, { c: 26, t: 1, type: 'turret' },
      { c: 20, t: 0 }, { c: 29, t: 2 },
    ],
    coins: [{ c: 20, t: 2, n: 6, pattern: 'line' }],
  },

  /* ---- Obstacle Section ------------------------------------------------- */

  {
    id: 'obst_basic', type: 'obstacle', len: 32, weight: 28, from: 0, to: 1,
    plat: [null, [], []],
    blocks: [{ c: 8, t: 0, kind: 'block' }, { c: 16, t: 0, kind: 'low' }, { c: 24, t: 0, kind: 'block' }],
    enemies: [{ c: 12, t: 0 }, { c: 28, t: 0 }],
    coins: [{ c: 11, t: 0, n: 4, pattern: 'line' }, { c: 19, t: 0, n: 4, pattern: 'line' }],
  },
  {
    id: 'obst_gaps', type: 'obstacle', len: 38, weight: 24, from: 0.1, to: 1,
    plat: [null, [[16, 28]], []],
    gaps: [[8, 10], [20, 22], [31, 33]],
    blocks: [{ c: 14, t: 0, kind: 'low' }],
    enemies: [{ c: 18, t: 1 }, { c: 34, t: 0 }],
    coins: [{ c: 8, t: 0, pattern: 'arc', n: 6 }, { c: 18, t: 1, n: 6, pattern: 'line' }],
  },
  {
    id: 'obst_layers', type: 'obstacle', len: 42, weight: 20, from: 0.24, to: 1,
    plat: [null, [[4, 38]], [[12, 22], [28, 36]]],
    blocks: [
      { c: 9, t: 1, kind: 'block' }, { c: 16, t: 1, kind: 'low' }, { c: 24, t: 1, kind: 'block' },
      { c: 15, t: 2, kind: 'low' }, { c: 32, t: 2, kind: 'block' },
      { c: 12, t: 0, kind: 'block' }, { c: 30, t: 0, kind: 'low' },
    ],
    coins: [{ c: 18, t: 2, n: 4, pattern: 'line' }, { c: 34, t: 1, n: 5, pattern: 'line' }],
  },
  {
    id: 'obst_squeeze', type: 'obstacle', len: 36, weight: 16, from: 0.45, to: 1,
    plat: [null, [[8, 16], [22, 32]], [[10, 14]]],
    gaps: [[17, 20]],
    blocks: [
      { c: 6, t: 0, kind: 'block' }, { c: 12, t: 0, kind: 'low' },
      { c: 26, t: 0, kind: 'block' }, { c: 28, t: 1, kind: 'low' },
    ],
    enemies: [{ c: 24, t: 1 }],
    coins: [{ c: 11, t: 2, n: 4, pattern: 'line' }, { c: 17, t: 0, pattern: 'arc', n: 6 }],
  },

  /* ---- Mixed Encounter -------------------------------------------------- */

  {
    id: 'mixed_market', type: 'mixed', len: 40, weight: 26, from: 0.05, to: 1,
    plat: [null, [[10, 32]], [[18, 28]]],
    blocks: [{ c: 6, t: 0, kind: 'block' }, { c: 22, t: 0, kind: 'low' }, { c: 24, t: 1, kind: 'block' }],
    enemies: [{ c: 14, t: 0 }, { c: 20, t: 1 }, { c: 34, t: 0 }],
    coins: [{ c: 12, t: 1, n: 5, pattern: 'line' }, { c: 20, t: 2, n: 6, pattern: 'line' }],
    crates: [{ c: 26, t: 2, rarity: 'common' }],
  },
  {
    id: 'mixed_underpass', type: 'mixed', len: 44, weight: 22, from: 0.2, to: 1,
    plat: [null, [[6, 22], [30, 42]], [[34, 40]]],
    gaps: [[25, 27]],
    blocks: [{ c: 10, t: 0, kind: 'low' }, { c: 16, t: 1, kind: 'block' }, { c: 36, t: 0, kind: 'block' }],
    enemies: [{ c: 12, t: 1 }, { c: 20, t: 0 }, { c: 32, t: 1 }, { c: 38, t: 2 }],
    coins: [{ c: 24, t: 0, pattern: 'arc', n: 7 }, { c: 35, t: 2, n: 5, pattern: 'line' }],
    power: [{ c: 28, t: 0 }],
  },
  {
    id: 'mixed_rooftops', type: 'mixed', len: 46, weight: 18, from: 0.38, to: 1,
    plat: [null, [[4, 18], [26, 44]], [[8, 16], [30, 42]]],
    gaps: [[21, 23]],
    blocks: [{ c: 12, t: 1, kind: 'low' }, { c: 34, t: 2, kind: 'block' }, { c: 28, t: 0, kind: 'block' }],
    enemies: [{ c: 10, t: 2 }, { c: 15, t: 1 }, { c: 30, t: 1 }, { c: 36, t: 2 }, { c: 40, t: 0 }],
    coins: [{ c: 9, t: 2, n: 6, pattern: 'line' }, { c: 31, t: 2, n: 8, pattern: 'line' }],
    crates: [{ c: 40, t: 2, rarity: 'epic' }],
  },

  /* ---- Elite Encounter -------------------------------------------------- */

  {
    id: 'elite_plaza', type: 'elite', len: 44, weight: 30, from: 0.14, to: 1,
    plat: [null, [[8, 18], [28, 40]], [[30, 38]]],
    elite: [{ c: 22, t: 0 }],
    enemies: [{ c: 12, t: 1 }, { c: 34, t: 1 }],
    coins: [{ c: 10, t: 1, n: 5, pattern: 'line' }, { c: 32, t: 2, n: 5, pattern: 'line' }],
    crates: [{ c: 36, t: 2, rarity: 'rare' }],
  },
  {
    id: 'elite_high', type: 'elite', len: 46, weight: 24, from: 0.34, to: 1,
    plat: [null, [[6, 42]], [[14, 34]]],
    elite: [{ c: 24, t: 1 }],
    enemies: [{ c: 16, t: 2 }, { c: 30, t: 0 }, { c: 36, t: 1 }],
    blocks: [{ c: 20, t: 1, kind: 'low' }, { c: 12, t: 0, kind: 'block' }],
    coins: [{ c: 16, t: 2, n: 8, pattern: 'line' }],
  },
  {
    id: 'elite_double', type: 'elite', len: 50, weight: 16, from: 0.58, to: 1,
    plat: [null, [[6, 22], [30, 46]], [[10, 20], [34, 44]]],
    elite: [{ c: 16, t: 1 }, { c: 38, t: 0 }],
    enemies: [{ c: 12, t: 0 }, { c: 26, t: 0 }, { c: 40, t: 2 }],
    gaps: [[24, 26]],
    coins: [{ c: 23, t: 0, pattern: 'arc', n: 7 }, { c: 36, t: 2, n: 6, pattern: 'line' }],
    crates: [{ c: 44, t: 2, rarity: 'epic' }],
  },

  /* ---- Breather ---------------------------------------------------------
     Deliberately quiet. The generator forces one of these in after a run of
     busy chunks so difficulty has a rhythm rather than a flat wall. */
  {
    id: 'calm_run', type: 'coin', len: 30, weight: 0, from: 0, to: 1, breather: true,
    plat: [null, [[12, 24]], []],
    coins: [{ c: 6, t: 0, n: 8, pattern: 'line' }, { c: 14, t: 1, n: 8, pattern: 'line' }],
  },
  {
    id: 'calm_open', type: 'coin', len: 32, weight: 0, from: 0, to: 1, breather: true,
    plat: [null, [], []],
    coins: [{ c: 5, t: 0, n: 10, pattern: 'line' }, { c: 20, t: 0, n: 8, pattern: 'line' }],
  },
];

/* The opening chunk is fixed so the first few seconds of a new game are
   always calm and legible — onboarding happens here. */
export const OPENING = {
  id: 'opening', type: 'coin', len: 40, from: 0, to: 1,
  plat: [null, [[22, 34]], []],
  coins: [{ c: 8, t: 0, n: 6, pattern: 'line' }, { c: 24, t: 1, n: 7, pattern: 'line' }],
  blocks: [{ c: 16, t: 0, kind: 'block' }],
  enemies: [{ c: 30, t: 0, type: 'scout' }],
};
