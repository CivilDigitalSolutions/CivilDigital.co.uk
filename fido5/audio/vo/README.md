# FiDo-5 — voice lines

Every line FiDo-5 speaks, with the filename each recording must use.

## How to add recordings

1. Record each line and save it as `<id>.mp3` in this folder.
2. Add the ids you have recorded to `manifest.json`, e.g. `["threat-1", "threat-2"]`.
3. Anything not listed stays silent, so a partial set is fine and can grow over time.

Mono, 44.1kHz, normalised to about -3dB, trimmed tight at both ends. Keep each
line under two seconds: they play during combat and must not overlap.

## Direction

FiDo-5 is a compact military drone: loyal, efficient, protective, and dry.
Clipped delivery, no warmth in the performance, a little radio compression.
It is a machine, not a narrator, and it never sounds worried. The sarcasm is
flat rather than played for laughs.

## Lines

| File | Line | When it plays |
|---|---|---|
| `run-start-1.mp3` | Systems green. Let’s work. | Start of a run |
| `run-start-2.mp3` | Neo City. Again. | Start of a run |
| `run-start-3.mp3` | I’m right behind you. | Start of a run |
| `threat-1.mp3` | Threat detected. | Enemies spotted |
| `threat-2.mp3` | Contacts ahead. | Enemies spotted |
| `threat-3.mp3` | Company. | Enemies spotted |
| `target-1.mp3` | Target acquired. | Locking on to a target |
| `target-2.mp3` | Locked. | Locking on to a target |
| `target-3.mp3` | Mine. | Locking on to a target |
| `player-kill-1.mp3` | Nice shot. | The player killed something |
| `player-kill-2.mp3` | Clean. | The player killed something |
| `player-kill-3.mp3` | Efficient. | The player killed something |
| `drone-kill-1.mp3` | You’re welcome. | FiDo-5 killed something |
| `drone-kill-2.mp3` | Got it. | FiDo-5 killed something |
| `drone-kill-3.mp3` | Handled. | FiDo-5 killed something |
| `elite-1.mp3` | Heavy signature. Careful. | An elite enemy appears |
| `elite-2.mp3` | That one’s reinforced. | An elite enemy appears |
| `elite-3.mp3` | Priority target. | An elite enemy appears |
| `crate-1.mp3` | Crate detected. | A loot crate is detected |
| `crate-2.mp3` | Something worth taking. | A loot crate is detected |
| `crate-3.mp3` | Scanning. | A loot crate is detected |
| `crate-open-1.mp3` | Open. Help yourself. | A crate has been opened |
| `crate-open-2.mp3` | Cracked it. | A crate has been opened |
| `crate-open-3.mp3` | All yours. | A crate has been opened |
| `vault-1.mp3` | Vault. You have a key. | A vault, and the player holds a key |
| `vault-2.mp3` | That needs a key. You have one. | A vault, and the player holds a key |
| `hurt-1.mp3` | That was close. | The player took damage |
| `hurt-2.mp3` | Watch the health. | The player took damage |
| `hurt-3.mp3` | Take less damage. Please. | The player took damage |
| `rescue-1.mp3` | I recommend avoiding the explosion. | Diving in to save the player |
| `rescue-2.mp3` | Not today. | Diving in to save the player |
| `rescue-3.mp3` | Hold still. | Diving in to save the player |
| `rescue-4.mp3` | I’ve got you. | Diving in to save the player |
| `rescue-down-1.mp3` | Shield spent. Recharging. | The rescue is on cooldown |
| `rescue-down-2.mp3` | Can’t do that again yet. | The rescue is on cooldown |
| `low-1.mp3` | You’re in the red. | Player health is critical |
| `low-2.mp3` | Health critical. | Player health is critical |
| `bomb-1.mp3` | Move. | A bomb has been armed nearby |
| `bomb-2.mp3` | Blast incoming. | A bomb has been armed nearby |
| `turret-1.mp3` | Sniper. Change level. | A sniper turret has locked on |
| `turret-2.mp3` | Turret sighted on you. | A sniper turret has locked on |
| `death-1.mp3` | …Run’s over. Reset. | The run has ended |
| `death-2.mp3` | We’ll do better. | The run has ended |
| `streak-1.mp3` | Streak’s building. | The score streak is climbing |
| `streak-2.mp3` | Keep it going. | The score streak is climbing |

45 lines in total.
