/* ==========================================================================
   FiDo-5 — Interface.
   Screen manager, HUD, and every panel: loadout, upgrades, the FiDo-5
   inspector, missions, settings, pause, results and the daily reward.
   The game raises events; this file decides what the player sees.
   ========================================================================== */

import {
  WEAPONS, GADGETS, DRONE_CORES, DRONE_SKINS, DRONE_UPGRADES,
  OPERATIVE_UPGRADES, WEAPON_UPGRADES, WEAPON_TIERS, MISSIONS, DAILY, POWERUPS, SCORE,
  SECTORS,
} from './data.js';
import { S } from './sprites.js';
import {
  resolveStats, upgradeInfo, buyUpgrade, missionLabel, missionTarget,
  levelInfo, dailyState, claimDaily, byId, allDroneUpgrades,
} from './progression.js';
import { save as persist, reset as resetSave } from './save.js';
import { selfTest } from './world.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export class UI {
  constructor({ sv, audio, input, hooks }) {
    this.sv = sv;
    this.audio = audio;
    this.input = input;
    this.hooks = hooks;              // { startRun, resume, restart, quit, applySettings }
    this.stack = [];
    this.current = null;
    this.menuT = 0;
    this.menuRenderer = null;
    this.droneYaw = 0.35;
    this.droneT = 0;
    this.debugOn = false;
    // Set while the sector intermission is up. The loadout and upgrade panels
    // are shared with the menu, and a couple of things they do — offering to
    // start a run, leaving the stats they changed on the shelf — are wrong
    // when there is a run paused behind them.
    this.midRun = false;
    this.sector = null;
    this.tapCount = 0;
    this.tapTimer = 0;

    this.screens = {
      loading: $('screen-loading'),
      menu: $('screen-menu'),
      loadout: $('screen-loadout'),
      upgrades: $('screen-upgrades'),
      drone: $('screen-drone'),
      missions: $('screen-missions'),
      settings: $('screen-settings'),
      pause: $('screen-pause'),
      sector: $('screen-sector'),
      results: $('screen-results'),
      daily: $('screen-daily'),
      debug: $('screen-debug'),
    };
    this.hud = $('hud');
    this._wire();
  }

  /* ---- Screen management ------------------------------------------------ */

  /* The menu and the results screen are roots: arriving at either clears the
     back stack. Everything else records where it was opened from, so Back
     always returns to the screen the player actually came from — including
     when a panel is opened from the pause menu mid-run. */
  show(name, opts = {}) {
    const ROOT = name === 'menu' || name === 'results';
    if (ROOT) {
      this.stack.length = 0;
    } else if (opts.from !== null) {
      const from = opts.from !== undefined
        ? opts.from
        : (this.current && this.current !== 'play' ? this.current : 'menu');
      if (from && from !== name) this.stack.push(from);
    }

    for (const k in this.screens) this.screens[k].hidden = k !== name;
    this.current = name;
    this.hud.hidden = true;
    // Focus a control so keyboard and screen-reader users land somewhere. A
    // screen can nominate which one; otherwise it is the first.
    const target = this.screens[name] && (this.screens[name].querySelector('[data-autofocus]')
      || this.screens[name].querySelector('button:not([hidden]), select, input'));
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 30);
    if (name === 'menu') this.refreshMenu();
    // Coming back from Upgrades, the wallet and the resupply lines are stale.
    if (name === 'sector' && this.sector) this.buildSector();
  }

  showHud() {
    for (const k in this.screens) this.screens[k].hidden = true;
    this.current = 'play';
    this.stack.length = 0;
    this.hud.hidden = false;
  }

  back() {
    const prev = this.stack.pop() || 'menu';
    this.audio.play('ui.back');
    this.show(prev, { from: null });
  }

  /* ---- Wiring ---------------------------------------------------------- */

  _wire() {
    // Every panel's back button, plus the "Later" button on the daily dialog.
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => this.back()));
    document.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => this.hooks.startRun()));

    $('btn-play').addEventListener('click', () => { this.audio.play('ui.select'); this.hooks.startRun(); });
    $('btn-loadout').addEventListener('click', () => { this.audio.play('ui.select'); this.openLoadout(); });
    $('btn-upgrades').addEventListener('click', () => { this.audio.play('ui.select'); this.openUpgrades(); });
    $('btn-drone').addEventListener('click', () => { this.audio.play('ui.select'); this.openDrone(); });
    $('btn-missions').addEventListener('click', () => { this.audio.play('ui.select'); this.openMissions(); });
    $('btn-settings').addEventListener('click', () => { this.audio.play('ui.select'); this.openSettings(); });
    $('btn-daily').addEventListener('click', () => { this.audio.play('ui.select'); this.openDaily(); });
    $('dr-to-upgrades').addEventListener('click', () => { this.audio.play('ui.select'); this.openUpgrades(); });

    $('btn-pause').addEventListener('click', () => this.hooks.pause());
    $('btn-resume').addEventListener('click', () => { this.audio.play('ui.select'); this.hooks.resume(); });
    $('btn-restart').addEventListener('click', () => { this.audio.play('ui.select'); this.hooks.restart(); });
    $('btn-quit').addEventListener('click', () => { this.audio.play('ui.back'); this.hooks.quit(); });
    $('btn-pause-settings').addEventListener('click', () => { this.audio.play('ui.select'); this.openSettings(); });

    $('btn-sec-go').addEventListener('click', () => { this.audio.play('ui.select'); this.hooks.continueRun(); });
    $('btn-sec-upgrades').addEventListener('click', () => { this.audio.play('ui.select'); this.openUpgrades('sector'); });
    $('btn-sec-loadout').addEventListener('click', () => { this.audio.play('ui.select'); this.openLoadout('sector'); });

    $('btn-again').addEventListener('click', () => { this.audio.play('ui.select'); this.hooks.startRun(); });
    $('btn-res-loadout').addEventListener('click', () => { this.audio.play('ui.select'); this.openLoadout('menu'); });
    $('btn-claim').addEventListener('click', () => this.doClaim());

    // Settings
    this._toggle('set-sound', 'sound');
    this._toggle('set-music', 'music');
    this._toggle('set-autorun', 'autoRun');
    this._toggle('set-voice', 'voice');
    this._toggle('set-haptics', 'haptics');
    this._toggle('set-contrast', 'hiContrast');
    $('set-quality').addEventListener('change', (e) => {
      this.sv.settings.quality = e.target.value;
      persist(); this.hooks.applySettings();
    });
    $('set-buttons').addEventListener('change', (e) => {
      this.sv.settings.buttons = e.target.value;
      persist(); this.applyButtonMode();
    });
    $('set-sens').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.sv.settings.sensitivity = v;
      $('set-sens-val').textContent = v.toFixed(1);
      this.input.setSensitivity(v);
      persist();
    });
    $('set-reset').addEventListener('click', () => this.doReset());

    // The debug panel is reached by a deliberate gesture, never by accident:
    // ?debug=1 in the URL, or five taps on the logo.
    const logo = document.querySelector('#screen-menu .logo');
    if (logo) {
      logo.addEventListener('click', () => {
        const now = performance.now();
        if (now - this.tapTimer > 900) this.tapCount = 0;
        this.tapTimer = now;
        if (++this.tapCount >= 5) { this.tapCount = 0; this.enableDebug(); }
      });
    }
    // ?debug=1 arms the panel without opening it, so the player still lands
    // on the menu; the backtick key or five logo taps then opens it.
    if (new URLSearchParams(location.search).get('debug') === '1') {
      this.debugOn = true;
      this.buildDebug();
    }

    // The drone inspector turntable.
    const view = $('drone-view');
    let dragging = false, lastX = 0;
    const down = (e) => { dragging = true; lastX = e.clientX; view.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      this.droneYaw += (e.clientX - lastX) * 0.014;
      lastX = e.clientX;
    };
    const up = () => { dragging = false; };
    view.addEventListener('pointerdown', down);
    view.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  _toggle(id, key) {
    const el = $(id);
    el.addEventListener('click', () => {
      const on = !this.sv.settings[key];
      this.sv.settings[key] = on;
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      persist();
      this.audio.play(on ? 'ui.select' : 'ui.back');
      this.hooks.applySettings();
    });
  }

  syncSettings() {
    const s = this.sv.settings;
    $('set-sound').setAttribute('aria-checked', s.sound ? 'true' : 'false');
    $('set-music').setAttribute('aria-checked', s.music ? 'true' : 'false');
    $('set-autorun').setAttribute('aria-checked', s.autoRun ? 'true' : 'false');
    $('set-voice').setAttribute('aria-checked', s.voice ? 'true' : 'false');
    $('set-haptics').setAttribute('aria-checked', s.haptics ? 'true' : 'false');
    $('set-contrast').setAttribute('aria-checked', s.hiContrast ? 'true' : 'false');
    $('set-quality').value = s.quality || 'auto';
    $('set-buttons').value = s.buttons || 'auto';
    $('set-sens').value = s.sensitivity ?? 1;
    $('set-sens-val').textContent = (s.sensitivity ?? 1).toFixed(1);
  }

  /* Touch buttons show by default on a touch device and can be forced either
     way. Swipes always work regardless. */
  applyButtonMode() {
    const mode = this.sv.settings.buttons || 'auto';
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches ||
                  navigator.maxTouchPoints > 0;
    const show = mode === 'on' || (mode === 'auto' && touch);
    $('pad').classList.toggle('is-hidden', !show);
    if (this.hooks.setTouchControls) this.hooks.setTouchControls(show);
  }

  /* ---- Menu ------------------------------------------------------------- */

  refreshMenu() {
    $('menu-coins').textContent = fmt(this.sv.coins);
    $('menu-parts').textContent = fmt(this.sv.parts);
    $('menu-keys').textContent = fmt(this.sv.keys);
    $('menu-level').textContent = 'Lv ' + levelInfo(this.sv).level;
    $('menu-best').textContent = fmt(this.sv.best.score);
    $('menu-bestd').textContent = fmt(this.sv.best.distance) + ' m';
    const d = dailyState(this.sv);
    $('btn-daily').hidden = d.claimedToday;
    document.querySelectorAll('[data-coins]').forEach((el) => { el.textContent = fmt(this.sv.coins); });
    document.querySelectorAll('[data-parts]').forEach((el) => { el.textContent = fmt(this.sv.parts); });
  }

  /* Called every frame while a menu is up. */
  tickMenu(dt, renderer) {
    this.menuT += dt;
    if (this.current === 'menu') {
      if (!this.menuRenderer) {
        const c = $('menu-scene');
        // A second renderer of its own so the stage canvas is untouched.
        this.menuRenderer = new (renderer.constructor)(c);
        this.menuRenderer.setQuality(1);
      }
      this.menuRenderer.menu(this.menuT, this.sv.loadout.skin);
    }
    if (this.current === 'drone') this.drawDrone(dt);
  }

  /* ---- Sector intermission ----------------------------------------------
     Shown once a gate is cleared, with the run paused behind it. Its job is
     to say what the clear gave back and to be the one place mid-run where the
     loadout and the upgrade tree can be changed. */

  openSector(info) {
    this.sector = info;
    this.midRun = true;
    this.buildSector();
    // `from: null` keeps the back stack empty, so the panels opened from here
    // return to this screen and Back never walks into the main menu with a run
    // still paused behind it.
    this.show('sector', { from: null });
    this.audio.play('ui.select');
  }

  closeSector() {
    this.midRun = false;
    this.sector = null;
    this.stack.length = 0;
  }

  buildSector() {
    const info = this.sector;
    if (!info) return;
    $('sec-title').textContent = `Sector ${info.gate} clear`;
    $('sec-kill').innerHTML = '';
    const who = document.createElement('span');
    who.textContent = info.boss + ' is down';
    const small = document.createElement('small');
    small.textContent = `Gate ${info.gate} of the run`;
    $('sec-kill').append(who, small);

    const stats = $('sec-stats');
    stats.innerHTML = '';
    const row = (k, v) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      stats.append(dt, dd);
    };
    row('Clear bonus', fmt(info.score) + ' pts');
    row('Salvage', fmt(info.coins) + ' coins');
    row('Banked and spendable', fmt(this.sv.coins) + ' coins');

    /* Only what was actually restored is listed. A player who cleared the gate
       untouched should not be told their health was topped up. */
    const supply = $('sec-supply');
    supply.innerHTML = '';
    const line = (text, cls) => {
      const li = document.createElement('li');
      if (cls) li.className = cls;
      li.innerHTML = text;
      supply.appendChild(li);
    };
    const LABELS = {
      health: '<b>Health</b> restored to full',
      energy: '<b>Energy</b> cell recharged',
      shield: '<b>Shield</b> plating replaced',
      lives: `<b>Lives</b> back to ${SECTORS.lives}`,
      gadget: '<b>Gadget</b> off cooldown',
      rescue: '<b>FiDo-5</b> rescue rearmed',
    };
    for (const k of info.supplied || []) if (LABELS[k]) line(LABELS[k]);
    if (!supply.children.length) line('<b>Everything</b> was already at full');
    line(`<b>Shield</b> holds for ${SECTORS.clearShield} seconds once you set off`, 'is-shield');

    $('sec-hint').textContent = this.sv.coins > 0
      ? 'Coins earned this run are already banked, so anything you buy now applies to the rest of it.'
      : 'Upgrades and the loadout can both be changed here, and apply to the rest of this run.';
    this.refreshMenu();
  }

  /* Called whenever a panel changes something the run is already using. */
  _restat() {
    if (this.midRun && this.hooks.statsChanged) this.hooks.statsChanged();
  }

  /* ---- Loadout ---------------------------------------------------------- */

  openLoadout(from) { this.buildLoadout(); this.show('loadout', from ? { from } : {}); }

  buildLoadout() {
    const sv = this.sv;
    const st = resolveStats(sv);

    // Weapons
    const wrap = $('ld-weapons');
    wrap.innerHTML = '';
    for (const w of WEAPONS) {
      const up = sv.weapons[w.id];
      const preview = { ...sv, loadout: { ...sv.loadout, weapon: w.id } };
      const ps = resolveStats(preview).weapon;
      const card = this._card(w.name, w.blurb, sv.loadout.weapon === w.id, [
        ['DMG', ps.damage.toFixed(1)],
        ['RATE', ps.fireRate.toFixed(1) + '/s'],
        ['ENERGY', ps.cost.toFixed(1)],
        ['CRIT', Math.round(ps.crit * 100) + '%'],
      ], ps.effect ? ps.effectName : null);
      card.addEventListener('click', () => {
        sv.loadout.weapon = w.id; persist();
        this.audio.play('ui.select'); this._restat(); this.buildLoadout();
      });
      wrap.appendChild(card);
    }

    // Gadgets
    const gw = $('ld-gadgets');
    gw.innerHTML = '';
    for (const g of GADGETS) {
      const card = this._card(g.name, g.blurb, sv.loadout.gadget === g.id, [['COOLDOWN', g.cooldown + 's']]);
      card.addEventListener('click', () => {
        sv.loadout.gadget = g.id; persist();
        this.audio.play('ui.select'); this._restat(); this.buildLoadout();
      });
      gw.appendChild(card);
    }

    // Cores
    const cw = $('ld-cores');
    cw.innerHTML = '';
    for (const c of DRONE_CORES) {
      const preview = { ...sv, loadout: { ...sv.loadout, core: c.id } };
      const pd = resolveStats(preview).drone;
      const card = this._card(c.name, c.blurb, sv.loadout.core === c.id, [
        ['DMG', pd.damage.toFixed(1)],
        ['REACH', Math.round(pd.coinRadius) + 'px'],
        ['SHIELD', Math.round(pd.shieldStrength)],
        ['RESCUE', Math.round(pd.rescueCooldown) + 's'],
      ]);
      card.addEventListener('click', () => {
        sv.loadout.core = c.id; persist();
        this.audio.play('ui.select'); this._restat(); this.buildLoadout();
      });
      cw.appendChild(card);
    }

    // Skins
    const sw = $('ld-skins');
    sw.innerHTML = '';
    for (const sk of DRONE_SKINS) {
      const card = this._skinCard(sk, sv.loadout.skin === sk.id);
      card.addEventListener('click', () => {
        sv.loadout.skin = sk.id; persist();
        this.audio.play('ui.select'); this._restat(); this.buildLoadout();
      });
      sw.appendChild(card);
    }
    // "Start run" would restart the run that is paused behind the
    // intermission, which is the opposite of what a player reaching this
    // screen mid-run wants.
    $('ld-foot').hidden = this.midRun;
    this.refreshMenu();
  }

  _card(name, blurb, on, stats, badge) {
    const b = document.createElement('button');
    b.className = 'card' + (on ? ' is-on' : '');
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const n = document.createElement('span');
    n.className = 'card__name';
    n.textContent = name;
    b.appendChild(n);
    if (blurb) {
      const p = document.createElement('span');
      p.className = 'card__blurb';
      p.textContent = blurb;
      b.appendChild(p);
    }
    if (badge) {
      const p = document.createElement('span');
      p.className = 'card__blurb';
      p.style.color = 'var(--yellow)';
      p.textContent = 'Effect: ' + badge;
      b.appendChild(p);
    }
    if (stats && stats.length) {
      const row = document.createElement('span');
      row.className = 'card__stats';
      for (const [k, v] of stats) {
        const s = document.createElement('span');
        s.textContent = k + ' ';
        const bb = document.createElement('b');
        bb.textContent = v;
        s.appendChild(bb);
        row.appendChild(s);
      }
      b.appendChild(row);
    }
    return b;
  }

  _skinCard(sk, on) {
    const b = document.createElement('button');
    b.className = 'card' + (on ? ' is-on' : '');
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const sw = document.createElement('span');
    sw.className = 'card__swatch';
    const cv = document.createElement('canvas');
    cv.width = 15; cv.height = 11;
    const img = S.drone[sk.id].idle;
    cv.getContext('2d').drawImage(img.c, 0, 0);
    sw.appendChild(cv);
    b.appendChild(sw);
    const txt = document.createElement('span');
    const n = document.createElement('span');
    n.className = 'card__name';
    n.textContent = sk.name;
    const p = document.createElement('span');
    p.className = 'card__blurb';
    p.textContent = sk.blurb;
    txt.appendChild(n); txt.appendChild(p);
    b.appendChild(txt);
    return b;
  }

  /* ---- Upgrades -------------------------------------------------------- */

  openUpgrades(from) { this.buildUpgrades(); this.show('upgrades', from ? { from } : {}); }

  buildUpgrades() {
    const sv = this.sv;
    const wDef = byId(WEAPONS, sv.loadout.weapon);
    $('up-weapon-name').textContent = '— ' + wDef.short;

    this._upRows($('up-operative'), 'operative', OPERATIVE_UPGRADES);
    this._upRows($('up-weapon'), 'weapon', WEAPON_UPGRADES);
    this._upRows($('up-drone-combat'), 'drone', DRONE_UPGRADES.combat);
    this._upRows($('up-drone-utility'), 'drone', DRONE_UPGRADES.utility);
    this._upRows($('up-drone-defense'), 'drone', DRONE_UPGRADES.defense);

    // Which weapon effect is unlocked, and what the next one needs.
    const st = resolveStats(sv).weapon;
    const next = WEAPON_TIERS.find((t) => t.at > st.levels);
    const cur = WEAPON_TIERS.filter((t) => t.at <= st.levels).pop();
    $('up-weapon-effect').textContent = next
      ? `${cur.name}: ${cur.note} Next: ${next.name} at ${next.at} total weapon levels (you have ${st.levels}).`
      : `${cur.name}: ${cur.note} Fully unlocked.`;

    this.refreshMenu();
  }

  _upRows(wrap, group, defs) {
    wrap.innerHTML = '';
    for (const def of defs) {
      const info = upgradeInfo(this.sv, group, def.id);
      const row = document.createElement('div');
      row.className = 'up';

      const name = document.createElement('div');
      name.className = 'up__name';
      name.textContent = def.name;
      row.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'up__meta';
      meta.textContent = `${def.unit} — level ${info.level} of ${info.max}`;
      row.appendChild(meta);

      const pips = document.createElement('div');
      pips.className = 'up__pips';
      // Levels are shown as filled pips, so progress is not colour-only.
      for (let i = 0; i < info.max; i++) {
        const p = document.createElement('span');
        p.className = 'up__pip' + (i < info.level ? ' is-on' : '');
        pips.appendChild(p);
      }
      row.appendChild(pips);

      const buy = document.createElement('button');
      buy.className = 'up__buy' + (info.affordable ? ' can' : '');
      buy.type = 'button';
      if (info.maxed) {
        buy.textContent = 'Maxed';
        buy.disabled = true;
      } else {
        buy.innerHTML = '';
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = fmt(info.cost) + ' ◈';
        buy.appendChild(c);
        if (info.parts) {
          const pp = document.createElement('span');
          pp.className = 'c';
          pp.textContent = '+' + info.parts + ' part';
          buy.appendChild(pp);
        }
        buy.disabled = !info.affordable;
        buy.setAttribute('aria-label',
          `Upgrade ${def.name} for ${info.cost} coins${info.parts ? ' and ' + info.parts + ' parts' : ''}`);
        buy.addEventListener('click', () => {
          if (buyUpgrade(this.sv, group, def.id)) {
            this.audio.play('ui.buy');
            this._restat();
            this.buildUpgrades();
          } else {
            this.audio.play('ui.deny');
          }
        });
      }
      row.appendChild(buy);
      wrap.appendChild(row);
    }
  }

  /* ---- FiDo-5 inspector ------------------------------------------------ */

  openDrone() { this.buildDrone(); this.show('drone'); }

  buildDrone() {
    const sv = this.sv;
    const sw = $('dr-skins');
    sw.innerHTML = '';
    for (const sk of DRONE_SKINS) {
      const card = this._skinCard(sk, sv.loadout.skin === sk.id);
      card.addEventListener('click', () => {
        sv.loadout.skin = sk.id; persist();
        this.audio.play('ui.select'); this.buildDrone();
      });
      sw.appendChild(card);
    }
    const cw = $('dr-cores');
    cw.innerHTML = '';
    for (const c of DRONE_CORES) {
      const card = this._card(c.name, c.blurb, sv.loadout.core === c.id, []);
      card.addEventListener('click', () => {
        sv.loadout.core = c.id; persist();
        this.audio.play('ui.select'); this.buildDrone();
      });
      cw.appendChild(card);
    }

    const d = resolveStats(sv).drone;
    const rows = [
      ['Damage', d.damage.toFixed(1)],
      ['Fire rate', d.fireRate.toFixed(2) + '/s'],
      ['Targeting', d.acquireTime.toFixed(2) + 's'],
      ['Coin radius', Math.round(d.coinRadius) + 'px'],
      ['Loot radius', Math.round(d.lootRadius) + 'px'],
      ['Crate detection', Math.round(d.crateDetect) + 'px'],
      ['Shield strength', Math.round(d.shieldStrength)],
      ['Rescue heal', Math.round(d.rescueHeal)],
      ['Rescue cooldown', Math.round(d.rescueCooldown) + 's'],
    ];
    const dl = $('dr-stats');
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    this.refreshMenu();
  }

  /* A turntable: the sprite is squashed horizontally by the yaw and the far
     thruster pod dims, which reads as the drone turning without pretending
     to be 3D. */
  drawDrone(dt) {
    this.droneT += dt;
    const cv = $('drone-view');
    const x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    const W = cv.width, H = cv.height;

    // Transparent, so the panel's own gradient shows through instead of a
    // flat dark rectangle sitting inside it.
    x.clearRect(0, 0, W, H);

    // Turntable floor.
    x.strokeStyle = 'rgba(53,208,255,0.22)';
    x.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      x.beginPath();
      x.ellipse(W / 2, H * 0.78, 20 + i * 14, (20 + i * 14) * 0.24, 0, 0, Math.PI * 2);
      x.stroke();
    }

    const sheet = S.drone[this.sv.loadout.skin] || S.drone.standard;
    const scan = Math.sin(this.droneT * 1.3) > 0.6;
    const img = scan ? sheet.scan : sheet.idle;
    const scale = 6;
    const yaw = this.droneYaw;
    const squash = Math.max(0.18, Math.abs(Math.cos(yaw)));
    const w = img.w * scale * squash;
    const h = img.h * scale;
    const cx = W / 2;
    const cy = H * 0.46 + Math.sin(this.droneT * 2.1) * 5;

    // Glow behind, so the silhouette separates from the panel.
    x.globalAlpha = 0.16 + (scan ? 0.1 : 0);
    x.fillStyle = sheet.glow;
    x.beginPath();
    x.ellipse(cx, cy, w * 0.7, h * 0.62, 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;

    x.save();
    x.translate(cx, cy);
    if (Math.cos(yaw) < 0) x.scale(-1, 1);        // showing the back
    x.drawImage(img.c, -w / 2 / 1, -h / 2, Math.max(2, w), h);
    x.restore();

    // Thruster wash under the pods.
    x.globalAlpha = 0.55 + Math.random() * 0.3;
    x.fillStyle = sheet.glow;
    x.fillRect(cx - 3, cy + h / 2 - 4, 6, 4 + Math.random() * 8);
    x.globalAlpha = 1;

    // Shadow on the turntable.
    x.globalAlpha = 0.3;
    x.fillStyle = '#000';
    x.beginPath();
    x.ellipse(cx, H * 0.78, w * 0.42, w * 0.1, 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
  }

  /* ---- Missions -------------------------------------------------------- */

  openMissions() { this.buildMissions(); this.show('missions'); }

  buildMissions() {
    const sv = this.sv;
    const lv = levelInfo(sv);
    $('mi-level').textContent = 'Lv ' + lv.level;
    $('mi-xp').style.width = Math.round((lv.into / lv.need) * 100) + '%';
    $('mi-xp-note').textContent = `${fmt(lv.into)} of ${fmt(lv.need)} XP to level ${lv.level + 1}`;

    const list = $('mi-list');
    list.innerHTML = '';
    for (const m of sv.missions) {
      const target = missionTarget(m);
      const prog = Math.min(m.progress, target);
      const def = byId(MISSIONS, m.id);
      const el = document.createElement('div');
      el.className = 'mission' + (prog >= target ? ' is-done' : '');
      const n = document.createElement('div');
      n.className = 'mission__name';
      n.textContent = missionLabel(m);
      const bar = document.createElement('div');
      bar.className = 'mission__bar';
      const fill = document.createElement('div');
      fill.style.width = Math.round((prog / target) * 100) + '%';
      bar.appendChild(fill);
      const meta = document.createElement('div');
      meta.className = 'mission__meta';
      const left = document.createElement('span');
      left.textContent = `${fmt(prog)} / ${fmt(target)}`;
      const right = document.createElement('span');
      right.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = `${fmt(def.reward.coins)} coins` +
        (def.reward.parts ? ` + ${def.reward.parts} part${def.reward.parts === 1 ? '' : 's'}` : '');
      right.appendChild(b);
      meta.appendChild(left); meta.appendChild(right);
      el.appendChild(n); el.appendChild(bar); el.appendChild(meta);
      list.appendChild(el);
    }

    this._dailyGrid($('mi-daily'));

    const s = sv.stats;
    const rows = [
      ['Runs', fmt(s.runs)],
      ['Enemies destroyed', fmt(s.kills)],
      ['Elites destroyed', fmt(s.elites)],
      ['Distance travelled', fmt(s.distance) + ' m'],
      ['Coins collected', fmt(s.coinsEarned)],
      ['Crates opened', fmt(s.crates)],
      ['Vaults opened', fmt(s.vaults)],
      ['FiDo-5 rescues', fmt(s.rescues)],
      ['Best streak', fmt(s.bestStreak)],
      ['Best score', fmt(sv.best.score)],
      ['Best distance', fmt(sv.best.distance) + ' m'],
    ];
    const dl = $('mi-stats');
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    }
  }

  _dailyGrid(wrap) {
    const st = dailyState(this.sv);
    wrap.innerHTML = '';
    DAILY.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = 'day' + (i < st.day ? ' is-done' : '') + (i === st.day && !st.claimedToday ? ' is-next' : '');
      const n = document.createElement('div');
      n.className = 'day__n';
      n.textContent = 'Day ' + d.day;
      const r = document.createElement('div');
      r.className = 'day__r';
      r.textContent = d.label;
      el.appendChild(n); el.appendChild(r);
      wrap.appendChild(el);
    });
  }

  /* ---- Daily ----------------------------------------------------------- */

  openDaily() {
    this._dailyGrid($('dl-list'));
    const st = dailyState(this.sv);
    $('btn-claim').disabled = st.claimedToday;
    $('btn-claim').textContent = st.claimedToday ? 'Already claimed today' : 'Claim ' + st.next.label;
    this.show('daily');
  }

  doClaim() {
    const r = claimDaily(this.sv);
    if (!r) { this.audio.play('ui.deny'); return; }
    this.audio.play('ui.buy');
    this.refreshMenu();
    this.openDaily();
  }

  /* ---- Settings -------------------------------------------------------- */

  openSettings() { this.syncSettings(); this.show('settings'); }

  doReset() {
    // Two steps, because this is the one irreversible button in the game.
    const btn = $('set-reset');
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to erase everything';
      this.audio.play('ui.deny');
      setTimeout(() => {
        btn.dataset.armed = '0';
        btn.textContent = 'Erase all progress';
      }, 4000);
      return;
    }
    const fresh = resetSave();
    Object.keys(this.sv).forEach((k) => delete this.sv[k]);
    Object.assign(this.sv, fresh);
    btn.dataset.armed = '0';
    btn.textContent = 'Progress erased';
    this.audio.play('ui.back');
    this.syncSettings();
    this.refreshMenu();
    this.hooks.applySettings();
    setTimeout(() => { btn.textContent = 'Erase all progress'; }, 2500);
  }

  /* ---- Results --------------------------------------------------------- */

  showResults(run, outcome) {
    $('res-title').textContent = outcome.newBestScore ? 'New best score' : 'Run complete';
    $('res-score').textContent = fmt(run.score);

    const bestLine = [];
    if (outcome.newBestScore) bestLine.push('New best score');
    if (outcome.newBestDist) bestLine.push('New best distance');
    const bestEl = $('res-best');
    bestEl.hidden = bestLine.length === 0;
    bestEl.textContent = bestLine.join(' · ');
    bestEl.style.color = 'var(--yellow)';

    const rows = [
      ['Distance', fmt(run.distance) + ' m'],
      ['Enemies destroyed', fmt(run.kills)],
      ['Elites destroyed', fmt(run.elites)],
      ['Coins collected', fmt(run.coins)],
      ['Crates opened', fmt(run.crates)],
      ['Vaults opened', fmt(run.vaults)],
      ['Upgrade parts', fmt(run.parts)],
      ['FiDo-5 rescues', fmt(run.rescues)],
      ['Best streak', '×' + (1 + Math.min(SCORE.streakMax, run.bestStreak) * SCORE.streakMult).toFixed(2)],
    ];
    const dl = $('res-stats');
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    }

    const mw = $('res-missions');
    mw.innerHTML = '';
    for (const m of outcome.missions) {
      const el = document.createElement('div');
      el.className = 'res-mission';
      const b = document.createElement('b');
      b.textContent = 'Mission complete — ';
      el.appendChild(b);
      const parts = m.reward.parts
        ? ` and ${m.reward.parts} upgrade part${m.reward.parts === 1 ? '' : 's'}.`
        : '.';
      el.appendChild(document.createTextNode(`${m.label}. ${fmt(m.reward.coins)} coins${parts}`));
      mw.appendChild(el);
    }

    const lv = levelInfo(this.sv);
    $('res-xp').style.width = Math.round((lv.into / lv.need) * 100) + '%';
    $('res-xp-note').textContent = outcome.levelUp
      ? `Level ${lv.level} reached.`
      : `Level ${lv.level} — ${fmt(lv.into)} of ${fmt(lv.need)} XP.`;

    // One useful pointer rather than a wall of advice.
    const hints = [];
    if (run.rescues === 0 && run.distance > 400) hints.push('FiDo-5 can save you from one killing blow per cooldown. Upgrade its Defense tracks to make that count.');
    if (run.crates === 0) hints.push('Crates sit off the safe route. Get near one and FiDo-5 will crack it open.');
    if (this.sv.keys > 0) hints.push(`You are carrying ${this.sv.keys} vault key${this.sv.keys > 1 ? 's' : ''}. Vaults only appear once you have one.`);
    if (this.sv.coins > 300) hints.push('You can afford an upgrade. Small increases compound quickly.');
    if (run.distance > 1200) hints.push('The rooftops score more. Take the high route when the enemies are thin.');
    $('res-hint').textContent = hints.length ? hints[0] : '';

    this.show('results');
    this.refreshMenu();
  }

  /* ---- HUD ------------------------------------------------------------- */

  buildHudIcons(sv) {
    const cv = $('gadget-icon');
    const g = byId(GADGETS, sv.loadout.gadget);
    const img = S.gadget[g.id];
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    x.imageSmoothingEnabled = false;
    x.drawImage(img.c, 0, 0);
    $('btn-gadget').setAttribute('aria-label', 'Use ' + g.name);
  }

  updateHud(game) {
    const r = game.run;
    const p = game.player;
    if (!r) return;

    $('hud-score').textContent = fmt(r.score);
    $('hud-dist').textContent = fmt(r.distance) + ' m';
    $('hud-coins').textContent = fmt(r.coins);

    const keyWrap = $('hud-key-wrap');
    keyWrap.hidden = r.keys <= 0;
    if (r.keys > 0) $('hud-keys').textContent = fmt(r.keys);

    const streak = $('hud-streak');
    const mult = game.mult();
    streak.hidden = mult <= 1.001;
    if (!streak.hidden) streak.textContent = '×' + mult.toFixed(2);

    const hp = Math.max(0, p.health / p.maxHealth);
    const hb = document.querySelector('.bar--health');
    $('hud-health').style.width = (hp * 100) + '%';
    $('hud-health-num').textContent = Math.max(0, Math.round(p.health));
    hb.classList.toggle('is-low', hp < 0.3);

    // Either flourish owns the screen. The HUD is small DOM text and it
    // clutters a title card, so it steps aside while one is up — for the intro
    // it comes back with the bell, for the defeat card the intermission takes
    // over behind it.
    this.hud.classList.toggle('is-card', r.bossPhase === 'intro' || r.bossPhase === 'outro');

    // Lives: only during a boss fight, and only ever redrawn when the count
    // changes, since this runs every frame.
    const lw = $('hud-lives');
    const inFight = game.inFight;
    lw.hidden = !inFight;
    if (inFight && this._livesShown !== r.lives) {
      const lost = this._livesShown !== undefined && r.lives < this._livesShown;
      this._livesShown = r.lives;
      const pips = $('hud-lives-pips');
      pips.innerHTML = '';
      for (let i = 0; i < SECTORS.lives; i++) {
        const pip = document.createElement('i');
        if (i >= r.lives) pip.className = 'is-spent';
        pips.appendChild(pip);
      }
      lw.setAttribute('aria-label', `${r.lives} of ${SECTORS.lives} lives remaining`);
      if (lost) {
        lw.classList.remove('is-lost');
        void lw.offsetWidth;            // restart the flash
        lw.classList.add('is-lost');
      }
    }
    if (!inFight) this._livesShown = undefined;

    const shWrap = $('hud-shield-wrap');
    shWrap.hidden = p.shield <= 0;
    if (p.shield > 0) $('hud-shield').style.width = Math.min(100, (p.shield / Math.max(1, p.maxShield)) * 100) + '%';

    $('hud-energy').style.width = (p.energy / p.energyMax * 100) + '%';
    const eb = document.querySelector('.bar--energy');
    eb.classList.toggle('is-warn', r.energyWarn > 0);

    // FiDo-5 status, in words as well as a bar.
    const dw = $('hud-drone');
    const d = game.drone;
    let label = 'Ready';
    if (d.rescuePhase) label = 'Rescuing';
    else if (d.rescueCool > 0) label = 'Recharging ' + Math.ceil(d.rescueCool) + 's';
    else if (d.state === 'crate') label = 'Opening crate';
    else if (d.state === 'engage') label = d.lock > 0 ? 'Acquiring' : 'Engaging';
    else if (d.state === 'fetch') label = 'Retrieving';
    $('hud-drone-state').textContent = label;
    const frac = d.rescueCool > 0 ? 1 - d.rescueCool / Math.max(0.001, r.drone.rescueCooldown) : 1;
    $('hud-drone-fill').style.width = (frac * 100) + '%';
    dw.classList.toggle('is-cooling', d.rescueCool > 0);

    // Gadget cooldown as a sweeping mask.
    const cool = $('gadget-cool');
    const gd = r.gadget;
    const pct = r.gadgetCool > 0 ? r.gadgetCool / gd.cooldown : 0;
    cool.style.setProperty('--p', (pct * 360) + 'deg');
    $('btn-gadget').classList.toggle('is-down', r.gadgetShield > 0);

    // What the last crate held, for as long as the run keeps it up.
    const rw = $('hud-reward');
    if (r.reward) {
      if (rw.dataset.k !== r.reward.title + r.reward.detail) {
        rw.dataset.k = r.reward.title + r.reward.detail;
        $('hud-reward-what').textContent = r.reward.title;
        $('hud-reward-got').textContent = r.reward.detail;
      }
      rw.hidden = false;
    } else {
      rw.hidden = true;
      rw.dataset.k = '';
    }

    // Active power-ups with their remaining time.
    const pw = $('hud-powers');
    const want = [...r.actives.entries()];
    if (pw.childElementCount !== want.length) {
      pw.innerHTML = '';
      for (const [id, a] of want) {
        const li = document.createElement('li');
        li.dataset.id = id;
        const n = document.createElement('span');
        n.textContent = a.def.name;
        const t = document.createElement('span');
        t.className = 't';
        li.appendChild(n); li.appendChild(t);
        pw.appendChild(li);
      }
    }
    for (const li of pw.children) {
      const a = r.actives.get(li.dataset.id);
      if (a) li.querySelector('.t').textContent = Math.ceil(a.t) + 's';
    }
  }

  /* ---- Debug ----------------------------------------------------------- */

  enableDebug() {
    if (this.debugOn) { this.show('debug'); return; }
    this.debugOn = true;
    this.buildDebug();
    this.audio.play('ui.buy');
    this.show('debug');
  }

  buildDebug() {
    const body = $('debug-body');
    body.innerHTML = '';
    const note = document.createElement('p');
    note.className = 'note dbg-note';
    note.textContent = 'Development tools. Reached only via ?debug=1 or five taps on the logo, and never shown otherwise.';
    body.appendChild(note);

    const out = document.createElement('pre');
    out.id = 'dbg-out';
    out.textContent = 'Ready.';

    const add = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn--menu';
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        const msg = fn();
        if (msg) out.textContent = msg;
        this.audio.play('ui.select');
      });
      body.appendChild(b);
    };

    const h = this.hooks.debug;

    add('+1,000 coins', () => { this.sv.coins += 1000; persist(); this.refreshMenu(); return 'Coins: ' + this.sv.coins; });
    add('+20 parts', () => { this.sv.parts += 20; persist(); this.refreshMenu(); return 'Parts: ' + this.sv.parts; });
    add('+5 keys', () => { this.sv.keys += 5; persist(); this.refreshMenu(); return 'Keys: ' + this.sv.keys; });
    add('Unlock everything', () => {
      for (const w of WEAPONS) this.sv.weapons[w.id].unlocked = true;
      for (const g of GADGETS) this.sv.gadgets[g.id] = true;
      for (const c of DRONE_CORES) this.sv.drone.cores[c.id] = true;
      for (const s of DRONE_SKINS) this.sv.drone.skins[s.id] = true;
      persist();
      return 'All weapons, gadgets, cores and skins unlocked.';
    });
    add('Max all upgrades', () => {
      for (const d of OPERATIVE_UPGRADES) this.sv.operative[d.id] = d.max;
      for (const id in this.sv.weapons) {
        for (const d of WEAPON_UPGRADES) this.sv.weapons[id].up[d.id] = d.max;
      }
      for (const d of allDroneUpgrades()) this.sv.drone.up[d.id] = d.max;
      persist();
      return 'Every upgrade set to maximum.';
    });
    add('Spawn enemy', () => h.spawnEnemy(false) || 'Spawned a scout.');
    add('Spawn elite', () => h.spawnEnemy(true) || 'Spawned an elite.');
    add('Spawn crate', () => h.spawnCrate('epic') || 'Spawned an epic crate.');
    add('Spawn vault', () => h.spawnCrate('vault') || 'Spawned a vault.');
    add('Give power-up', () => h.givePower() || 'Power-up applied.');
    add('Trigger rescue', () => h.forceRescue() || 'Rescue triggered.');
    add('Speed ×1.5', () => h.speedMul(1.5));
    add('Speed ×1', () => h.speedMul(1));
    add('Difficulty +0.2', () => h.diffAdd(0.2));
    add('Difficulty 0', () => h.diffAdd(-1));
    add('Restart run', () => { this.hooks.restart(); return 'Restarted.'; });
    add('Run fairness test', () => {
      const r = selfTest(300, (Math.random() * 1e9) | 0);
      return `Generated ${r.chunks} chunks / ${r.columns} columns.\n` +
             `Unreachable columns: ${r.unreachable}\n` +
             `Automatic repairs applied: ${r.repairs}`;
    });
    add('Show run state', () => h.dump());

    body.appendChild(out);
  }
}
