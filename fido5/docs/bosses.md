# FiDo-5 — Sector gates and bosses

Reference for the boss system: why it exists, the rules every boss obeys, the
planned roster, and the technical notes for building the rest of it.

Status: **all six are built.** The roster is complete and loops, hardened on
each pass.

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
| Lives | 3, refilled at every gate | `SECTORS.lives` |
| Shield on a clear | 6 s | `SECTORS.clearShield` |

A gate runs through three states:

1. **approach** — the timer has expired. The boss is announced, FiDo-5 calls
   the threat, and the player keeps running. For a walled fight the world is
   asked for an arena and the approach ends when the player crosses its mouth;
   for a moving fight there is no mouth, so it ends on a short timer instead.
2. **locked** — the player has crossed into the arena. The camera freezes, the
   walls come in, auto-run is suspended and the boss spawns.
3. **outro** — the boss's death animation has finished and the defeat card
   is up (below). The runner is held still and takes no gameplay input, the
   same way the intro holds it.
4. **clear** — the camera is released, auto-run is restored to the player's own
   setting, score and coins are paid, the player is resupplied, the gate
   counter advances and the run pauses on the sector intermission (below) —
   all on the same frame. There is deliberately no gap: the runner moving
   again on a screen the player has stopped playing is a window that eats
   input.

A moving fight (`arena: 'moving'`) skips the arena entirely: no walls, no
camera freeze, the encounter director left running and auto-run untouched. The
boss is handed the viewport as its arena instead and keeps station on it, so
every clamp that keeps a walled boss inside its walls keeps this one on screen.
Lives, the lives HUD and the intro card work identically — they key off
`Game.inFight`, which is true for either kind.

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

**A boss in a sealed arena holds the far side, and is solid.** Both halves
matter, and the fight silently broke without them. A boss that kept to whichever
side it happened to be on would settle behind a player who had run to the far
wall, where a forward-facing player could never touch it again — and there was
no room for it to come back round. It now holds station on the far side of the
player, and while it is ahead of them it is solid: they cannot run past it into
the few pixels behind. An attack that crosses the player, like the Warden's
charge, still crosses; the wall only exists while the boss is in front.

**Lives are a boss mechanic and nothing else.** A death inside an arena costs
one of three lives and restarts the fight with the boss at full health. A
death anywhere else on the track ends the run exactly as it always has. Lives
never carry over between gates — they are the budget for *this* fight, so a
clear refills them — and the count is shown in the HUD only while a fight is
running.

**Auto-run is off for a walled fight, and on for a running one.** A fixed arena
and a player who cannot stop pressing forward is a player pinned against the far
wall, so a gate with walls suspends it and restores the player's own setting the
moment it clears. The two moving fights leave it alone: taking the run away from
a running fight is the wrong shape.

**FiDo-5 keeps talking.** The drone announces the threat on approach and calls
the clear. Its rescue is still available, which means the real cost of a bad
fight is the rescue cooldown, not just health.

### The defeat card

The other half of the intro flourish, and built from the same parts — dimmed
world, letterbox bars, a slammed word, a name plate, one clock cued once
against a timeline in `BOSS_OUTRO`. Mint instead of red, embers drifting up
instead of streaks tearing sideways, and one word instead of two meeting: the
intro announces something arriving, this reports something finished.

The word alternates gate by gate between **SHUTDOWN** and **FINISHED**. Both
are eight characters, so the card does not change shape between gates.

Two things are worth knowing if you touch it:

- **It is laid out as a stack, not at fixed fractions of the height.** The
  render height is fixed at 180 but the width is not, so a word sized from the
  width alone is far taller on a wide short window than on a narrow one — on a
  landscape phone it grew until it ran into the name plate. The plate is sized
  first, the word takes what is left between the bars, and the pair is centred.
- **It is skippable, but not by the trigger that killed the boss.** A held
  trigger or a press still sitting in the input buffer would mean the player
  who fights to the last frame is the one who never sees it, so a skip needs a
  fresh press after `BOSS_OUTRO.skip`.

The player is made invulnerable for its duration: a shot the boss fired before
it died can still be in the air, and dying to it behind the card that says you
won would be a bad joke.

### A clear is a checkpoint

Everything the fight spent comes back on the kill: health, energy, the shield
pool, the gadget cooldown, FiDo-5's rescue and the lives. `Game.resupply()`
does it in one place and returns *what it actually restored*, so the
intermission can list the real changes rather than assert a fixed set — a
player who cleared the gate untouched is not told they were healed.

`clearShield` then covers the restart. Resuming the runner is the most
dangerous second in the game — full speed, a fresh chunk, and a player still
reading the screen — so six seconds of shielding follow the player out of the
gate. It is re-armed when they press Continue rather than left ticking through
however long they spent in the upgrade tree, and it is its own timer rather
than the gadget's, so a clear never reads as the gadget being spent. Like the
shield gadget it stops damage, not a fall.

### The sector intermission

With the run paused behind it, the intermission is the one place mid-run where
the loadout and the upgrade tree can be changed. Three things make that work:

- **Coins are banked.** Normally a run's coins reach the save only at the end.
  `Game.bank()` moves what has been earned so far across and records it in
  `run.banked`, so `commitRun` credits only the remainder and nothing is paid
  twice. (Boss coins used to be credited at the clear *and* again at the end;
  banking is what fixed it.)
- **Changes reach the live run.** `Game.applyStats()` rebuilds the player, the
  drone and the run's cached stat blocks from the save. Health and energy are
  refilled rather than carried, because the pools may have just changed size
  and the player is at a checkpoint anyway.
- **The shared panels behave.** The loadout screen's "Start run" footer is
  hidden while a run is paused behind it, and the back stack is empty when the
  intermission opens, so Back returns here and never walks out to the main
  menu with a run still on hold.

The hand-off is deliberately not raised from inside a fixed timestep: pausing
mid-step would leave the remaining steps advancing a run the player can no
longer see. `_clearFight()` sets a flag, the step loop breaks on it, and
`tick()` acts once the loop has finished. The accumulator is dropped at the
same time, so a slow frame cannot bank simulation time and spend it the
instant the player continues. The one case it skips is a death on the same
frame — a pit still swallows a shielded player, and the results screen is what
they are owed.

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

### 3. The Convoy — *built*
**Moving fight. One on one.** The scroll never stops. A gunship keeps station
ahead of the player while the track keeps coming — gaps, obstacles and the
encounter director's usual traffic. Auto-run stays *on*; it is a running fight,
and taking the run away would be the wrong shape.

It cruises above everything the player can shoot at, so hitting it up there is
not a matter of armour — it is simply out of the firing line. It has to come
down, and coming down is the only thing it does that can be punished.

- **Strafing run** — drops to the player's height, commits to a direction and
  crosses the screen at it. The attack that hurts most is the attack that
  leaves it where you can reach it.
- **Salvo** — a five-shot fan from altitude. Five, not four: an even fan has no
  centre line, so a player standing still is never actually shot at.
- **Mines** — three dropped onto the ground ahead, each with a drop line down to
  where it will land. The route is the second opponent and this is what makes
  that true.

Two things came out of playtesting it. It recovers *low* from every attack, not
only from a strafing run: holding altitude through two attacks in three left
five- and seven-second stretches where the player could not touch it at all,
which is dead air in a fight they are also running a level through. And its
attacks **cycle in order** rather than rolling, so a strafing run comes round
every other time without fail — left to chance, the same fight ran anywhere
from twenty-four to forty-five seconds depending on the dice.

Teaches: that a boss does not have to mean a stop, and that the track itself is
the second opponent.

### 4. The Choir — *built*
**Static arena. One against many.** A conductor mast standing from the street
to the rooftop line, with three turret pods mounted one per tier and trailing
back towards the player. The pods do not come back.

The mast is worth shooting from the first second but heavily plated. Every pod
silenced strips a third of that plating away — measured, 100 damage lands as 18
with all three singing, then 45, then 73, then 100. So the player chooses:
clear the pods and soften the mast, or race the mast down while all three are
still firing. Silencing them is not free, either — a shorter rotation is a
faster one.

- **Chorus** — every living pod fires down its own tier in turn, staggered, so
  the rotation has a gap to run through.
- **Sweep** — a seven-shot arc from the resonator at the mast's midpoint.

Teaches: tier movement under fire, and that a defence can be taken apart a
piece at a time rather than switched off.

### 5. The Ripper — *built*
**Moving fight. Pursuit.** A wall-crawler that keeps station 120px *behind* the
player and hugs the street. It is not armoured so much as unreachable: a player
who can only shoot the way they are facing — which under auto-run is always
forwards — cannot answer a thing behind them at all.

Its lunge overshoots on purpose. That is not a flaw in the attack, it is the
attack: it crosses the player, ends up in front of them, and stays there
through its recovery. That window is the entire fight, and it is the only
sustained thing the player is given.

- **Lunge** — commits forward, damages on the way through, ends ahead.
- **Spit** — a three-shot fan up the street.
- **Shockwave** — two ground waves, jumped rather than dodged.

Its attacks cycle, alternating lunges with the other two, so the window arrives
on a rhythm rather than on the dice.

Teaches: forward pressure — the inverse of every other fight, where the player
chooses the pace.

### 6. Null Prime — *built*
**Static arena. Two phases.** A mech that fights the Warden's fight — stomp,
flak, charge, and a beam borrowed from Hexcell — until half health. Then it
throws the plating off and continues without it.

Everything changes at once, because that is the point of a second phase and it
has to be loud: the armour goes entirely (full damage from then on), it speeds
up by 40%, its repertoire changes to the faster half of its attacks, and four
drones come off its shoulders. The drones harry rather than shield — no tether
is drawn to them and they are not counted on the bar, because both of those
would promise a protection that is not there.

The finale of the loop, and a deliberate recap: phase one is the Warden's
rhythm, phase two is Hexcell's priority problem with no shield to hide behind.

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
| Gate timings, lives, clear shield, arena widths | `SECTORS` in `data.js` |
| Per-boss health, armour, telegraph, recovery, attacks | `BOSSES` in `data.js` |
| Per-attack damage, speed, spread, counts | `BOSS_ATTACKS` in `data.js` |
| Per-boss parts (relays, pods, drones) | `parts` block in the definition |
| Second phases | `phase2` block in the definition |
| Behaviour and the phase machine | `boss.js` |
| Defeat card timeline and words | `BOSS_OUTRO`, `BOSS_OUTRO_WORDS` in `data.js` |
| Arena template | `ARENA` in `chunks.js` |
| Gate states and rewards | `Game._sector`, `_startFight`, `_clearFight`, `_bossDeath` |
| Resupply, banking, mid-run stats | `Game.resupply`, `bank`, `applyStats`, `resumeFromSector` |
| Sector intermission | `#screen-sector` in `play.html`, `UI.openSector` / `buildSector`, `.sec-*` in `css/game.css` |
| Drawing | `Renderer._boss`, `_bossArena`, `_bossBar` |
| Intro and defeat cards | `Renderer._bossIntro`, `_bossOutro`, `_word`, `_slam` |
| Lives HUD | `play.html`, `.hud-lives` in `css/game.css`, `UI.updateHud` |

## 7. Adding the next boss

1. Add an entry to `BOSSES` with `core: {x, y}` pointing at the sprite's weak
   point, and its attacks to `BOSS_ATTACKS`.
2. Draw the sprite in `sprites.js` and register it under `S.boss` / `S.bossFlip`
   with the same id. `rows()` validates the geometry at load.
3. Add the attack cases to `Boss._strike` and any per-attack update.
4. Nothing else. The gate machinery, lives, arena, camera, HUD and rewards are
   boss-agnostic and pick the new entry up from the roster order.

**Parts.** A `parts` block gives a boss pieces that are killed separately. Three
flags decide what they mean, and all three are in use:

| | `layout` | `gates` | `softens` | `respawn` |
|---|---|---|---|---|
| Hexcell's relays | orbit | **true** — a shield | – | 10 s |
| The Choir's pods | tiers | false | **true** — plating | 0, gone for good |
| Null Prime's drones | orbit | false | – | 0 |

`gates` makes the boss untouchable until every part is down. `softens` makes
each part lost strip a share of the armour. Neither, and the parts are just
company. Bullets test parts before the body; each carries its own health strip
and a respawn ring when it has a timer; the shield tethers and the bar's part
count appear only where `gates` or `softens` says they mean something.

The bar's armoured/exposed state is driven off `Boss.armourNow` — the multiplier
a hit would actually get — rather than off the phase, so a boss whose plating has
been stripped a piece at a time cannot claim to be protected while taking full
damage.

**Second phases.** A `phase2` block fires once, at a health fraction, and
overrides the armour, speed, wind-up and attack list, and can bring parts with
it. One `_shed` call does the lot; the body, the bar and the arena are untouched.

**Flight.** `float: true` hovers and tracks the player's height. Add
`arena: 'moving'` and the boss is carried with the camera every frame, so its
`walkSpeed` is the relative trim it keeps station by rather than an absolute
speed a sprinting player leaves behind. `station` is where it sits relative to
the player — positive ahead (the Convoy), negative behind (the Ripper), and a
boss that hunts from behind spawns behind. `hugGround: true` keeps it on the
street instead of cruising above the firing line.

`cycleAttacks: true` steps the attack list in order instead of rolling it. Use
it wherever one particular attack carries the fight's damage window — without it
the same fight ran anywhere from twenty-four to forty-five seconds.

Measured fight lengths, holding the trigger with the starting weapon:
seventeen to twenty-eight seconds across the roster. Hexcell is the outlier and
stays one deliberately — it cannot be beaten by holding the trigger at all,
because the relays have to be picked off on purpose.
