/* ==========================================================================
   FiDo-5 — Run orchestration.
   Owns the run state, the fixed-timestep loop and the wiring between the
   world, the player, FiDo-5, combat and loot. Screens and the HUD live in
   ui.js; this file raises events and lets the UI decide what to show.
   ========================================================================== */

import { WORLD, DIFFICULTY, SCORE, ONBOARDING, POWERUPS, ELITE, ENEMIES } from './data.js';
import { World, makeRng, pick, clamp } from './world.js';
import { Pool, Particles, makeBullet, makeCoin, makePickup, makeCrate, makeEnemy, makeFloater, makeBlast } from './entities.js';
import { Player } from './player.js';
import { Fido } from './fido5.js';
import { Renderer } from './render.js';
import { resolveStats } from './progression.js';
import * as Combat from './combat.js';
import * as Loot from './loot.js';
import { save as persist } from './save.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const STREAK_HOLD = 3.6;      // s of no action before a streak decays

export class Game {
  constructor({ canvas, sv, audio, input, onEvent }) {
    this.canvas = canvas;
    this.sv = sv;
    this.audio = audio;
    this.input = input;
    this.onEvent = onEvent || (() => {});

    this.renderer = new Renderer(canvas);
    this.particles = new Particles(440);
    this.world = new World(makeRng((Math.random() * 1e9) | 0));

    this.pools = {
      bullets: new Pool(makeBullet, 190),
      coins: new Pool(makeCoin, 220),
      pickups: new Pool(makePickup, 40),
      crates: new Pool(makeCrate, 18),
      enemies: new Pool(makeEnemy, 34),
      floaters: new Pool(makeFloater, 40),
      blasts: new Pool(makeBlast, 24),
    };

    this.stats = resolveStats(sv);
    this.player = new Player(this.stats);
    this.drone = new Fido(this.stats, sv.loadout.skin);

    this.state = 'idle';      // idle | running | paused | over
    this.acc = 0;
    this.debugSpeedMul = 1;
    this.debugDiffBonus = 0;
    this.frameCount = 0;
    this.fpsSamples = [];
    this.autoQuality = true;

    this._ctx = this._buildCtx();
  }

  /* ---- Setup ------------------------------------------------------------ */

  applyQuality() {
    const q = this.sv.settings.quality;
    const map = { low: 0.3, medium: 0.65, high: 1 };
    this.autoQuality = q === 'auto';
    const v = this.autoQuality ? 1 : (map[q] ?? 1);
    this.quality = v;
    this.particles.set(v);
    this.renderer.setQuality(v);
    this.renderer.setContrast(!!this.sv.settings.hiContrast);
  }

  start() {
    this.stats = resolveStats(this.sv);
    this.player.reset(this.stats);
    this.drone.reset(this.stats, this.sv.loadout.skin);
    this.world.reset();
    for (const k in this.pools) this.pools[k].clear();
    this.particles.clear();
    this.applyQuality();

    const st = this.stats;
    this.run = {
      time: 0,
      distance: 0,
      startX: this.player.x,
      score: 0,
      coins: 0,
      parts: 0,
      keys: this.sv.keys,
      keysGained: 0,
      keysUsed: 0,
      kills: 0,
      elites: 0,
      crates: 0,
      vaults: 0,
      rescues: 0,
      streak: 0,
      streakT: 0,
      bestStreak: 0,
      diff: 0,
      speed: DIFFICULTY.speed[0],
      camX: 0,
      weapon: st.weapon,
      drone: st.drone,
      gadget: st.gadget,
      operative: st.operative,
      mods: { fireRate: 1, damage: 1, magnet: 0, invuln: false, freeEnergy: false, freeGadget: null },
      actives: new Map(),
      gadgetCool: 0,
      gadgetShield: 0,
      empFlash: 0,
      energyWarn: 0,
      incoming: [],
      arcs: [],
      traffic: [],
      trafficT: 0,
      prompt: null,
      promptT: 0,
      promptQueue: [],
      riskTier: 0,
      chunkRiskX: 0,
      deathT: 0,
      seenElite: false,
    };
    this._ctx = this._buildCtx();

    // Anything granted outside a run (a daily reward power-up) starts active.
    for (const id of this.sv.pending.splice(0)) {
      if (POWERUPS.some((p) => p.id === id)) Combat.applyPowerUp(this._ctx, id);
    }
    persist();

    this.state = 'running';
    this.acc = 0;
    this.drone.onRunStart();
    this.audio.startMusic('run');
    this.input.enabled = true;
    this.onEvent({ type: 'runStart' });
  }

  /* The shared context handed to combat / loot / drone code. Bundling the
     callbacks here keeps those modules free of any knowledge of scoring. */
  _buildCtx() {
    const self = this;
    return {
      get world() { return self.world; },
      get player() { return self.player; },
      get drone() { return self.drone; },
      get pools() { return self.pools; },
      get particles() { return self.particles; },
      get audio() { return self.audio; },
      get run() { return self.run; },
      get droneGlow() { return 'C'; },

      floater: (x, y, text, colour, size) => self.floater(x, y, text, colour, size),
      bumpStreak: () => self.bumpStreak(),
      scoreForCrate: (rarity) => SCORE.crate[rarity] || 0,
      openCrate: (crate, drone) => Loot.openCrate(self._ctx, crate, drone),
      droneCollect: (o, drone) => self.droneCollect(o, drone),
      collectCoin: (c) => self.collectCoin(c),
      collectPickup: (p) => self.collectPickup(p),

      onEnemyKilled: (e, source) => self.onEnemyKilled(e, source),
      onEnemySeen: (e) => self.onEnemySeen(e),
      onPlayerHit: (dmg) => self.onPlayerHit(dmg),
      onTurretCharge: () => self.drone.onTurret(),
      onBombArmed: () => self.drone.onBomb(),
      onRescueStart: () => self.onRescueStart(),
      onRescueShield: () => { self.run.rescues++; },
      onRescueEnd: () => {},
    };
  }

  /* ---- Loop ------------------------------------------------------------- */

  /* Driven by the single loop in main.js. */
  tick(elapsed) {
    if (elapsed > 0.25) elapsed = STEP;          // returning from a background tab

    if (this.state === 'running' || this.state === 'over') {
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;     // give up rather than spiral
      this._trackPerformance(elapsed);
      this.render();
    } else if (this.state === 'paused') {
      this.render();                             // keep the frozen frame visible
    }
  }

  /* Drops the quality automatically if the device cannot hold the frame rate.
     Only ever downgrades: a stutter should not cause a visual oscillation. */
  _trackPerformance(elapsed) {
    if (!this.autoQuality) return;
    this.fpsSamples.push(elapsed);
    if (this.fpsSamples.length < 90) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;
    if (avg > 1 / 45 && this.quality > 0.65) this._setQuality(0.65);
    else if (avg > 1 / 32 && this.quality > 0.3) this._setQuality(0.3);
  }

  _setQuality(v) {
    this.quality = v;
    this.particles.set(v);
    this.renderer.setQuality(v);
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.audio.stopMusic();
    this.onEvent({ type: 'paused' });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.input.enabled = true;
    this.input.clear();
    this.acc = 0;
    this.audio.startMusic('run');
    this.onEvent({ type: 'resumed' });
  }

  stop() {
    this.state = 'idle';
    this.input.enabled = false;
    this.audio.stopMusic();
  }

  /* ---- Update ----------------------------------------------------------- */

  update(dt) {
    const r = this.run;
    const p = this.player;

    // The rescue is the one moment worth slowing down for.
    const scale = this.drone.rescuePhase ? 0.42 : 1;
    dt *= scale;

    r.time += dt;
    r.empFlash = Math.max(0, r.empFlash - dt);
    r.energyWarn = Math.max(0, r.energyWarn - dt);
    r.gadgetCool = Math.max(0, r.gadgetCool - dt);
    r.promptT = Math.max(0, r.promptT - dt);
    if (r.promptT <= 0) r.prompt = null;
    for (let i = r.arcs.length - 1; i >= 0; i--) {
      r.arcs[i].life -= dt;
      if (r.arcs[i].life <= 0) r.arcs.splice(i, 1);
    }

    this.input.tick(dt);

    // Difficulty ----------------------------------------------------------
    r.distance = Math.max(0, (p.x - r.startX) / WORLD.metre);
    r.diff = clamp(r.distance / DIFFICULTY.rampMetres + this.debugDiffBonus, 0, 1);
    r.speed = pick(DIFFICULTY.speed, r.diff) * this.debugSpeedMul;

    // Input ---------------------------------------------------------------
    if (this.state === 'running' && !p.dead) {
      if (this.input.take('jump')) p.tryJump(this.audio);
      if (this.input.take('down')) p.tryDown(this.world, this.audio);
      if (this.input.take('gadget')) {
        if (Combat.useGadget(this._ctx, false)) this.onEvent({ type: 'gadget' });
      }
      const wantFire = this.input.held.fire || this.input.has('fire');
      Combat.tryPlayerFire(this._ctx, dt, wantFire);
    }

    // Simulation ----------------------------------------------------------
    p.update(dt, this.world, p.dead ? 0 : r.speed, this.input, this.audio, this.particles);
    r.camX = Math.max(0, p.x - WORLD.playerScreenX - p.nudge);

    this.world.update(p.x, r.diff);
    this._drainSpawns();
    this._director(dt);

    Combat.updateEnemies(dt, this._ctx);
    Combat.updateBullets(dt, this._ctx);
    Combat.updateBlasts(dt, this._ctx);
    Combat.updateIncoming(dt, this._ctx);
    Combat.updatePowerUps(dt, this._ctx);

    Loot.updateCoins(dt, this._ctx);
    Loot.updatePickups(dt, this._ctx);
    Loot.updateCrates(dt, this._ctx);

    this.drone.update(dt, this._ctx);
    this.particles.update(dt, r.camX);
    this._updateFloaters(dt);
    this._updateTraffic(dt);

    // Lethal damage: FiDo-5 gets the chance to intervene. Health stays at or
    // below zero for the length of the dash, so the check has to stand down
    // while a rescue is already under way or the player dies mid-save.
    if (p.isLethal() && !this.drone.rescuePhase) {
      if (this.drone.tryRescue(this._ctx)) {
        if (p.fellIntoPit) this._liftFromPit();
      } else {
        p.die(p.fellIntoPit ? 'pit' : 'damage');
        this._onDeath();
      }
    }

    // Score ---------------------------------------------------------------
    if (!p.dead) {
      r.score += SCORE.perMetre * (r.speed * dt / WORLD.metre) * this.mult();
      // Streak decay.
      if (r.streak > 0) {
        r.streakT -= dt;
        if (r.streakT <= 0) { r.streak = Math.max(0, r.streak - 1); r.streakT = STREAK_HOLD; }
      }
      this._risk();
      this._onboarding();
    }

    if (p.dead) {
      r.deathT += dt;
      if (r.deathT > 1.5 && this.state !== 'over') this._finish();
    }

    this.frameCount++;
  }

  /* Encounter director.
     The chunk templates place the set pieces, but which templates come up is
     random, so a run can hit a stretch of pure coin corridors with nothing to
     shoot. This tops the field up towards a target that rises with difficulty,
     which is what keeps the shooter half of the game present at all times.
     Only flying types are placed this way: a turret dropped in unannounced is
     exactly the kind of thing the fairness rules exist to prevent. */
  _director(dt) {
    const r = this.run;
    r.directorT = (r.directorT || 0) - dt;
    if (r.directorT > 0) return;
    r.directorT = pick([1.9, 0.55], r.diff);

    const target = Math.round(pick([2, 6], r.diff));
    if (this.pools.enemies.live >= Math.min(11, target)) return;

    const variety = Math.round(pick(DIFFICULTY.variety, r.diff));
    const pool = ENEMIES
      .filter((e) => r.diff >= e.fromDifficulty && e.behaviour !== 'turret' && e.behaviour !== 'tank')
      .slice(0, Math.max(1, variety));
    if (!pool.length) return;

    let total = 0;
    for (const e of pool) total += e.weight;
    let roll = Math.random() * total;
    let def = pool[0];
    for (const e of pool) { roll -= e.weight; if (roll <= 0) { def = e; break; } }

    // Place it on a level that exists a little way ahead.
    const x = this.player.x + 300 + Math.random() * 90;
    const col = this.world.colOfX(x);
    const tiers = [];
    for (let t = 0; t < WORLD.tierCount; t++) if (this.world.hasPlatform(col, t)) tiers.push(t);
    if (!tiers.length) return;
    // Favour the player's own level so combat is something they meet head on.
    const tier = Math.random() < 0.55 && tiers.includes(this.player.tier)
      ? this.player.tier
      : tiers[Math.floor(Math.random() * tiers.length)];

    const elite = Math.random() < pick(DIFFICULTY.eliteChance, r.diff) * 0.35;
    Combat.spawnEnemy(this._ctx, { def, x, tier, elite });
  }

  /* FiDo-5 caught the player over a gap: put them back on solid ground. */
  _liftFromPit() {
    const p = this.player;
    const w = this.world;
    let col = w.colOfX(p.x);
    for (let i = 0; i < 40; i++) {
      if (w.hasPlatform(col + i, 0)) { col = col + i; break; }
    }
    p.x = Math.max(p.x, w.xOfCol(col) + WORLD.metre / 2);
    p.tier = 0;
    p.y = WORLD.tierY[0];
    p.vy = 0;
    p.grounded = true;
    p.fellIntoPit = false;
    p.state = 'rescue';
    this.particles.dust(p.x, p.y);
  }

  _drainSpawns() {
    for (const s of this.world.drainSpawns()) {
      switch (s.kind) {
        case 'enemy': Combat.spawnEnemy(this._ctx, s); break;
        case 'coin': Loot.spawnCoin(this._ctx, s.x, s.y); break;
        case 'crate': Loot.spawnCrate(this._ctx, s.x, s.tier, s.rarity); break;
        case 'power': Loot.spawnPowerUp(this._ctx, s.x, s.tier); break;
      }
    }
  }

  /* Rewards the player for having taken the harder route through a chunk. */
  _risk() {
    const r = this.run;
    if (this.player.x - r.chunkRiskX < 340) return;
    r.chunkRiskX = this.player.x;
    if (this.player.maxTierThisChunk >= 2) {
      r.score += SCORE.riskBonus * this.mult();
      this.floater(this.player.x, this.player.y - 30, 'HIGH ROUTE', 'P', 1);
    }
    this.player.maxTierThisChunk = this.player.tier;
  }

  _updateFloaters(dt) {
    this.pools.floaters.sweep((f) => {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy += 30 * dt;
      return f.life > 0;
    });
  }

  /* Background hover traffic. Purely decorative, pooled in a plain array
     because there are never more than a handful. */
  _updateTraffic(dt) {
    const r = this.run;
    r.trafficT -= dt;
    if (r.trafficT <= 0 && r.traffic.length < (this.quality > 0.6 ? 5 : 2)) {
      r.trafficT = 1.4 + Math.random() * 3.4;
      const band = Math.random();
      r.traffic.push({
        x: WORLD.viewW + 24,
        y: 18 + band * 44,
        v: Math.floor(Math.random() * 5),
        sp: 24 + band * 36,
        a: 0.45 + band * 0.4,
      });
    }
    for (let i = r.traffic.length - 1; i >= 0; i--) {
      const c = r.traffic[i];
      c.x -= (c.sp + r.speed * 0.10) * dt;
      if (c.x < -34) r.traffic.splice(i, 1);
    }
  }

  /* Teaching happens in the world, once each, and never during a fight. */
  _onboarding() {
    const r = this.run;
    if (r.prompt) return;
    const seen = this.sv.seen;
    const show = (id) => {
      const def = ONBOARDING.find((o) => o.id === id);
      if (!def || seen[id]) return false;
      seen[id] = true;
      persist();
      r.prompt = def;
      r.promptT = 2.6;
      return true;
    };

    const world = this.world;
    const col = world.colOfX(this.player.x);
    // Look a little way ahead so the prompt lands before the obstacle does.
    for (let c = col + 4; c < col + 10; c++) {
      for (let t = 0; t < WORLD.tierCount; t++) {
        const o = world.obstacleAt(c, t);
        if (o === 1 && show('jump')) return;
        if (o === 2 && show('low')) return;
      }
      if (!seen.tier && world.hasPlatform(c, 1) && this.player.tier === 0 && show('tier')) return;
    }
    if (!seen.shoot && this.pools.enemies.live > 0 && show('shoot')) return;
    if (!seen.crate && this.pools.crates.live > 0 && show('crate')) return;
    if (!seen.gadget && r.gadgetCool <= 0 && r.time > 12 && show('gadget')) return;
  }

  /* ---- Scoring and streaks ---------------------------------------------- */

  mult() {
    return 1 + Math.min(SCORE.streakMax, this.run.streak) * SCORE.streakMult;
  }

  bumpStreak() {
    const r = this.run;
    const before = Math.floor(r.streak / SCORE.streakStep);
    r.streak++;
    r.streakT = STREAK_HOLD;
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    const after = Math.floor(r.streak / SCORE.streakStep);
    if (after > before) {
      this.audio.play('streak');
      this.drone.onStreak();
      this.floater(this.player.x, this.player.y - 34, 'X' + this.mult().toFixed(2), 'Y', 1);
    }
  }

  breakStreak() {
    this.run.streak = 0;
    this.run.streakT = 0;
  }

  floater(x, y, text, colour = 'E', size = 1) {
    const f = this.pools.floaters.get();
    if (!f) return;
    f.x = x; f.y = y;
    f.vy = -26;
    f.life = f.max = size > 1.1 ? 1.1 : 0.75;
    f.text = String(text).toUpperCase();
    f.colour = colour;
    f.size = size;
  }

  /* ---- Events ----------------------------------------------------------- */

  onEnemyKilled(e, source) {
    const r = this.run;
    r.kills++;
    if (e.elite) r.elites++;
    r.score += e.score * this.mult();
    this.bumpStreak();

    // Coins from the kill, thrown out so they have to be collected.
    const n = Math.min(14, Math.max(2, Math.round(e.coins / 2)));
    const per = Math.max(1, Math.round(e.coins / n));
    for (let i = 0; i < n; i++) {
      const c = Loot.spawnCoin(this._ctx, e.x, e.y, per);
      if (!c) break;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      c.vx = Math.cos(a) * (34 + Math.random() * 60);
      c.vy = Math.sin(a) * (48 + Math.random() * 74);
    }

    if (source === 'drone') this.drone.onDroneKill();
    else this.drone.onPlayerKill();

    // Elites are where the keys and the best crates come from.
    if (e.elite) {
      if (Math.random() < ELITE.keyChance) {
        Loot.spawnPickup(this._ctx, e.x, e.y, 'key', 1);
      }
      if (Math.random() < ELITE.crateChance) {
        const roll = Math.random();
        const rarity = roll < ELITE.crateRarity.rare ? 'rare' : 'epic';
        const tier = this.world.hasPlatform(this.world.colOfX(e.x), e.tier) ? e.tier : 0;
        Loot.spawnCrate(this._ctx, e.x, tier, rarity);
      } else if (Math.random() < 0.3 && this.run.keys > 0) {
        Loot.spawnCrate(this._ctx, e.x + 28, e.tier, 'vault');
      }
      Loot.spawnPickup(this._ctx, e.x - 10, e.y, 'parts', 1);
    }
  }

  onEnemySeen(e) {
    if (e.elite && !this.run.seenElite) {
      this.run.seenElite = true;
      this.drone.onEliteSeen();
    } else if (this.pools.enemies.live >= 3) {
      this.drone.onThreat();
    }
  }

  onPlayerHit(dmg) {
    this.breakStreak();
    this.drone.onPlayerHurt(this._ctx, this.player.health / this.player.maxHealth);
    if (this.sv.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(28); } catch (e) { /* unsupported */ }
    }
  }

  onRescueStart() {
    if (this.sv.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate([0, 40, 60, 90]); } catch (e) { /* unsupported */ }
    }
    this.onEvent({ type: 'rescue' });
  }

  collectCoin(c) {
    const r = this.run;
    const gained = Math.max(1, Math.round(c.value * r.operative.coinMult));
    r.coins += gained;
    r.score += SCORE.perCoin * gained * this.mult();
    this.audio.play('coin', { streak: r.streak });
    this.bumpStreak();
  }

  collectPickup(p) {
    Loot.applyPickup(this._ctx, p);
    this.bumpStreak();
  }

  /* The drone brought something in rather than the player running over it. */
  droneCollect(o, drone) {
    if (o.value !== undefined) this.collectCoin(o);
    else this.collectPickup(o);
    this.pools.coins.kill(o);
    this.pools.pickups.kill(o);
    this.particles.sparkle(o.x, o.y, 'C');
  }

  _onDeath() {
    this.audio.play('death');
    this.drone.onDeath();
    this.breakStreak();
    if (this.sv.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate([0, 90, 50, 140]); } catch (e) { /* unsupported */ }
    }
  }

  _finish() {
    this.state = 'over';
    this.input.enabled = false;
    this.audio.stopMusic();
    this.onEvent({ type: 'gameOver', run: this.run });
  }

  render() {
    this.renderer.draw(this);
  }
}
