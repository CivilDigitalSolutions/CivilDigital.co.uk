# FiDo-5 — ElevenLabs direction sheet

One delivery description per line, written for generating the voiceover.
The line text is the source of truth and lives in `fido5/js/data.js`; if a
line is reworded there, reword it here too.

## The character

FiDo-5 is a compact military combat drone that follows the player through every
run. It is loyal, efficient, protective and very dry. It is a machine, not a
narrator: it never panics, never raises its voice except once, and never plays
a joke for laughs. Almost every line is a status readout that happens to be
funny because of how flat it is.

The single most important note across all 45 lines: **underplay everything.**
If a take sounds like a performance, it is wrong.

## Voice prompt

Paste this into the voice description field. It covers the six things a voice
description needs to pin down: what it is, timbre, accent, character, pacing
and recording quality.

> The synthetic voice of a small military combat drone. Male-neutral and
> slightly androgynous, mid-to-low register, neutral British accent with clean
> vowels and no regional colour. Calm, clipped and precise at all times,
> speaking in short efficient bursts like radio traffic rather than
> conversation. Dry and deadpan, with a flat undercurrent of sarcasm that is
> never played for laughs. No warmth, no enthusiasm, no rising urgency and no
> narrator polish. A faint metallic resonance and light radio compression, as
> though transmitted over a comms channel. Close, dry recording with no room
> reverb.

### Preview text

What the voice says while you audition candidates matters as much as the
description. Use real lines rather than the default sample, and include a
one-word line: most of FiDo-5's dialogue is two to four words, and a voice that
sounds right on a full sentence often falls apart on a single word.

> Threat detected. Target acquired. Nice shot. I recommend avoiding the
> explosion. Hold still. Shield spent, recharging. Company. Take less damage.
> Please.

### Judging the candidates

Generate several and reject on these, in this order.

- Anything that sounds like an audiobook narrator or a film trailer. This is
  the most common failure and the hardest to fix later.
- Anything that puts feeling into "I recommend avoiding the explosion." That
  line only works if the delivery is identical to a status readout.
- One-word lines that trail off or sound cut short. "Company." should land
  flat and finished, not clipped.
- Any candidate whose calm changes between "Move." and "Nice shot." The whole
  character is that it does not.

Save the voice you settle on and use it for all 45 lines. Regenerating the
voice partway through will leave the set sounding like two different drones.

### If the first attempt is wrong

Append one of these to the description rather than rewriting it.

| Problem | Add |
|---|---|
| Too human | "Heavily processed, with a subtle vocoder edge and a trace of digital artefacting." |
| Too robotic to act the dry lines | "Under the flatness, a trace of world-weariness, like a machine that has done this many times before." |
| Too light or too young | "Low and chest-heavy, with a slow deliberate cadence and weight on the consonants." |
| Too soft for the combat lines | "Hard consonants and a tight, forward delivery, cutting through noise without ever being loud." |

## Settings

A starting point rather than a prescription; parameter names differ between
models.

| Setting | Start at | Why |
|---|---|---|
| Stability | High | 45 short clips have to sound like one machine. Variation between takes is the main risk. |
| Similarity | High | Keeps the timbre locked to the designed voice. |
| Style / exaggeration | Low | Expression is exactly what this character does not have. |
| Speed | Slightly fast | Supports the clipped delivery. Back off for the rescue and run-over lines. |

If your model supports bracketed audio tags, a single tag matching the
direction works well as a prefix — for example a deadpan tag on the sarcastic
lines, or a sharp one on `bomb-1`. Support varies by model, so treat tags as
optional and delete them if the output starts acting them out.

## Workflow

1. Generate each line, using the direction below to steer the take.
2. Export as MP3 named exactly as the **File** column, into `fido5/audio/vo/`.
3. Add the ids you have finished to `manifest.json`, without the extension:
   `["threat-1", "threat-2"]`.
4. Anything not listed stays silent, so you can ship a partial set and grow it.

Mono, 44.1kHz, normalised to about -3dB, trimmed tight at both ends, and under
two seconds per line — they fire during combat and must not overlap.

## Lines

### Start of a run

_Start of a run._

| File | Line | Direction |
|---|---|---|
| `run-start-1.mp3` | Systems green. Let’s work. | A boot report followed by a flat invitation. The first half is a pure status readout, the second half is dry and almost bored. No enthusiasm anywhere. |
| `run-start-2.mp3` | Neo City. Again. | Weary recognition of a repeat assignment. Slight downward inflection on "Again", like a sigh it has no lungs to produce. |
| `run-start-3.mp3` | I’m right behind you. | Quiet reassurance, understated. Steady and low. A statement of fact rather than comfort. |

### Threat spotted

_Enemies spotted._

| File | Line | Direction |
|---|---|---|
| `threat-1.mp3` | Threat detected. | A clean sensor readout. Completely neutral, no alarm, even stress on both words. |
| `threat-2.mp3` | Contacts ahead. | A clipped tactical callout, slightly faster than normal. Efficient, no emphasis on either word. |
| `threat-3.mp3` | Company. | One dry word, almost amused. Short and flat with a falling tone. |

### Target lock

_Locking on to a target._

| File | Line | Direction |
|---|---|---|
| `target-1.mp3` | Target acquired. | Crisp lock-on confirmation. Mechanical precision, no satisfaction in it. |
| `target-2.mp3` | Locked. | One hard clipped syllable. Fast and final, like a switch closing. |
| `target-3.mp3` | Mine. | Possessive and dry, with a shade of dark humour. Very short, a slight downward snap. |

### You killed something

_The player killed something._

| File | Line | Direction |
|---|---|---|
| `player-kill-1.mp3` | Nice shot. | Understated approval. The compliment is genuine but delivered completely flat. |
| `player-kill-2.mp3` | Clean. | A single word of appraisal. Brief, approving, unemotional. |
| `player-kill-3.mp3` | Efficient. | The highest praise this machine offers. Measured and almost clinical. |

### FiDo-5 killed something

_FiDo-5 killed something._

| File | Line | Direction |
|---|---|---|
| `drone-kill-1.mp3` | You’re welcome. | Dry and unprompted. A touch smug, never theatrical. Flat and slightly slower than usual. |
| `drone-kill-2.mp3` | Got it. | Quick casual confirmation, almost thrown away. |
| `drone-kill-3.mp3` | Handled. | Clipped and final. One beat, done. |

### Elite enemy

_An elite enemy appears._

| File | Line | Direction |
|---|---|---|
| `elite-1.mp3` | Heavy signature. Careful. | Two beats: a sensor reading, then a warning. The warning is firmer but still entirely calm. |
| `elite-2.mp3` | That one’s reinforced. | A matter-of-fact assessment. Slight emphasis on "reinforced", no concern behind it. |
| `elite-3.mp3` | Priority target. | A hard tactical designation. Firm, clipped, no warmth. |

### Crate detected

_A loot crate is detected._

| File | Line | Direction |
|---|---|---|
| `crate-1.mp3` | Crate detected. | A neutral scanner report. Give it exactly the same energy as "Threat detected" — this machine does not get excited about loot. |
| `crate-2.mp3` | Something worth taking. | A shade of interest creeping in. Slower, faintly conspiratorial, but still flat. |
| `crate-3.mp3` | Scanning. | An ongoing-process readout. Level, very slightly drawn out. |

### Crate opened

_A crate has been opened._

| File | Line | Direction |
|---|---|---|
| `crate-open-1.mp3` | Open. Help yourself. | A task-complete report, then a dry offer. Leave a clear beat between the two. |
| `crate-open-2.mp3` | Cracked it. | Small satisfaction, immediately suppressed. Brisk. |
| `crate-open-3.mp3` | All yours. | An offhand handover. Light, fast, unbothered. |

### Vault

_A vault, and the player holds a key._

| File | Line | Direction |
|---|---|---|
| `vault-1.mp3` | Vault. You have a key. | Identification, then a prompt. Slower and more deliberate than the other crate lines — this one matters. |
| `vault-2.mp3` | That needs a key. You have one. | Patient and faintly pointed, as if repeating itself. Slight emphasis on "have". |

### You took damage

_The player took damage._

| File | Line | Direction |
|---|---|---|
| `hurt-1.mp3` | That was close. | An observation, not concern. Level and dry. |
| `hurt-2.mp3` | Watch the health. | An instruction with a faint edge of impatience. Firm and clipped. |
| `hurt-3.mp3` | Take less damage. Please. | Deadpan sarcasm, the driest line in the set. Clear pause before "Please", and the "Please" is flat and tacked on, never pleading. |

### The rescue

_Diving in to save the player._

| File | Line | Direction |
|---|---|---|
| `rescue-1.mp3` | I recommend avoiding the explosion. | The signature line. Dry understatement delivered mid-crisis at completely normal pace. The joke is that nothing in the voice changes while it is throwing itself in front of you. |
| `rescue-2.mp3` | Not today. | A firm refusal. Low, hard and decisive, with real weight behind it. |
| `rescue-3.mp3` | Hold still. | A sharp instruction. Quick and commanding — the closest this voice ever gets to urgent. |
| `rescue-4.mp3` | I’ve got you. | Steady and low. Protective without being warm, and absolutely certain. |

### Rescue on cooldown

_The rescue is on cooldown._

| File | Line | Direction |
|---|---|---|
| `rescue-down-1.mp3` | Shield spent. Recharging. | A flat systems report in two clean clauses. No regret. |
| `rescue-down-2.mp3` | Can’t do that again yet. | A slight apology buried under the flatness. Even pace, no self-pity. |

### Health critical

_Player health is critical._

| File | Line | Direction |
|---|---|---|
| `low-1.mp3` | You’re in the red. | A blunt statement of fact. Level, a touch firmer than usual. |
| `low-2.mp3` | Health critical. | A hard alarm-panel readout. Clipped, with both words stressed. |

### Bomb armed

_A bomb has been armed nearby._

| File | Line | Direction |
|---|---|---|
| `bomb-1.mp3` | Move. | A single sharp command. Noticeably louder and more immediate than every other line, with no ramp-up. |
| `bomb-2.mp3` | Blast incoming. | A fast warning. Urgent by this machine’s standards, which still means controlled. |

### Turret locked on

_A sniper turret has locked on._

| File | Line | Direction |
|---|---|---|
| `turret-1.mp3` | Sniper. Change level. | A threat call followed by an instruction. The second half is a firm directive, not a suggestion. |
| `turret-2.mp3` | Turret sighted on you. | Precise and faintly ominous. Steady and deliberate, letting the sentence land. |

### Run over

_The run has ended._

| File | Line | Direction |
|---|---|---|
| `death-1.mp3` | …Run’s over. Reset. | A beat of silence, then a flat verdict. The pause carries the disappointment; the words themselves carry none. |
| `death-2.mp3` | We’ll do better. | Quiet, and almost gentle by this voice’s standards. Low and slow. The only line in the set with anything like warmth. |

### Streak climbing

_The score streak is climbing._

| File | Line | Direction |
|---|---|---|
| `streak-1.mp3` | Streak’s building. | A neutral progress report with a hint of approval underneath it. |
| `streak-2.mp3` | Keep it going. | Brief encouragement, still flat. A light forward push. |

45 lines in total.
