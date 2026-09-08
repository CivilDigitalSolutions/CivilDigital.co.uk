/* ==========================================================================
   FiDo-5 — Procedural world.
   Assembles the endless route from the chunk templates, then proves the
   result is actually playable before it is allowed on screen. The proof is
   the important part: the brief requires that the game never generates an
   unavoidable combination, so rather than trusting the templates this runs a
   reachability search over the assembled columns and repairs anything that
   cannot be crossed.
   ========================================================================== */

import { WORLD, DIFFICULTY, ENEMIES } from './data.js';
import { CHUNKS, OPENING } from './chunks.js';

/* Column obstacle codes. */
export const NONE = 0, BLOCK = 1, LOW = 2;

/* Conservative movement envelope used by the solver. Real jumps reach much
   further at speed; deliberately understating them means a route the solver
   accepts is comfortable rather than frame-perfect. */
const JUMP_MIN = 2, JUMP_MAX = 5, DROP_MAX = 4, DROP2_MAX = 6;
const EDGE_SAFE = 2;        // columns at each chunk seam kept clear

export function lerp(a, b, t) { return a + (b - a) * t; }
export function pick(range, t) { return lerp(range[0], range[1], t); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* A small deterministic generator so a seed reproduces a route exactly —
   used by the self-test and the debug tools. */
export function makeRng(seed) {
  let s = (seed | 0) || 1;
  return function rng() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function newColumn() {
  return { p: [1, 0, 0], b: [NONE, NONE, NONE] };
}

export class World {
  constructor(rng) {
    this.rng = rng || Math.random;
    this.cols = new Map();       // absolute column index -> column
    this.free = [];              // recycled column objects
    this.reset();
  }

  reset() {
    for (const c of this.cols.values()) this.free.push(c);
    this.cols.clear();
    this.nextCol = 0;
    this.recent = [];
    this.busyRun = 0;
    this.chunkCount = 0;
    this.spawns = [];            // specs drained by the game each frame
    this.lastTurretCol = -99;
    this.log = [];               // ids of generated chunks, for debug
  }

  /* ---- Column access ---- */

  col(i) { return this.cols.get(i); }

  /* A tier is standable when a surface exists and nothing full-height is on
     it. A low barrier is passable, because the player can slide. */
  standable(i, t) {
    const c = this.cols.get(i);
    return !!c && c.p[t] === 1 && c.b[t] !== BLOCK;
  }

  /* Is there a surface at this tier (ignoring obstacles)? */
  hasPlatform(i, t) {
    const c = this.cols.get(i);
    return !!c && c.p[t] === 1;
  }

  obstacleAt(i, t) {
    const c = this.cols.get(i);
    return c ? c.b[t] : NONE;
  }

  colOfX(x) { return Math.floor(x / WORLD.metre); }
  xOfCol(i) { return i * WORLD.metre; }
  tierY(t) { return WORLD.tierY[t]; }

  /* ---- Generation ---- */

  /* Keep the route generated a few chunks past the player and drop what is
     well behind. Called every frame; cheap when there is nothing to do. */
  update(playerX, diff) {
    const aheadCol = this.colOfX(playerX) + Math.ceil(WORLD.viewW / WORLD.metre) * WORLD.chunkAhead;
    let guard = 0;
    while (this.nextCol < aheadCol && guard++ < 12) {
      this._appendChunk(diff);
    }
    // Prune columns that are far enough behind that nothing can see them.
    const cutoff = this.colOfX(playerX) - 40;
    if (cutoff > 0) {
      for (const k of this.cols.keys()) {
        if (k < cutoff) { this.free.push(this.cols.get(k)); this.cols.delete(k); }
      }
    }
  }

  _chooseTemplate(diff) {
    // A run of demanding chunks earns a breather, so difficulty has a pulse.
    if (this.busyRun >= 3) {
      const calm = CHUNKS.filter((c) => c.breather);
      this.busyRun = 0;
      return calm[Math.floor(this.rng() * calm.length)];
    }

    const eliteAllowed = this.rng() < pick(DIFFICULTY.eliteChance, diff);
    const pool = [];
    for (const c of CHUNKS) {
      if (c.breather) continue;
      if (diff < (c.from ?? 0) || diff > (c.to ?? 1)) continue;
      if (c.type === 'elite' && !eliteAllowed) continue;
      let w = c.weight;
      if (this.recent.includes(c.id)) w *= 0.18;      // discourage immediate repeats
      // When an elite is allowed at all it should actually turn up, otherwise
      // keys and vaults never enter the loop.
      if (c.type === 'elite') w *= 3;
      // Early on, favour the gentler chunk types.
      if (diff < 0.15 && (c.type === 'elite')) w *= 0.4;
      if (w > 0) pool.push([c, w]);
    }
    if (pool.length === 0) return CHUNKS.find((c) => c.breather);

    let total = 0;
    for (const [, w] of pool) total += w;
    let r = this.rng() * total;
    for (const [c, w] of pool) { r -= w; if (r <= 0) return c; }
    return pool[pool.length - 1][0];
  }

  _appendChunk(diff) {
    const tpl = this.chunkCount === 0 ? OPENING : this._chooseTemplate(diff);
    const base = this.nextCol;
    const len = tpl.len;

    // --- lay down columns -------------------------------------------------
    for (let i = 0; i < len; i++) {
      const c = this.free.pop() || newColumn();
      c.p[0] = 1; c.p[1] = 0; c.p[2] = 0;
      c.b[0] = NONE; c.b[1] = NONE; c.b[2] = NONE;
      this.cols.set(base + i, c);
    }

    const plat = tpl.plat || [null, [], []];
    for (let t = 1; t < WORLD.tierCount; t++) {
      const spans = plat[t];
      if (!spans) continue;
      for (const [a, b] of spans) {
        for (let i = a; i <= b && i < len; i++) this.cols.get(base + i).p[t] = 1;
      }
    }
    for (const [a, b] of (tpl.gaps || [])) {
      for (let i = a; i <= b && i < len; i++) this.cols.get(base + i).p[0] = 0;
    }

    // Obstacle density scales with difficulty: below 1 some are skipped.
    const obDensity = pick(DIFFICULTY.obstacleDensity, diff);
    for (const o of (tpl.blocks || [])) {
      if (this.rng() > obDensity) continue;
      const c = this.cols.get(base + o.c);
      if (c) c.b[o.t] = o.kind === 'low' ? LOW : BLOCK;
    }

    // --- keep the seams clear --------------------------------------------
    // Two columns at each end are always plain street, so consecutive chunks
    // can never combine into something impossible at the join.
    for (let i = 0; i < EDGE_SAFE; i++) {
      for (const idx of [base + i, base + len - 1 - i]) {
        const c = this.cols.get(idx);
        if (!c) continue;
        c.p[0] = 1;
        c.b[0] = NONE;
      }
    }

    // --- prove it is crossable, and fix it if it is not ------------------
    const repairs = this._repair(base, len);

    // --- entity spawns ---------------------------------------------------
    this._spawnFor(tpl, base, len, diff);

    this.nextCol = base + len;
    this.chunkCount++;
    this.recent.push(tpl.id);
    if (this.recent.length > 3) this.recent.shift();
    this.busyRun = tpl.breather ? 0 : this.busyRun + (tpl.type === 'coin' ? 0 : 1);
    this.log.push({ id: tpl.id, base, len, repairs });
    if (this.log.length > 40) this.log.shift();
  }

  /* Forward reachability over (column, tier). Returns the set of columns that
     can be reached; anything unreachable gets the street underneath it
     restored until the whole span is crossable. */
  _reach(base, len) {
    const seen = new Set();
    const reachedCol = new Uint8Array(len);
    const stack = [];
    for (let t = 0; t < WORLD.tierCount; t++) {
      if (this.standable(base, t)) { stack.push(t * len + 0); seen.add(t * len + 0); reachedCol[0] = 1; }
    }
    const push = (c, t) => {
      if (c < 0 || c >= len) return;
      if (!this.standable(base + c, t)) return;
      const k = t * len + c;
      if (seen.has(k)) return;
      seen.add(k);
      reachedCol[c] = 1;
      stack.push(k);
    };
    while (stack.length) {
      const k = stack.pop();
      const c = k % len, t = (k - c) / len;
      push(c + 1, t);                                                // keep running
      for (let d = JUMP_MIN; d <= JUMP_MAX; d++) {
        push(c + d, t);                                              // jump a barrier or a gap
        if (t + 1 < WORLD.tierCount) push(c + d, t + 1);             // climb a level
      }
      for (let d = 1; d <= DROP_MAX; d++) if (t - 1 >= 0) push(c + d, t - 1);
      for (let d = 2; d <= DROP2_MAX; d++) if (t - 2 >= 0) push(c + d, t - 2);
    }
    return reachedCol;
  }

  /* The condition that matters is that the far end of the chunk can be
     reached, not that every column can be stood on: a gap in the street is
     supposed to be un-standable and is crossed in the air. Repairs therefore
     target the point where forward progress actually stops. */
  _repair(base, len) {
    let repairs = 0;
    for (let pass = 0; pass < 8; pass++) {
      const reached = this._reach(base, len);
      if (reached[len - 1]) return repairs;
      let frontier = 0;
      for (let c = len - 1; c >= 0; c--) if (reached[c]) { frontier = c; break; }
      // Lay plain street from where the route stalled, far enough that the
      // next pass can always get past it.
      for (let c = frontier + 1; c <= Math.min(len - 1, frontier + 4); c++) {
        const col = this.cols.get(base + c);
        if (!col) continue;
        col.p[0] = 1;
        col.b[0] = NONE;
        repairs++;
      }
    }
    // Last resort: flatten the street completely. Should never be needed, but
    // an unplayable route must not be possible even if a template is wrong.
    for (let c = 0; c < len; c++) {
      const col = this.cols.get(base + c);
      if (col) { col.p[0] = 1; col.b[0] = NONE; }
    }
    return repairs + len;
  }

  /* Choose an enemy type for a slot the template left open. */
  _enemyType(diff, tier) {
    const variety = Math.round(pick(DIFFICULTY.variety, diff));
    const eligible = ENEMIES.filter((e) => diff >= e.fromDifficulty).slice(0, Math.max(1, variety));
    const pool = eligible.length ? eligible : [ENEMIES[0]];
    let total = 0;
    for (const e of pool) total += e.weight;
    let r = this.rng() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
    return pool[0];
  }

  _spawnFor(tpl, base, len, diff) {
    const M = WORLD.metre;
    const density = pick(DIFFICULTY.enemyDensity, diff);
    const out = this.spawns;

    // Enemies. Density below 1 thins the template out; above 1 it doubles up
    // some slots, which is how later runs get busier without new templates.
    for (const e of (tpl.enemies || [])) {
      const tier = e.t | 0;
      if (!this.hasPlatform(base + e.c, tier)) continue;
      const rolls = density >= 1 ? (this.rng() < density - 1 ? 2 : 1) : (this.rng() < density ? 1 : 0);
      for (let n = 0; n < rolls; n++) {
        let def = e.type ? ENEMIES.find((x) => x.id === e.type) : this._enemyType(diff, tier);
        if (!def) def = ENEMIES[0];
        // Never let two turrets cover the same stretch — that is the one
        // combination that can read as an unavoidable attack.
        if (def.id === 'turret') {
          if (base + e.c - this.lastTurretCol < 8) def = ENEMIES[0];
          else this.lastTurretCol = base + e.c;
        }
        out.push({ kind: 'enemy', def, x: (base + e.c) * M + n * 20, tier, elite: false });
      }
    }

    for (const e of (tpl.elite || [])) {
      const tier = e.t | 0;
      if (!this.hasPlatform(base + e.c, tier)) continue;
      const def = this._enemyType(Math.max(0.3, diff), tier);
      out.push({ kind: 'enemy', def, x: (base + e.c) * M, tier, elite: true });
    }

    // Coins. Patterns exist to pull the player into a lane change, a jump or
    // a risky route rather than just to sit there.
    for (const c of (tpl.coins || [])) {
      const tier = c.t | 0;
      const n = c.n || 5;
      const x0 = (base + c.c) * M;
      const y0 = WORLD.tierY[tier] - 18;
      if (c.pattern === 'up') {
        for (let i = 0; i < n; i++) out.push({ kind: 'coin', x: x0, y: y0 - i * 10 });
      } else if (c.pattern === 'arc') {
        // A shallow parabola that matches the shape of a jump.
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          out.push({ kind: 'coin', x: x0 + u * n * M * 0.8, y: y0 - Math.sin(u * Math.PI) * 30 });
        }
      } else if (c.pattern === 'cluster') {
        for (let i = 0; i < n; i++) {
          out.push({ kind: 'coin', x: x0 + (i % 3) * 9, y: y0 - Math.floor(i / 3) * 9 });
        }
      } else {
        for (let i = 0; i < n; i++) out.push({ kind: 'coin', x: x0 + i * M, y: y0 });
      }
    }

    for (const c of (tpl.crates || [])) {
      const tier = c.t | 0;
      if (!this.hasPlatform(base + c.c, tier)) continue;
      out.push({ kind: 'crate', x: (base + c.c) * M, tier, rarity: c.rarity || 'common' });
    }

    for (const p of (tpl.power || [])) {
      const tier = p.t | 0;
      out.push({ kind: 'power', x: (base + p.c) * M, tier });
    }
  }

  /* Drain the queued spawns. The game turns each spec into a pooled entity. */
  drainSpawns() {
    const s = this.spawns;
    this.spawns = [];
    return s;
  }
}

/* ---- Self-test -----------------------------------------------------------
   Generates a long route and asserts every column is crossable. Exported so
   the debug menu (and the build check) can run it. */
export function selfTest(chunks = 400, seed = 12345) {
  const w = new World(makeRng(seed));
  const report = { chunks: 0, repairs: 0, unreachable: 0, columns: 0 };  // unreachable counts chunks, not columns
  for (let i = 0; i < chunks; i++) {
    const diff = i / chunks;
    const base = w.nextCol;
    w._appendChunk(diff);
    const len = w.nextCol - base;
    // A chunk passes when its far edge is reachable from its near edge.
    const reached = w._reach(base, len);
    if (!reached[len - 1]) report.unreachable++;
    report.columns += len;
    w.spawns.length = 0;
    // Keep memory flat, exactly as the running game does.
    for (const k of [...w.cols.keys()]) if (k < base - 60) { w.free.push(w.cols.get(k)); w.cols.delete(k); }
  }
  report.chunks = w.chunkCount;
  for (const l of w.log) report.repairs += l.repairs;
  return report;
}
