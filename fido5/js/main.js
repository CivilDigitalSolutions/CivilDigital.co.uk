/* ==========================================================================
   FiDo-5 — Boot and the single frame loop.
   Wires the save, audio, input, game and interface together, keeps the play
   surface correctly letterboxed, and registers the offline worker.
   ========================================================================== */

import { load as loadSave, save as persist, flush } from './save.js';
import { buildSprites } from './sprites.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { commitRun, syncMissions, resolveStats } from './progression.js';
import { spawnCrate, spawnPowerUp } from './loot.js';
import { spawnEnemy } from './combat.js';
import { ENEMIES, WORLD, POWERUPS } from './data.js';

const stage = document.getElementById('stage');
const rotateHint = document.getElementById('rotate');

/* ---- Layout -------------------------------------------------------------
   The canvas keeps its 480x270 backing store and is scaled to the largest
   size that fits, centred, with the page background as the letterbox. */
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / WORLD.viewW, vh / WORLD.viewH);
  const w = Math.round(WORLD.viewW * scale);
  const h = Math.round(WORLD.viewH * scale);
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  stage.style.left = Math.round((vw - w) / 2) + 'px';
  stage.style.top = Math.round((vh - h) / 2) + 'px';

  // Portrait on a touch device is genuinely hard to play, so ask rather than
  // silently offering a cramped view. Desktop windows are never blocked.
  const touch = navigator.maxTouchPoints > 0 ||
                matchMedia('(hover: none) and (pointer: coarse)').matches;
  rotateHint.hidden = !(touch && vh > vw * 1.06);
}

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));

/* ---- Boot --------------------------------------------------------------- */

const sv = loadSave();
if (!sv.settings.buttons) sv.settings.buttons = 'auto';

buildSprites();
layout();

const audio = new Audio(sv.settings);

const input = new Input(stage, {
  sensitivity: sv.settings.sensitivity ?? 1,
  onPause: () => {
    if (game.state === 'running') doPause();
    else if (game.state === 'paused') doResume();
  },
  onDebug: () => {
    // Opening the tools must not let the run continue unattended behind them.
    if (game.state === 'running') doPause();
    ui.enableDebug();
  },
  onAnyInput: () => audio.init(),
});

const game = new Game({
  canvas: stage,
  sv,
  audio,
  input,
  onEvent: onGameEvent,
});

const ui = new UI({
  sv,
  audio,
  input,
  hooks: {
    startRun: doStart,
    pause: doPause,
    resume: doResume,
    restart: doRestart,
    quit: doQuit,
    applySettings: applySettings,
    debug: makeDebugHooks(),
  },
});

/* Bind the on-screen buttons to the same actions as the keys. */
input.bindButton(document.getElementById('btn-jump'), 'jump');
input.bindButton(document.getElementById('btn-slide'), 'down');
input.bindButton(document.getElementById('btn-fire'), 'fire', 'hold');
input.bindButton(document.getElementById('btn-gadget'), 'gadget');

/* ---- Flow -------------------------------------------------------------- */

function applySettings() {
  audio.applySettings();
  game.applyQuality();
  input.setSensitivity(sv.settings.sensitivity ?? 1);
  ui.applyButtonMode();
  if (ui.current === 'menu' && sv.settings.music) audio.startMusic('menu');
}

function doStart() {
  audio.init();
  ui.buildHudIcons(sv);
  ui.applyButtonMode();
  ui.showHud();
  game.start();
}

function doPause() {
  if (game.state !== 'running') return;
  game.pause();
  ui.show('pause');
}

function doResume() {
  ui.showHud();
  game.resume();
}

function doRestart() {
  doStart();
}

function doQuit() {
  game.stop();
  ui.stack.length = 0;
  ui.show('menu');
  if (sv.settings.music) audio.startMusic('menu');
}

function onGameEvent(ev) {
  if (ev.type === 'gameOver') {
    const outcome = commitRun(sv, ev.run);
    ui.showResults(ev.run, outcome);
    if (sv.settings.music) audio.startMusic('menu');
  }
}

/* ---- The loop ---------------------------------------------------------- */

let last = performance.now();
function frame(ts) {
  requestAnimationFrame(frame);
  let elapsed = (ts - last) / 1000;
  last = ts;
  // The first frame's timestamp can predate the performance.now() reading
  // taken while this module was still evaluating, which makes the first delta
  // negative. A long delta means the tab was in the background.
  if (!(elapsed > 0) || elapsed > 0.5) elapsed = 1 / 60;

  if (game.state === 'running' || game.state === 'over' || game.state === 'paused') {
    game.tick(elapsed);
    if (game.state === 'running' || game.state === 'over') ui.updateHud(game);
  } else {
    ui.tickMenu(elapsed, game.renderer);
  }
}

/* ---- Debug hooks -------------------------------------------------------- */
/* Only ever reachable through the hidden debug panel. */
function makeDebugHooks() {
  const ahead = () => game.player.x + 220;
  return {
    spawnEnemy(elite) {
      if (!game.run) return 'Start a run first.';
      const def = elite ? ENEMIES[Math.floor(Math.random() * ENEMIES.length)] : ENEMIES[0];
      const tier = game.player.tier;
      spawnEnemy(game._ctx, { def, x: ahead(), tier, elite: !!elite });
      return `Spawned ${elite ? 'elite ' : ''}${def.name} on level ${tier + 1}.`;
    },
    spawnCrate(rarity) {
      if (!game.run) return 'Start a run first.';
      spawnCrate(game._ctx, ahead(), game.player.tier, rarity);
      return `Spawned a ${rarity} crate.`;
    },
    givePower() {
      if (!game.run) return 'Start a run first.';
      const p = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      spawnPowerUp(game._ctx, ahead(), game.player.tier, p.id);
      return 'Dropped ' + p.name + ' ahead of you.';
    },
    forceRescue() {
      if (!game.run) return 'Start a run first.';
      game.drone.rescueCool = 0;
      game.player.health = 0.5;
      return 'Rescue armed — the next tick will trigger it.';
    },
    speedMul(v) {
      game.debugSpeedMul = v;
      return 'Speed multiplier: ×' + v;
    },
    diffAdd(v) {
      game.debugDiffBonus = v < 0 ? 0 : Math.min(1, game.debugDiffBonus + v);
      return 'Difficulty bonus: +' + game.debugDiffBonus.toFixed(2);
    },
    dump() {
      if (!game.run) return 'No run in progress.';
      const r = game.run;
      const st = resolveStats(sv);
      return [
        `state         ${game.state}`,
        `time          ${r.time.toFixed(1)}s`,
        `distance      ${Math.round(r.distance)} m`,
        `difficulty    ${r.diff.toFixed(3)}`,
        `speed         ${Math.round(r.speed)} px/s`,
        `score         ${Math.round(r.score)}`,
        `streak        ${r.streak} (x${game.mult().toFixed(2)})`,
        `player        tier ${game.player.tier} ${game.player.state} hp ${Math.round(game.player.health)}/${game.player.maxHealth}`,
        `drone         ${game.drone.state} rescue ${game.drone.rescueCool.toFixed(1)}s`,
        `weapon        ${st.weapon.name} (${st.weapon.effectName})`,
        `pools         enemies ${game.pools.enemies.live} bullets ${game.pools.bullets.live} coins ${game.pools.coins.live}`,
        `              crates ${game.pools.crates.live} particles ${game.particles.pool.live}`,
        `world         ${game.world.cols.size} columns live, ${game.world.chunkCount} chunks generated`,
        `chunks        ${game.world.log.slice(-6).map((l) => l.id).join(', ')}`,
        `quality       ${game.quality}`,
      ].join('\n');
    },
  };
}

/* ---- Start ------------------------------------------------------------- */

// Missions read from lifetime stats, so make sure they are in step before the
// player sees the menu.
syncMissions(sv);
persist();

ui.syncSettings();
ui.applyButtonMode();
game.applyQuality();
ui.show('menu');
requestAnimationFrame(frame);

// Music waits for a gesture, as the autoplay rules require.
const kick = () => {
  audio.init();
  if (sv.settings.music && game.state !== 'running') audio.startMusic('menu');
  window.removeEventListener('pointerdown', kick);
  window.removeEventListener('keydown', kick);
};
window.addEventListener('pointerdown', kick);
window.addEventListener('keydown', kick);

// Pausing when the tab is hidden stops timers, projectiles and countdowns.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'running') doPause();
    audio.suspend();
    flush();
  }
});

/* Offline play after the first load. Scoped to /fido5/ so it cannot affect
   the rest of the site. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {
      /* Offline support is a bonus; the game plays fine without it. */
    });
  });
}
