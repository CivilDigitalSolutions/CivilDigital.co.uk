/* ==========================================================================
   FiDo-5 — Boot and the single frame loop.
   Wires the save, audio, input, game and interface together, keeps the play
   surface correctly letterboxed, and registers the offline worker.
   ========================================================================== */

import { load as loadSave, save as persist, flush } from './save.js';
import { buildSprites } from './sprites.js';
import { Audio } from './audio.js';
import { Voice } from './voice.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { setViewport } from './render.js';
import { UI } from './ui.js';
import { commitRun, syncMissions, resolveStats } from './progression.js';
import { spawnCrate, spawnPowerUp } from './loot.js';
import { spawnEnemy } from './combat.js';
import { ENEMIES, WORLD, POWERUPS } from './data.js';

const stage = document.getElementById('stage');
const rotateHint = document.getElementById('rotate');
let booted = false;   // true once the game and interface are constructed

/* ---- Layout -------------------------------------------------------------
   The canvas fills the browser width at every window size. Rather than
   letterboxing a fixed 16:9 frame, the internal render width is derived from
   the window's aspect ratio while the height stays at 180, so the three
   levels, the jump arc and every sprite keep exactly the same proportions —
   a wider window simply shows more of the track ahead. */
function layout() {
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);

  let iw = Math.round(WORLD.viewH * (vw / vh));
  iw = Math.max(WORLD.minViewW, Math.min(WORLD.maxViewW, iw));
  if (iw % 2) iw += 1;                       // even, so halves land on pixels

  // Scale from the width, unless the clamp would then overflow vertically
  // (only reachable at extreme aspect ratios).
  let scale = vw / iw;
  if (WORLD.viewH * scale > vh) scale = vh / WORLD.viewH;

  const w = Math.round(iw * scale);
  const h = Math.round(WORLD.viewH * scale);
  const left = Math.round((vw - w) / 2);
  const top = Math.round((vh - h) / 2);

  if (iw !== WORLD.viewW) {
    WORLD.viewW = iw;
    setViewport(iw, WORLD.viewH);
    // layout() also runs once before the game and interface exist, to size the
    // canvas at construction. `booted` gates the parts that need them; a
    // typeof check would not, because a const in its temporal dead zone throws
    // rather than reporting undefined.
    if (booted) {
      game.renderer.resize();
      if (ui.menuRenderer) ui.menuRenderer.resize();
    }
  }

  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  stage.style.left = left + 'px';
  stage.style.top = top + 'px';

  // The HUD tracks the play surface rather than the window, so it stays put
  // even when an extreme window shape leaves a margin.
  const root = document.getElementById('app').style;
  root.setProperty('--stage-l', left + 'px');
  root.setProperty('--stage-t', top + 'px');
  root.setProperty('--stage-w', w + 'px');
  root.setProperty('--stage-h', h + 'px');

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
const voice = new Voice(sv.settings, audio);

const input = new Input(stage, {
  sensitivity: sv.settings.sensitivity ?? 1,
  onPause: () => {
    if (game.state === 'running') doPause();
    // The intermission is a paused run too, and so is any panel opened from
    // it. Resuming out of either has to go through Continue, or the interface
    // is left thinking a run is still on hold behind it.
    else if (ui.midRun) doSectorContinue();
    else if (game.state === 'paused') doResume();
  },
  onDebug: () => {
    // Opening the tools must not let the run continue unattended behind them.
    if (game.state === 'running') doPause();
    ui.enableDebug();
  },
  onAnyInput: () => { audio.init(); voice.init(); },
});

const game = new Game({
  canvas: stage,
  sv,
  audio,
  input,
  voice,
  onEvent: onGameEvent,
});

const ui = new UI({
  sv,
  audio,
  input,
  voice,
  hooks: {
    startRun: doStart,
    pause: doPause,
    resume: doResume,
    restart: doRestart,
    quit: doQuit,
    applySettings: applySettings,
    setTouchControls: (on) => { game.touchControls = on; },
    continueRun: doSectorContinue,
    statsChanged: doStatsChanged,
    debug: makeDebugHooks(),
  },
});

/* Development diagnostics, behind the same flag as the debug panel: only
   present when the page was opened with ?debug=1 or the panel was unlocked.
   Normal play exposes nothing on window. */
if (ui.debugOn) window.__fido5 = { game, ui, sv };

booted = true;
layout();   // re-apply now that the renderers exist and can be resized

/* Bind the on-screen buttons to the same actions as the keys. */
input.bindStick(document.getElementById('stick'),
  document.getElementById('stick-base'), document.getElementById('stick-knob'));
// Jump is bound 'hold' as well as pressed: game.js takes the press to start
// the jump, and player.js reads the held state to decide how high it goes.
input.bindButton(document.getElementById('btn-jump'), 'jump', 'hold');
input.bindButton(document.getElementById('btn-fire'), 'fire', 'hold');
input.bindButton(document.getElementById('btn-gadget'), 'gadget');

/* ---- Flow -------------------------------------------------------------- */

function applySettings() {
  audio.applySettings();
  if (!sv.settings.voice) voice.stop();
  // Switching auto-run mid-run applies immediately rather than next run.
  if (game.run) {
    game.run.autoRun = !!sv.settings.autoRun;
    game.player.autoRun = game.run.autoRun;
  }
  game.applyQuality();
  input.setSensitivity(sv.settings.sensitivity ?? 1);
  ui.applyButtonMode();
  if (ui.current === 'menu' && sv.settings.music) audio.startMusic('menu');
}

function doStart() {
  audio.init();
  ui.closeSector();
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

/* Leave the sector intermission and pick the run back up. */
function doSectorContinue() {
  ui.closeSector();
  ui.buildHudIcons(sv);
  ui.showHud();
  game.resumeFromSector();
}

/* An upgrade bought, or a loadout changed, while a run is paused behind the
   intermission. The run is rebuilt from the save rather than waiting for the
   next one to start. */
function doStatsChanged() {
  if (!game.run) return;
  game.applyStats();
}

function doQuit() {
  game.stop();
  ui.stack.length = 0;
  ui.show('menu');
  if (sv.settings.music) audio.startMusic('menu');
}

function onGameEvent(ev) {
  if (ev.type === 'sectorClear') {
    ui.openSector(ev.sector);
    return;
  }
  if (ev.type === 'gameOver') {
    ui.closeSector();
    const outcome = commitRun(sv, ev.run);
    ui.showResults(ev.run, outcome);
    if (sv.settings.music) audio.startMusic('menu');
  }
}

/* ---- The loop ---------------------------------------------------------- */

let updatePending = false;    // a newer worker has taken over; reload when idle
let reloadingNow = false;

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
    if (updatePending) applyPendingUpdate();
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
      game.player.shield = 0;
      game.player.invuln = 0;
      game.player.health = 0;       // isLethal() needs health at or below zero
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
  voice.init();
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
    voice.stop();
    flush();
  }
});

/* Offline play after the first load. Scoped to /fido5/ so it cannot affect
   the rest of the site. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {
      /* Offline support is a bonus; the game plays fine without it. */
    });
  });

  /* A new worker takes over one visit after it is fetched, so without this the
     first load of a release still runs the previous one — which looks exactly
     like the update never shipped. Reload when control changes so a release
     lands on the visit it arrives, not the one after.

     Two things decide whether that reload is right, and getting either wrong
     throws away a run the player is in the middle of.

     The first: a page that arrived with no controller fetched every file from
     the network itself, so a worker claiming it afterwards replaces nothing.
     That is every cold visit — no worker yet, or the first load after a
     release — and the claim lands whenever the install finishes fetching the
     asset list. On a fast connection that is while the player is still reading
     the menu and nobody sees it; on a real one it is a couple of seconds into
     their first run, which is exactly the restart being reported. There is
     nothing stale to reload for, so there is no reload.

     The second: even a genuine update — an older worker replaced by a newer
     one — must not interrupt a run. The reload waits for the menu. */
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    updatePending = true;
    applyPendingUpdate();
  });
}

/* Applied the next time the player is not in the middle of anything: the menu
   or the results screen. Called from the frame loop, so it lands as soon as
   they get there rather than waiting for another event. */
function applyPendingUpdate() {
  if (!updatePending || reloadingNow) return;
  if (ui.current !== 'menu' && ui.current !== 'results') return;
  reloadingNow = true;
  flush();                    // the save is written before the page goes
  window.location.reload();
}
