# FiDo-5 — Sector gates and bosses

Reference for the boss system: why it exists, the rules every boss obeys, the
planned roster, and the technical notes for building the rest of it.

Status: **the Warden and Hexcell are built.** Bosses 3–6 are designed here and
not yet implemented. Until they are, the roster loops on the two that exist,
hardened on each pass.

---

## 1. The problem

The run scrolled forward indefinitely with no end other than repetition. The
difficulty ramp rose, the chunk pool reshuffled, and nothing ever *concluded*.
A player had no answer to "how far did you get" beyond a number, and no moment
that felt like an achievement rather than an accumulation.

Sector gates give the run a shape. Every gate is a full stop: the world seals,
the scroll ends, and the run continues only once the thing in front of you is
dead.

## 2. Sector structure

Gates are **timed, not spaced by distance**. Run speed nearly doubles over a
long run, so a distance-based gate would arrive sooner and sooner in real time
and squeeze the sectors together exactly when the player is least able to cope.

| | Value | Where |
|---|---|---|
| First gate | 75 s into the run | `SECTORS.firstGateSeconds` |
| Every gate after | 95 s | `SECTORS.gateSeconds` |
| Lives | 3 | `SECTORS.lives` |
| Healed on a clear | 35 % of max | `SECTORS.clearHeal` |

A gate runs through three states:

1. **approach** — the timer has expired. The world is asked for an arena, the
   boss is announced, FiDo-5 calls the threat, and the player keeps running
   towards it. Nothing is locked yet.
2. **locked** — the player has crossed into the arena. The camera freezes, the
   walls come in, auto-run is suspended and the boss spawns.
3. **clear** — the boss is dead. The camera is released, auto-run is restored
   to the player's own setting, score and coins are paid, health is topped up
   and the gate counter advances.

Because the roster loops, `pass` (how many times the roster has been
exhausted) raises boss health by 55 %, speed by 15 % and damage by 20 % each
time round. The tail of a long run keeps escalating instead of flattening out
the way the difficulty ramp eventually does.

## 3. Rules every boss obeys

These are not per-boss tuning; they are what makes a boss fight fair enough to
be learnable.

**Telegraph, strike, recover.** Every attack winds up visibly before it lands
and leaves the boss exposed afterwards. The whole first minute of the game
teaches the player to watch for a telegraph — a boss that kills without one is
a bug, not a difficulty setting.

**Armour is the clock.** A boss takes reduced damage (the Warden: 25 %) except
during its recovery window, when it takes full damage. This turns the fight
from a damage race into a rhythm: read the telegraph, stay clear, punish the
recovery. It also means a player who panics and holds the trigger will lose to
a player who waits, which is the lesson worth teaching.

**The arena closes down.** Where it makes sense, the boss removes options over
the course of the fight rather than getting statistically harder. The Warden's
stomp collapses a run of walkway each time it lands. A fight that starts with
four safe places and ends with one has an arc; a fight where the numbers go up
does not.

**Lives are a boss mechanic and nothing else.** A death inside an arena costs
one of three lives and restarts the fight with the boss at full health. A
death anywhere else on the track ends the run exactly as it always has. Lives
never carry over between gates — they are the budget for *this* fight — and
the count is shown in the HUD only while a fight is running.

**Auto-run is off for the duration.** A fixed arena and a player who cannot
stop pressing forward is a player pinned against the far wall. The player's
own auto-run setting is restored the moment the gate clears.

**FiDo-5 keeps talking.** The drone announces the threat on approach and calls
the clear. Its rescue is still available, which means the real cost of a bad
fight is the rescue cooldown, not just health.

## 4. The roster

Six bosses, then the roster loops. Deliberately mixed: three fights that stop
the world, two that happen at speed, and a spread of one-against-one and
one-against-many.

### 1. The Warden — *built*
**Static arena. One on one.** A heavy walker on the street. The reference
implementation of the rhythm: armoured, three telegraphed attacks, exposed
after each one.

- **Stomp** — two shockwaves along the street, jumped rather than dodged, and
  a run of walkway collapses where it lands.
- **Flak** — five arcing shells with spread, which have to be read as arcs
  rather than as a line.
- **Charge** — commits to a direction on the wind-up and does not steer.
  Hitting a wall stuns it, so baiting the charge is rewarded with a longer
  damage window.

Teaches: telegraphs, the armour window, and that height is an answer.

### 2. Hexcell — *built*
**Static arena. One against many.** A hovering control node, **immune while any
of its three relay drones is alive** — not merely armoured, immune. Each relay
comes back ten seconds after its own death, so the three have to go down inside
one respawn window or the shield never drops. A tether runs from the node to
every living relay, and a countdown ring marks each one that is down.

- **Beam** — a line across the whole arena at the node's own height. The answer
  is to not be at that height, which is also how you reach the relays.
- **Volley** — every living relay fires at the player. Kill them and the reply
  is weaker, which is the reward for going after them first.

The node tracks the player's height as it drifts, so it cannot be parked on one
tier and ignored.

Teaches: target priority, and that the biggest thing on screen is not always
the thing to shoot.

### 3. The Convoy — *designed*
**Moving fight. One on one.** The scroll never stops. A gunship keeps pace
above the street while the track keeps coming — gaps, obstacles and all. It
drops low to strafe, and that is the only moment its thrusters are exposed.
Auto-run stays *on* for this one; it is a running fight, and taking the run
away would be the wrong shape.

Teaches: that a boss does not have to mean a stop, and that the track itself is
the second opponent.

### 4. The Choir — *designed*
**Static arena. One against many.** Three turret pods, one on each tier,
firing in a rotating pattern that has a gap in it. Killing one shortens the
rotation for the survivors, so the fight gets faster as it gets smaller and the
player has to choose between a safe kill order and a fast one.

Teaches: tier movement under fire.

### 5. The Ripper — *designed*
**Moving fight. Pursuit.** A wall-crawler chasing from behind through a
gauntlet, forcing forward progress. It is untouchable except during its
lunges, which overshoot and leave it briefly beside the player instead of
behind them.

Teaches: forward pressure — the inverse of every other fight, where the player
chooses the pace.

### 6. Null Prime — *designed*
**Static arena. Two phases.** A mech that fights conventionally until half
health, then sheds its armour into four autonomous drones and continues
without it: faster, fragile, and no longer alone. The finale of the loop, and a
deliberate recap — phase one is the Warden's rhythm, phase two is Hexcell's
priority problem.

---

## 5. Arena technical notes

**The arena is a chunk.** `ARENA` in `chunks.js` is a flat, sealed template
with weight 0 — the random chunk chooser can never pick it. `World.requestArena(cols)`
sets a pending request that `_appendChunk` honours on the next append,
overriding the chooser and stretching the template to the requested width.
Platform spans are scaled by `len / ARENA.len`, so the two walkway ledges stay
proportional at any arena width.

It has no gaps, no obstacles, no coins and no enemies. Everything in the arena
is the boss.

**Width follows the viewport.** `arenaCols()` returns the viewport width in
columns minus padding, clamped to 20–56. The internal canvas width varies with
the window's aspect ratio (240–720 px), so the arena is sized to hold the whole
fight on screen without scrolling at whatever width the player is on.

**The camera freezes, it never reverses.** `run.arena.camX` is chosen as
`max(current camX, arenaStart - padding)`. The rest of the engine assumes camX
only ever grows — chunk recycling, particle culling and the parallax layers all
depend on it — so the frozen value is clamped rather than set.

**The walls are position clamps, not colliders.** The player is clamped to
`startX + 6 … endX - 6` and their velocity zeroed at the boundary. Cheaper than
geometry, and it cannot be clipped through.

**The encounter director stands down.** Between gates the director tops the
enemy field up towards a target; inside an arena it is skipped entirely.

**Collapsing geometry.** The Warden's stomp clears `col.p[1]` over a seven-column
run nearest the boss and un-grounds a player standing on the piece that went.
Columns already collapsed are remembered, so the same ledge is never taken
twice and the fight cannot stall on it.

## 6. Where the tuning lives

| What | Where |
|---|---|
| Gate timings, lives, heal, arena widths | `SECTORS` in `data.js` |
| Per-boss health, armour, telegraph, recovery, attacks | `BOSSES` in `data.js` |
| Per-attack damage, speed, spread, counts | `BOSS_ATTACKS` in `data.js` |
| Behaviour and the phase machine | `boss.js` |
| Arena template | `ARENA` in `chunks.js` |
| Gate states and rewards | `Game._sector`, `_lockArena`, `_clearArena`, `_bossDeath` |
| Drawing | `Renderer._boss`, `_bossArena`, `_bossBar` |
| Lives HUD | `play.html`, `.hud-lives` in `css/game.css`, `UI.updateHud` |

## 7. Adding the next boss

1. Add an entry to `BOSSES` with `core: {x, y}` pointing at the sprite's weak
   point, and its attacks to `BOSS_ATTACKS`.
2. Draw the sprite in `sprites.js` and register it under `S.boss` / `S.bossFlip`
   with the same id. `rows()` validates the geometry at load.
3. Add the attack cases to `Boss._strike` and any per-attack update.
4. Nothing else. The gate machinery, lives, arena, camera, HUD and rewards are
   boss-agnostic and pick the new entry up from the roster order.

**Parts.** A boss with a `parts` block in its definition gets orbiting pieces
that are killed separately, and is *exposed only when all of them are down* —
which is how Hexcell's shield works and how The Choir's pods and Null Prime's
second phase will. Bullets test parts before the body, each part carries its own
health strip and respawn ring, and the health bar's label counts the survivors.
A boss without a `parts` block falls back to the Warden's rule: exposed in the
moment after it attacks. Set `float: true` and the boss hovers and tracks the
player's height instead of walking.

A moving fight (The Convoy, The Ripper) is the one case that needs more: it
skips `requestArena`/`_lockArena` entirely and instead suppresses the gate
timer while the boss is alive, leaving the scroll and the director running.
