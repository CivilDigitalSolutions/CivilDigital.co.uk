/* ==========================================================================
   FiDo-5 — Content data.
   Everything the game is *made of* lives here as plain data so new content
   can be added without touching game logic. No behaviour in this file.
   ========================================================================== */

/* ---- World / tuning ----------------------------------------------------- */

export const WORLD = {
  viewW: 320,            // internal render width  (px, integer-scaled to fit)
  viewH: 180,            // internal render height
  metre: 12,             // world px per metre — also the column width
  tierCount: 3,
  tierY: [148, 100, 52], // ground line (feet) for street / walkway / rooftop
  gravity: 800,          // px/s^2
  jumpVel: -320,         // px/s — apex 64px, clears one 48px tier with margin
  slideTime: 0.55,       // s
  playerScreenX: 88,     // player's fixed x on screen
  nudge: 32,             // px/s of forward/back player-controlled drift
  nudgeRange: 30,        // px the player may drift from playerScreenX
  chunkAhead: 3,         // chunks kept generated ahead of the player
  despawnBehind: 110,    // px behind camera before entities recycle
};

/* Difficulty curve. `t` is 0..1 and derived from distance travelled;
   everything the runner scales with is expressed here rather than in code. */
export const DIFFICULTY = {
  rampMetres: 2600,      // distance over which t goes 0 -> 1
  speed:        [112, 248],
  enemyDensity: [0.55, 1.85],
  enemyHealth:  [1.0, 2.5],
  enemyDamage:  [1.0, 1.9],
  obstacleDensity: [0.5, 1.5],
  eliteChance:  [0.0, 0.30],
  variety:      [2, 5],   // how many enemy types are in the pool
};

/* ---- Palette ------------------------------------------------------------ */
/* One shared palette keeps the pixel art coherent. Sprite art references
   these by single character. */
export const PAL = {
  '.': null,             // transparent
  K: '#080a12',          // outline
  N: '#161b33',          // darkest navy
  D: '#252c52',          // dark navy
  M: '#3b4472',          // mid navy
  S: '#5a659c',          // slate
  L: '#8f9ad2',          // light slate
  W: '#dfe4ff',          // near white
  E: '#ffffff',          // white
  P: '#8b5cf6',          // brand purple
  p: '#b794ff',          // light purple
  F: '#6d28d9',          // deep purple
  R: '#ff3d68',          // hot red
  r: '#8c1533',          // dark red
  A: '#ffb238',          // amber
  Y: '#ffe66d',          // yellow
  G: '#2ee6a6',          // mint
  g: '#0e7a58',          // dark mint
  C: '#35d0ff',          // cyan
  c: '#1a6c99',          // dark cyan
  O: '#ff7a29',          // orange
  o: '#a8410d',          // dark orange
  B: '#9aa4c8',          // bone / grey
  b: '#5c6480',          // dark grey
};

/* ---- Weapons ------------------------------------------------------------ */
/* Energy replaces ammunition. `cost` is energy per shot, drawn from a pool
   that regenerates continuously. */
export const WEAPONS = [
  {
    id: 'assault',
    name: 'AR-7 Assault Rifle',
    short: 'Assault Rifle',
    blurb: 'Balanced damage and rate of fire. Good at everything, best at nothing.',
    damage: 10,
    fireRate: 6.5,        // shots/s
    cost: 5.5,            // energy/shot
    crit: 0.06,
    speed: 420,           // projectile px/s
    spread: 0.012,
    pellets: 1,
    tracer: 'A',
    size: [5, 2],
    unlocked: true,
    cost_coins: 0,
  },
  {
    id: 'smg',
    name: 'VX-2 Machine Pistol',
    short: 'SMG',
    blurb: 'Low damage per shot, very high rate of fire. Shreds groups.',
    damage: 5.5,
    fireRate: 13,
    cost: 3.1,
    crit: 0.05,
    speed: 380,
    spread: 0.05,
    pellets: 1,
    tracer: 'Y',
    size: [4, 2],
    unlocked: true,
    cost_coins: 0,
  },
  {
    id: 'plasma',
    name: 'ION Plasma Rifle',
    short: 'Plasma Rifle',
    blurb: 'Heavy energy bolts that pierce the first target. Slow, and thirsty.',
    damage: 26,
    fireRate: 2.4,
    cost: 15,
    crit: 0.10,
    speed: 320,
    spread: 0.0,
    pellets: 1,
    tracer: 'C',
    size: [8, 4],
    pierce: 1,
    unlocked: true,
    cost_coins: 0,
  },
];

/* Weapon upgrade tracks. Cost grows with level; effects are multipliers or
   flat additions applied in combat.js. */
export const WEAPON_UPGRADES = [
  { id: 'damage', name: 'Damage',            max: 8, cost: [140, 1.55], per: 0.12, unit: '+12% per level' },
  { id: 'rate',   name: 'Fire rate',         max: 6, cost: [160, 1.60], per: 0.08, unit: '+8% per level' },
  { id: 'crit',   name: 'Critical chance',   max: 6, cost: [180, 1.62], per: 0.03, unit: '+3 points per level' },
  { id: 'energy', name: 'Energy efficiency', max: 6, cost: [150, 1.58], per: 0.07, unit: '-7% cost per level' },
];

/* Tier effects unlock as the total upgrade level on a weapon rises. */
export const WEAPON_TIERS = [
  { at: 0,  id: null,      name: 'Standard',      note: 'No special effect.' },
  { at: 5,  id: 'pierce',  name: 'Piercing',      note: 'Shots pass through one extra enemy.' },
  { at: 10, id: 'burn',    name: 'Incendiary',    note: 'Hits set the target alight for extra damage over time.' },
  { at: 15, id: 'chain',   name: 'Chain Lightning', note: 'Hits arc to a nearby second enemy.' },
  { at: 20, id: 'explode', name: 'Explosive Rounds', note: 'Hits detonate for splash damage.' },
];

/* ---- Gadgets ------------------------------------------------------------ */
export const GADGETS = [
  {
    id: 'shield',
    name: 'Shield Generator',
    blurb: 'Absorbs all damage for a few seconds.',
    cooldown: 16,
    duration: 5,
    icon: 'shield',
  },
  {
    id: 'emp',
    name: 'EMP Burst',
    blurb: 'Overloads nearby machines: heavy damage and a stun.',
    cooldown: 14,
    radius: 128,
    damage: 42,
    stun: 2.2,
    icon: 'emp',
  },
  {
    id: 'missile',
    name: 'Missile Strike',
    blurb: 'Calls a salvo down the track ahead of you.',
    cooldown: 19,
    salvo: 5,
    damage: 55,
    radius: 36,
    icon: 'missile',
  },
];

/* ---- FiDo-5 cores ------------------------------------------------------- */
/* Cores are multipliers applied over the drone's upgrade levels. */
export const DRONE_CORES = [
  {
    id: 'attack',
    name: 'Attack Core',
    blurb: 'Hits harder and faster, and picks priority targets first.',
    mods: { droneDamage: 1.55, droneRate: 1.40, droneAcquire: 1.35,
            collectRadius: 0.85, shieldStrength: 0.80, rescueCooldown: 1.15 },
  },
  {
    id: 'support',
    name: 'Support Core',
    blurb: 'Stronger emergency shield and a faster rescue recharge.',
    mods: { droneDamage: 0.80, droneRate: 0.90, droneAcquire: 1.0,
            collectRadius: 1.0, shieldStrength: 1.70, rescueCooldown: 0.62 },
  },
  {
    id: 'utility',
    name: 'Utility Core',
    blurb: 'Sweeps up coins and loot from much further away, and spots crates early.',
    mods: { droneDamage: 0.72, droneRate: 0.95, droneAcquire: 1.0,
            collectRadius: 1.95, shieldStrength: 0.95, rescueCooldown: 1.0,
            crateDetect: 1.9, coinBonus: 1.15 },
  },
];

/* ---- FiDo-5 skins ------------------------------------------------------- */
/* Cosmetic only. `map` remaps palette characters in the drone sprite, so a
   new skin is three lines of data and no code. */
export const DRONE_SKINS = [
  {
    id: 'standard',
    name: 'Standard Issue',
    blurb: 'White chassis, blue running lights. Factory finish.',
    map: { hull: 'W', hull2: 'L', trim: 'S', light: 'C', glow: '#35d0ff', vent: 'M' },
  },
  {
    id: 'tactical',
    name: 'Tactical Black',
    blurb: 'Matte black, red optics. Looks like it has opinions.',
    map: { hull: 'D', hull2: 'N', trim: 'M', light: 'R', glow: '#ff3d68', vent: 'K' },
  },
  {
    id: 'rescue',
    name: 'Industrial Rescue',
    blurb: 'Hazard orange with utility markings. Built for the bad days.',
    map: { hull: 'O', hull2: 'o', trim: 'B', light: 'Y', glow: '#ffe66d', vent: 'N' },
  },
];

/* ---- FiDo-5 upgrades ---------------------------------------------------- */
export const DRONE_UPGRADES = {
  combat: [
    { id: 'droneDamage',  name: 'Damage',        max: 8, cost: [130, 1.55], per: 0.14, unit: '+14% per level' },
    { id: 'droneRate',    name: 'Fire rate',     max: 6, cost: [150, 1.58], per: 0.10, unit: '+10% per level' },
    { id: 'droneAcquire', name: 'Targeting speed', max: 5, cost: [140, 1.55], per: 0.15, unit: '+15% per level' },
  ],
  utility: [
    { id: 'coinRadius',   name: 'Coin collection radius', max: 6, cost: [120, 1.52], per: 0.18, unit: '+18% per level' },
    { id: 'lootRadius',   name: 'Loot collection radius', max: 6, cost: [130, 1.52], per: 0.18, unit: '+18% per level' },
    { id: 'crateDetect',  name: 'Crate detection',        max: 5, cost: [150, 1.55], per: 0.20, unit: '+20% range per level' },
    { id: 'efficiency',   name: 'Collection efficiency',  max: 5, cost: [160, 1.58], per: 0.12, unit: '+12% faster per level' },
  ],
  defense: [
    { id: 'shieldStrength', name: 'Shield strength',    max: 7, cost: [140, 1.56], per: 0.16, unit: '+16% per level' },
    { id: 'rescueHeal',     name: 'Rescue effectiveness', max: 6, cost: [170, 1.60], per: 0.15, unit: '+15% restored per level' },
    { id: 'rescueCooldown', name: 'Rescue cooldown',    max: 6, cost: [190, 1.64], per: 0.08, unit: '-8% per level' },
  ],
};

export const DRONE_BASE = {
  damage: 4.2,
  fireRate: 1.5,          // shots/s
  range: 196,
  acquireTime: 0.5,       // s to lock a target
  coinRadius: 30,
  lootRadius: 32,
  crateDetect: 164,
  rescueCooldown: 26,     // s
  rescueHeal: 26,         // health restored
  shieldStrength: 34,     // shield points granted by a rescue
  shieldTime: 3.2,        // s of invulnerable window after a rescue
};

/* ---- Operative upgrades ------------------------------------------------- */
export const OPERATIVE_UPGRADES = [
  { id: 'maxHealth',  name: 'Maximum health',  max: 8, cost: [150, 1.55], per: 12,   unit: '+12 health per level' },
  { id: 'startShield',name: 'Starting shield', max: 6, cost: [170, 1.60], per: 10,   unit: '+10 shield per level' },
  { id: 'coinMult',   name: 'Coin multiplier', max: 6, cost: [200, 1.66], per: 0.10, unit: '+10% coins per level' },
  { id: 'energyMax',  name: 'Energy capacity', max: 6, cost: [160, 1.56], per: 12,   unit: '+12 energy per level' },
  { id: 'energyRegen',name: 'Energy recovery', max: 6, cost: [160, 1.56], per: 0.10, unit: '+10% per level' },
];

export const OPERATIVE_BASE = {
  maxHealth: 100,
  startShield: 0,
  energyMax: 100,
  energyRegen: 24,        // energy/s
  coinMult: 1,
  invulnAfterHit: 0.9,    // s
};

/* ---- Enemies ------------------------------------------------------------ */
/* `behaviour` is a key combat.js switches on. Anything numeric is scaled by
   difficulty at spawn time. */
export const ENEMIES = [
  {
    id: 'scout',
    name: 'Scout Drone',
    behaviour: 'drifter',
    health: 12,
    damage: 8,
    score: 45,
    coins: 3,
    w: 14, h: 11,
    speed: 26,             // relative closing speed
    fireRate: 0.55,
    projSpeed: 128,
    tier: 'any',
    weight: 34,
    fromDifficulty: 0,
  },
  {
    id: 'shield',
    name: 'Shield Drone',
    behaviour: 'shielder',
    health: 26,
    damage: 11,
    score: 95,
    coins: 5,
    w: 16, h: 15,
    speed: 16,
    fireRate: 0.42,
    projSpeed: 142,
    shieldFront: 0.82,     // fraction of damage blocked from the front
    tier: 'any',
    weight: 20,
    fromDifficulty: 0.12,
  },
  {
    id: 'bomber',
    name: 'Bomber Drone',
    behaviour: 'bomber',
    health: 20,
    damage: 15,
    score: 120,
    coins: 6,
    w: 17, h: 13,
    speed: 34,
    fireRate: 0.34,
    blastRadius: 27,
    blastDelay: 1.1,       // telegraphed
    tier: 'any',
    weight: 17,
    fromDifficulty: 0.22,
  },
  {
    id: 'turret',
    name: 'Sniper Turret',
    behaviour: 'turret',
    health: 30,
    damage: 20,
    score: 140,
    coins: 7,
    w: 18, h: 18,
    speed: 0,              // static, mounted to the tier
    fireRate: 0.30,
    chargeTime: 1.15,      // visible warning beam before it fires
    projSpeed: 310,
    tier: 'ground',
    weight: 15,
    fromDifficulty: 0.30,
  },
  {
    id: 'tank',
    name: 'Mini-Tank',
    behaviour: 'tank',
    health: 78,
    damage: 22,
    score: 240,
    coins: 12,
    w: 26, h: 18,
    speed: 8,
    fireRate: 0.36,
    projSpeed: 162,
    tier: 'ground',
    weight: 14,
    fromDifficulty: 0.42,
  },
];

/* Elite variants are a single multiplier set applied over any enemy, so
   every future enemy gets an elite for free. */
export const ELITE = {
  health: 3.4,
  damage: 1.5,
  score: 4.0,
  coins: 3.5,
  scale: 1.28,
  fireRate: 1.25,
  keyChance: 0.55,
  crateChance: 0.85,
  crateRarity: { rare: 0.55, epic: 0.45 },
};

/* ---- Loot --------------------------------------------------------------- */
export const CRATES = [
  {
    id: 'common', name: 'Supply Crate', rarity: 'common',
    colour: 'B', accent: 'C', scanTime: 0.85,
    table: [
      { w: 46, kind: 'coins',  min: 18, max: 42 },
      { w: 24, kind: 'health', min: 14, max: 26 },
      { w: 18, kind: 'power',  pool: ['rapid', 'magnet'] },
      { w: 12, kind: 'energy', min: 40, max: 70 },
    ],
  },
  {
    id: 'rare', name: 'Rare Cache', rarity: 'rare',
    colour: 'C', accent: 'E', scanTime: 1.15,
    table: [
      { w: 30, kind: 'coins',  min: 55, max: 110 },
      { w: 22, kind: 'power',  pool: ['overcharge', 'shield', 'rapid'] },
      { w: 20, kind: 'shield', min: 25, max: 45 },
      { w: 16, kind: 'droneBoost', duration: 12 },
      { w: 12, kind: 'parts',  min: 1, max: 2 },
    ],
  },
  {
    id: 'epic', name: 'Epic Payload', rarity: 'epic',
    colour: 'P', accent: 'Y', scanTime: 1.5,
    table: [
      { w: 28, kind: 'coins',  min: 130, max: 260 },
      { w: 26, kind: 'power',  pool: ['berserk', 'infinite', 'magnetStorm', 'overcharge'] },
      { w: 22, kind: 'parts',  min: 2, max: 4 },
      { w: 14, kind: 'droneBoost', duration: 18 },
      { w: 10, kind: 'key',    min: 1, max: 1 },
    ],
  },
  {
    id: 'vault', name: 'Vault', rarity: 'vault', needsKey: true,
    colour: 'A', accent: 'E', scanTime: 2.0,
    table: [
      { w: 34, kind: 'coins',  min: 260, max: 520 },
      { w: 28, kind: 'parts',  min: 4, max: 8 },
      { w: 22, kind: 'power',  pool: ['berserk', 'infinite', 'overcharge', 'magnetStorm'] },
      { w: 16, kind: 'droneBoost', duration: 25 },
    ],
  },
];

/* ---- Power-ups ---------------------------------------------------------- */
export const POWERUPS = [
  { id: 'rapid',      name: 'Rapid Fire',      duration: 10, icon: 'rapid',  colour: 'Y',
    blurb: 'Fire rate way up.',            mods: { fireRate: 2.0 } },
  { id: 'shield',     name: 'Shield',          duration: 9,  icon: 'shield', colour: 'C',
    blurb: 'Damage bounces off.',          mods: { invuln: true } },
  { id: 'magnet',     name: 'Coin Magnet',     duration: 12, icon: 'magnet', colour: 'A',
    blurb: 'Coins come to you.',           mods: { magnet: 82 } },
  { id: 'overcharge', name: 'Overcharge',      duration: 10, icon: 'bolt',   colour: 'P',
    blurb: 'Damage and fire rate up.',     mods: { damage: 1.7, fireRate: 1.3 } },
  { id: 'missile',    name: 'Missile Strike',  duration: 12, icon: 'missile',colour: 'R',
    blurb: 'Gadget becomes a salvo, no cooldown.', mods: { freeGadget: 'missile' } },
  { id: 'berserk',    name: 'Berserk',         duration: 9,  icon: 'skull',  colour: 'R',
    blurb: 'Big damage, no defence bonus.', mods: { damage: 2.4 } },
  { id: 'magnetStorm',name: 'Magnet Storm',    duration: 10, icon: 'magnet', colour: 'G',
    blurb: 'Everything collectable comes to you.', mods: { magnet: 176 } },
  { id: 'infinite',   name: 'Infinite Energy', duration: 9,  icon: 'inf',    colour: 'C',
    blurb: 'Weapons cost nothing.',        mods: { freeEnergy: true } },
];

/* ---- Missions ----------------------------------------------------------- */
/* `stat` names a counter tracked in progression.js. Missions cycle: when one
   completes, the next in its family is offered with a bigger target. */
export const MISSIONS = [
  { id: 'kills',    name: 'Destroy {t} drones',       stat: 'kills',      targets: [50, 120, 250, 500],   reward: { coins: 220, parts: 1 } },
  { id: 'distance', name: 'Travel {t} metres',        stat: 'distance',   targets: [5000, 12000, 25000],  reward: { coins: 260, parts: 1 } },
  { id: 'coins',    name: 'Collect {t} coins',        stat: 'coinsEarned',targets: [1000, 2500, 6000],    reward: { coins: 300, parts: 2 } },
  { id: 'crates',   name: 'Open {t} loot crates',     stat: 'crates',     targets: [5, 15, 40],           reward: { coins: 240, parts: 2 } },
  { id: 'elites',   name: 'Destroy {t} elite enemies',stat: 'elites',     targets: [10, 25, 60],          reward: { coins: 340, parts: 3 } },
  { id: 'vaults',   name: 'Open {t} vaults',          stat: 'vaults',     targets: [1, 5, 12],            reward: { coins: 380, parts: 3 } },
  { id: 'rescues',  name: 'Survive {t} FiDo-5 rescues', stat: 'rescues',  targets: [3, 10, 25],           reward: { coins: 200, parts: 1 } },
];

/* ---- Daily rewards ------------------------------------------------------ */
export const DAILY = [
  { day: 1, kind: 'coins', amount: 150,  label: '150 coins' },
  { day: 2, kind: 'power', id: 'overcharge', label: 'Overcharge, next run' },
  { day: 3, kind: 'coins', amount: 350,  label: '350 coins' },
  { day: 4, kind: 'parts', amount: 3,    label: '3 upgrade parts' },
  { day: 5, kind: 'coins', amount: 700,  label: '700 coins' },
  { day: 6, kind: 'parts', amount: 5,    label: '5 upgrade parts' },
  { day: 7, kind: 'bundle', coins: 1200, parts: 8, label: '1,200 coins + 8 parts' },
];

/* ---- FiDo-5 dialogue ---------------------------------------------------- */
/* Kept short, rate-limited in fido5.js so it never becomes noise. */
export const DRONE_LINES = {
  runStart:   ['Systems green. Let’s work.', 'Neo City. Again.', 'I’m right behind you.'],
  threat:     ['Threat detected.', 'Contacts ahead.', 'Company.'],
  target:     ['Target acquired.', 'Locked.', 'Mine.'],
  playerKill: ['Nice shot.', 'Clean.', 'Efficient.'],
  droneKill:  ['You’re welcome.', 'Got it.', 'Handled.'],
  elite:      ['Heavy signature. Careful.', 'That one’s reinforced.', 'Priority target.'],
  crate:      ['Crate detected.', 'Something worth taking.', 'Scanning.'],
  crateOpen:  ['Open. Help yourself.', 'Cracked it.', 'All yours.'],
  vault:      ['Vault. You have a key.', 'That needs a key. You have one.'],
  hurt:       ['That was close.', 'Watch the health.', 'Take less damage. Please.'],
  rescue:     ['I recommend avoiding the explosion.', 'Not today.', 'Hold still.', 'I’ve got you.'],
  rescueDown: ['Shield spent. Recharging.', 'Can’t do that again yet.'],
  low:        ['You’re in the red.', 'Health critical.'],
  bomb:       ['Move.', 'Blast incoming.'],
  turret:     ['Sniper. Change level.', 'Turret sighted on you.'],
  death:      ['…Run’s over. Reset.', 'We’ll do better.'],
  streak:     ['Streak’s building.', 'Keep it going.'],
};

/* ---- Onboarding -------------------------------------------------------- */
/* Contextual prompts, each shown once ever. Order is the teaching order. */
export const ONBOARDING = [
  { id: 'jump',   trigger: 'firstObstacle', text: 'Jump',                sub: 'Swipe up  /  Space' },
  { id: 'slide',  trigger: 'firstLow',      text: 'Slide under',         sub: 'Swipe down  /  S' },
  { id: 'shoot',  trigger: 'firstEnemy',    text: 'Fire',                sub: 'Tap  /  J' },
  { id: 'tier',   trigger: 'firstTier',     text: 'Jump to climb a level', sub: 'Higher up pays better' },
  { id: 'crate',  trigger: 'firstCrate',    text: 'FiDo-5 will open it',  sub: 'Get close and stay alive' },
  { id: 'gadget', trigger: 'firstGadget',   text: 'Gadget ready',         sub: 'Tap the icon  /  K' },
];

/* ---- Score -------------------------------------------------------------- */
export const SCORE = {
  perMetre: 1,
  perCoin: 2,
  perKill: 1,             // multiplied by the enemy's own score value
  crate: { common: 60, rare: 160, epic: 340, vault: 600 },
  streakStep: 5,          // kills/pickups per streak tier
  streakMax: 8,
  streakMult: 0.25,       // +25% score per streak tier
  riskBonus: 40,          // taking the top tier through a hostile chunk
};
