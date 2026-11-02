# Neon Swarm: design brief

> Twin-stick neon arena roguelite: blast geometric swarms on a warping grid, draft a new weapon or rule-bending mod after every wave, and beat three bosses.

*Status: shipped · Version: 1.13.0*

Reverse-engineered from the shipped code (`game.js`, `data.js`, `audio.js`, `grid.js`, `input.js`). It describes what the game does today, not what it could do.

## Fun targets
- **Primary:** Sensation. Every kill sprays glowing particles, the spring-mesh background grid ripples and sinks into gravity wells, bombs flash and shake the screen, and a generative synthwave loop and WebAudio SFX (with laser hum) back it up.
- **Secondary:** Expression. Seven ships that play very differently (each has its own weapon for the whole run, an LT ability and a rule), a 3-card draft after every wave, and seven synergy families: every card belongs to one, and owning 2 / 4 / 6 of a family unlocks escalating bonuses, so a focused build snowballs into real power. Cards are only offered when they work with your ship. Supply Drops (bonus rare drafts) replace the shop.
- **Secondary:** Challenge. A swarm that scales with your build power, a score multiplier that resets when you're hit, and a boss every 10 waves (Hexacore, The Serpent, The Eye) across 3 sectors.

See [framework.md](../../docs/game-design/framework.md). Each target maps to a mechanic or feedback above.

## Core loop
- **Moment-to-moment (seconds):** move and aim → dodge the swarm and shoot it down → kills drop geoms (collect them to raise the multiplier and fill the bank) with particles, grid ripples and SFX → score climbs
- **Endless (minutes):** one big scrolling arena (2400x1500, the camera follows the ship) with no waves: the swarm spawns non-stop around the screen and gets tougher with time. Geoms fill an XP bar; each level-up banks an upgrade ("Y UPGRADE" on the HUD) and the player presses Y to open the 3-card draft when it's safe. Every 5th upgrade taken is followed by a Supply Drop (a bonus rare-or-better draft). Every 2 minutes "THREAT RISING" shifts the palette and speeds up enemy bullets. Elites arrive from 40s, more often and in bigger groups as the threat rises
- **Round (minutes, campaign):** clear a wave (10 per sector, wave 10 is the boss) → pick 1 of 3 draft cards → a bonus Supply Drop draft after waves 5 and 10 → tougher wave → boss → next sector or victory/death tally
- **Meta (across sessions):** saved best score, furthest sector/wave, total kills and wins. Everything (all ships, mods and Endless) is open from the start; Endless and keeps its own best score and longest survival time

## The 8 formal elements
| Element | This game |
|---|---|
| Players | 1, against the swarm |
| Objectives | Survive and clear waves, beat each sector's boss, and chase a high score |
| Procedures | Move with the left stick, aim and auto-fire with the right stick, use the ship ability, bomb, pick draft cards, reroll and banish |
| Rules | Touching an enemy or enemy bullet costs 1 HP (shields absorb a hit and push nearby enemies back without killing them; brief invulnerability). Shields cap at 3. Geometry Wars-style multiplier: +1 every 25 geoms, capped at x10 (x20 with Harvest III), it slips one step per second after 4s without a geom, and a hit halves it. One weapon per ship (drafts level it up, there is no weapon switching), 2 passives max, each mod once. Cards that need bullets, a swarm (drones, blades or turrets) or bombs are only offered to ships that have them. Carrier and Reaper have no gun: their ship cards stand in for weapon levels. |
| Resources | HP and shields, bombs (start 2, max 3 base, up to 6), geoms (score multiplier; XP in Endless), reroll and banish tokens (Spare Parts card adds more), weapon levels (1 to 5) |
| Conflict | Nine enemy types unlocking by wave (wanderer, seeker, dodger, splitter, snake, lancer, tank, gravity well, spawner), four elites with health bars (Gunship, Broodmother, Lance, Juggernaut) plus three bosses; enemy HP and speed scale per wave and with build power |
| Boundaries | Both modes: a 2400x1500 arena with a camera that follows the ship (eased look-ahead along movement only; aiming never moves it), and red arrows at the screen edge for nearby off-screen enemies (elites and a wave's last stragglers are always marked). Boss fights lock the camera onto one screen-sized boss arena with red walls until the boss dies |
| Outcome | Run ends on death ("Signal Lost") or after beating The Eye ("Victory"); in Endless the run lasts until you die. Results show score, best, kills, multiplier and build; A retries at once, B goes to the title |

## Controls
| Input | Action |
|---|---|
| Left stick / d-pad / WASD | Move (menus: navigate). Touch: drag on the left half of the screen |
| Right stick / arrow keys | Aim and fire. Mouse: aim, hold the button to fire. Touch: drag on the right half |
| RT (C; Space on a keyboard) | Bomb (gamepad A doesn't bomb, so a slipping thumb can't waste one). Mouse/touch: BOMB button |
| LT / X (Z / Shift) | Ship ability. Mouse/touch: ability button |
| A (Space/Enter, click, tap) | Confirm in menus; launch from title; retry on game over |
| B (Backspace, right-click) | Back in menus; resume from pause; title from game over |
| X (Shift) | Banish the selected draft card (in the draft; also a button) |
| Y (F or R) | Endless: open a banked upgrade draft. Reroll the draft (also a button) |
| Title: up/down + A | Menu (menu.js): Campaign, Endless, How to Play, Settings (Settings is also in the pause menu) |
| Title: left/right, LB/RB, tap ◀ ▶ | Choose ship (shown in its own panel) |
| Start / Esc / P / on-screen ≡ | Pause: Resume, Restart, Settings, Quit to title. Also pauses from the draft. Auto-pauses on the launcher overlay, lost focus or a lost controller |

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Geometry Wars | Twin-stick neon geometry, warping grid, geoms and multiplier | Adds waves, bosses and a finish line instead of endless survival |
| Vampire Survivors / Brotato | Build-your-run drafting, passives, rare cards and mods, a shop between waves | Manual aiming, bombs and a screen-sized arena instead of auto-fire |
| Nex Machina / Enter the Gungeon | Roguelite structure with bosses, unlockable ships and weapon variety | Short, score-driven runs and no fixed room layouts |

## Art direction
- **Style:** Neon / synthwave
- **Palette:** `#02030d` background, `#5ee0ff` hero ship (cyan), `#ff5ce1` accent (magenta), `#ff4040` danger, `#ffffff` text, plus `#d8ff3a` geoms and `#ffe866` highlights; sector grids `#1f4bff`, `#9b2cff`, `#ff3b1f`
- **Font:** Bungee for the logo and big headings, Chakra Petch for all other text (both bundled in `fonts/`); same fonts in the art
- **Rendering:** 2D canvas with pre-rendered glow sprites (2x supersampled) and a spring-mesh grid
- **Assets:** procedural (vector shapes and WebAudio, no image or audio files)
- **Cover idea:** "NEON SWARM" title over a glowing swarm and ship on a dark grid (`art/cover.svg`)
- **Hero idea:** neon ship and swarm on the right with a calm grid on the left (`art/hero.svg`)

## Audio
- **SFX:** WebAudio synth in `audio.js`: shoot, heavy, missile, hit, deflect, explode, pickup, bomb, player hit, shield, menu move/select/deny, buy, wave clear, boss warning, level up, laser hum. Repeats are rate-limited
- **Music:** generative synthwave loop with three intensity levels (title, wave, boss). Music and SFX volume (0 to 10) are in Settings
- **Rumble:** hits, shield breaks, bombs, death, boss warnings and boss kills (toggle in Settings)

## Scope
## Ships (1.7, 1.8, 1.13)
All seven are available from the start. Each keeps its weapon for the whole run.
| Ship | Loadout | Ability (LT) | Rule |
|---|---|---|---|
| Interceptor | 3 HP, Twin Blaster | Barrage: 3s of triple fire rate with +1 pierce (9s cooldown) | Every kill during a Barrage adds 0.1s to it, up to +2s |
| Phantom | 2 HP, fast, +25% damage, Pulse Laser | Phase: 1.4s intangible, burning anything it flies through | Every geom cuts 0.15s off the Phase cooldown |
| Carrier | 3 HP, no gun, 4 drones | Frenzy: drones fire 3x as fast for 3.5s | Right stick sends the drone swarm to a point ahead of the ship |
| Reaper | 3 HP, no gun, orbit blades (wider) | Reap: slash dash in the aim direction; it ends in a shockwave that shoves nearby enemies back and clears nearby bullets, with 0.5s of invulnerability | Kills during a Reap refund 0.6s of its cooldown, so Reaps chain; a Reap that kills nothing refunds half its cooldown |
| Warden | 4 HP, Twin Blaster at 60% damage | Turret: drop a turret (3 at once, 25s) | Turrets inherit damage, fire-rate, crit and swarm upgrades |
| Hunter | 3 HP, Homing Swarm | Salvo: ring of 16 homing missiles | Missiles launch by themselves at nearby enemies; the right stick steers |
| Bombard | 4 HP, Nova Mortar | Detonate: blow every shell in flight where it is | Slow fire (about one shell a second), but a shell bursts in a huge blast and every kill in a blast sets off another, up to 3 to 6 links deep (by weapon level), so a swarm lined up behind you goes up in one shot. Numbers in `TUNING.mortar` |

## Synergy families (1.7)
Every weapon, passive, stat card and mod has a family. Weapons and passives count double at max level; stat cards count every time you take one. Drafts weight cards toward families you already collect. Cards show the family and what they'd add; the HUD lists active tiers.
| Family | 2 | 4 | 6 |
|---|---|---|---|
| Kinetic | +1 pierce | +1 bounce | +35% damage per pierce/bounce |
| Volatile | Explosions 40% bigger | Kills 30% chance to explode | Every kill explodes, double blast damage |
| Precision | +10% crit | Crits deal 5x | +20% crit, crits 6x |
| Swarm | +1 drone, blade, turret | Swarm damage +60% | Swarm damage x2.5, 50% faster |
| Velocity | +10% speed, ability -20% cooldown | +30% damage, +20% fire rate while moving | Burning trail, ability recharges twice as fast |
| Harvest | Geoms count triple toward the multiplier | Multiplier decays half as fast, hits keep 80%, wider magnet | Multiplier cap x20, +5% damage per step |
| Fortress | Shield break fires a nova | +1 max HP, shield every 45s | +1 max HP, shield every 25s |

## Supply Drop (1.8, replaces the shop)
After waves 5 and 10 (Endless: every 5th upgrade) a second, rare-or-better draft follows the normal one. The shop's items live on as cards: Nanite Repair, Hull Plating, Bomb Bay, Shield Cell and the new Spare Parts (+2 rerolls, +1 banish).

## Elites (1.10)
Mini-bosses with a health bar above them and their own attacks. Bombs take 35% of their health instead of killing them; shield blasts, barriers, black holes and wells don't move or eat them. Each kill is worth 1500 points and 16 geoms. Announced with a "ELITE" note and marked on the screen edge in their color.
| Elite | Behaviour | Campaign from wave | Endless from |
|---|---|---|---|
| Gunship | Circles you at ~320px, aimed 3-shot spreads, a 14-bullet ring every 5s | 3 | 40s |
| Broodmother | Slow; lobs mines between you and it (arm after 1.1s, burst into 10 bullets if you get within 85px or after 9s; shoot them to defuse) and hatches 2 swarmers every 6s | 6 | 90s |
| Lance | Keeps ~460px away and strafes; locks a red line for 0.9s, then fires 7 fast bullets down it | 11 | 150s |
| Juggernaut | Telegraphs its charge path for 0.9s, rams at 950px/s, bursts into 12 bullets on impact | 16 | 220s |
Campaign: one elite joins waves 3, 6 and 8 of every sector. Endless: first at 40s, then every 50s minus 6s per threat level (min 22s), 1 + threat/2 at a time, at most 4 alive.

## Black holes (1.11, Geometry Wars 2 style)
The gravity well enemy spawns **dormant** (a dashed red ring that doesn't pull). Shooting it wakes it up: an active black hole pulls in you, enemies, geoms and your bullets, swallows enemies and grows. After swallowing 14 enemies it goes **critical** (shudders and flashes for 1.6s) and **overloads**, bursting into a swarm of fast swarmers (4 + swallowed, max 22) and shoving you away. **Destroying** it first sets off a blast (190px + 8px per swallowed enemy) that kills nearby enemies (bosses and elites take 20 damage) and pays 100 x multiplier per swallowed enemy. The Eye's black holes spawn already active. Numbers in `TUNING.well`.

**v1 must-haves**
- Twin-stick movement, aiming and bombs; 4 primary weapons (Twin Blaster, Pulse Laser, Homing Swarm, Nova Mortar), 2 passives, 11 stat cards, 16 mods
- 3 sectors of 10 waves each, 9 enemy types, 3 bosses, Supply Drops after waves 5 and 10
- 7 ships and all mods available from the start, saved stats; title with ship select, pause, game over and victory screens

**Accessibility and settings (1.3)**
- Difficulty: Relaxed (+2 hull, 70% enemy HP, slower swarm and bullets, fewer enemies, longer recovery, half score), Normal, Hard (1.5x score)
- Aiming: Off, Aim assist (snaps to the enemy in a narrow cone), Auto-fire (aims and fires at the nearest enemy while the right stick is idle)
- Reduced shake and flash, rumble toggle, music and SFX volume

**Stretch**
- Daily seed or challenge mode
- Co-op for two controllers

## Definition of done
Tailored from [complete-game.md](../../docs/game-design/complete-game.md):
- [ ] Onboarding by doing (in-world tips removed in 1.5 at the owner's request; the title lists the controls)
- [x] Clear goal and score to beat (saved best, furthest sector and wave)
- [x] An ending (beat The Eye) and a saved personal best
- [x] Difficulty curve: new enemy types by wave, scaling HP and speed, bosses every 10 waves
- [ ] Fair failure verified at handheld size (spawn warm-up of 0.75s and a clearing shockwave exist, but readability was not checked)
- [x] Retry in one press from game over (A retries with the same ship and mode, B goes to the title)
- [x] Progression and variety: drafts, Supply Drops, synergies, seven ships, 20 mods, random wave plans
- [x] Visual and audio feedback on every action
- [x] Juice: screen shake, particles capped at 900, grid ripples, slow-motion on death
- [x] Rumble (`input.rumble()`, toggle in Settings)
- [x] SFX for every action and a music loop
- [x] Volume / mute setting
- [x] Title menu with the best score for the selected mode and a `select` prompt
- [x] Pause on `menu` (Start / Esc / P / ≡ button) with Resume, Restart, Settings, Quit to title; auto-pauses via `input.onPause`
- [x] Game over and victory screens with stats and build
- [x] Settings screen (title and pause)
- [x] Saves under a versioned key (`neon-swarm-save-v1`; 1.3 fields `settings`, `taught`, `bestEndless`, `bestTime`, `endless` are merged into older saves)
- [ ] Colorblind-safe (enemies are distinguished by shape as well as color; not verified)
- [x] Reduced shake / flash option
- [x] Text at least 24px
- [x] `TUNING` object at the top of `game.js` for player, enemy scaling, waves, assist, endless and difficulty numbers (weapon and boss numbers still live in their code)
- [x] Delta-time movement, clamped to 1/20 s
- [x] `?debug` hook (`window.__ns`) and `window.__game = { state, TUNING, save, settings, titleMenu }`
- [ ] Steady 60fps on the Deck (not measured; `window.__prof` exists)
- [x] `npm run check` passes

## Open questions / assumptions
- Assumed Sensation is the primary target: the grid, particles and synth audio carry the identity, and the roguelite drafting builds on it.
- The manifest says 1.2.0 but the folder's git history has a single "Add Neon Swarm" commit, so earlier versions' changes are unknown.
- Enemy HP scales with build power ^0.4 (was ^0.6) and wave size with ^0.2 (was ^0.25), so upgrades feel stronger. Watch whether sector 3 now feels too easy on Normal.
- Auto-fire is strong (standing still clears wave 1). It's meant as an accessibility option, so score isn't reduced for it.
- Endless has no bosses (like Geometry Wars). A boss joining the swarm every few threat levels is a possible follow-up.
- Endless pacing (`TUNING.endless`): threat climbs one campaign wave every 18 s; first level-up at 30 geoms, each level needs 30% more plus 8.

## Changelog
- 1.13.1: Build kit v6. Inside the launcher the pause menu ends with **Quit to library** (added by `menu.js`), so players can always find their way back to their games.
- 1.13.0: Ship roster. Removed Striker, Prism and Bulwark (and their Spread Shot, Ricochet and Flak weapons). New ship Bombard: Nova Mortar shells fire slowly but burst in a huge blast whose kills chain into more blasts; LT detonates shells in flight. Interceptor's LT is now Barrage (3s of triple fire rate and piercing bolts, kills extend it) instead of Dash. Reaper is safer on a miss: every Reap ends in a shockwave with 0.5s of invulnerability, and a Reap with no kills refunds half its cooldown. The last-picked ship is saved by id.
- 1.12.0: Kit v2 runtime: title, pause (Resume, Restart, Settings, Quit to title) and game-over menus on `menu.js`, Settings on `settings.js` (volumes, reduced shake & flash, text size, plus difficulty, aiming and rumble; old in-save settings migrate once), auto-pause through `input.onPause`, on-screen pause button, `fit.js` scaling with a DPR cap, saves through `save.js` under the same key, prompts from `input.label` / `drawPrompts`. Mouse (aim with the pointer, hold to fire) and touch (two virtual sticks plus BOMB and ability buttons; draft cards and buttons tappable) gameplay. Esc now pauses instead of acting as B; B/Backspace never pauses.
- 1.11.0: Black holes work like Geometry Wars 2: dormant until shot, then pull and swallow; overfed ones go critical and burst into a swarm; destroyed ones blast nearby enemies for a bonus.
- 1.10.0: Campaign now uses the big scrolling arena too; boss fights lock into a screen-sized boss arena with red walls. Four elites (Gunship, Broodmother with mines, Lance, Juggernaut) with health bars, telegraphed attacks and announcements, in campaign waves 3/6/8 and on a rising timer in Endless. Edge arrows always mark elites and a wave's last stragglers.
- 1.9.0: Balance pass. Geom Shield every 400 geoms and only with no shield; shield breaks push instead of kill; slower shield regen (Aegis and Fortress II 45s, Fortress III 25s, Bulwark 30s). Bulwark barrier: 1.5s energy, shoving drains it, slow recharge after a 1s release. Endless levels take longer (30 geoms, then +30% +8). Geometry Wars multiplier (+1 per 25 geoms, cap x10, decays after 4s); Harvest, Greed and Overclock retuned to match.
- 1.8.1: Everything open from the start: the five progress-locked mods (Afterimage, Chain Reaction, Splinter Rounds, Overdrive, Singularity) are now in the pool from the first run.
- 1.8.0: One weapon per ship (no new-weapon cards or switching); new ships Striker (Spread Shot), Hunter (Homing Swarm) and Prism (Ricochet). Cards are only offered when they work with your ship (bullets, swarm, bombs). Shop removed: Supply Drop bonus rare drafts instead, plus a Spare Parts card. Overdrive is now +40% fire rate, +25% damage; Greed doubles multiplier gain. Styled A/B buttons on the game over and victory screens.
- 1.7.0: All ships unlocked. Every ship now has an LT ability and a rule (Interceptor dash, Bulwark barrier, Phantom phase, Carrier drone command and frenzy, plus new Reaper and Warden). Seven synergy families with 2/4/6 bonuses on every card. Supply Depot rebuilt into Supplies / Arsenal / Black Market with a Sell tab. New mods: Drone Uplink, Hive Mind, Slipstream, Aegis Field; new stat card Drone Firmware and ship cards Drone Bay, Honed Edge, Emplacement.
- 1.6.0: Cleaner title screen: a single menu (Campaign, Endless, How to Play, Settings) with a ship panel beside it and a short description of the selected item. New How to Play screen lists the controls.
- 1.5.0: Removed the in-world control tips. Endless level-ups now bank and open with Y instead of popping up mid-fight. Endless camera looks ahead along movement only (eased), so changing aim no longer swings the view.
- 1.4.0: Endless reworked into Geometry Wars-style survival: one big scrolling arena (camera follows the ship, edge arrows for off-screen enemies), non-stop spawns that ramp with time, threat tiers every 2 minutes, XP-bar level-ups that open the draft, a shop every 5th level, best time saved. Endless is unlocked from the start.
- 1.3.0: Settings screen (difficulty, aim assist / auto-fire, reduced shake and flash, rumble, volumes); first-run control hints; one-press retry; bomb moved off gamepad A onto RT/LT; a hit halves the multiplier instead of resetting it; softer enemy scaling with build power; rumble; Endless mode (unlocked by beating The Eye); `TUNING` object; manifest tags.
- 1.2.0: Current version (per `pushplay.json`). Includes three sectors and bosses, four ships, unlocks, shop and drafting. History before this brief is unknown.
- 1.0.0: Added to the repo as "Add Neon Swarm" (git history shows a single commit).
