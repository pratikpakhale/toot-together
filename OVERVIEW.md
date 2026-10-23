# Toot Together: what's in it and how it's built

## What's in it

- **Three rivers that ramp up**, each with its own look, and each harder towards its end:
  1. **Lazy River** (meadow): introduces each hazard on its own, with room to recover.
  2. **Canyon Run** (desert canyon): spike alley, spinner plaza, the drop, the ice shelf, crusher canyon and the sky-ribbon finale.
  3. **Volcano Peak** (lava): spinner gauntlet, lava chute, obsidian ice, the crusher corridor and the caldera rim.
- **Progression**: finishing a river unlocks the next. Best times and bronze/silver/gold medals are saved per river, and the results screen has *Next river*, *Again* and *Share*.
- **Hippo school**: first-time players get a hands-on checklist in the practice pond (walk, toot, burst, then START).
- **Hazards**: spiked walls, spinning spike crosses, swinging maces, sliding spike logs, crusher doors, slamming pistons, floating mines, bouncy mushrooms, rocks, boost pads, and open edges you can fall off.
- **Gas tank**: tooting drains stamina. Run dry and you wheeze until it refills.
- **Toot Sync**: two or more hippos tooting the same way at the same moment get a rainbow speed boost and a chord.
- **Snacks**: beans (turbo), chili (endless fire farts), prune (you can't stop tooting).
- **Blame**: every crash names the hippo whose toots caused it. The results screen hands out awards (Most Toxic, Saboteur, Harmony Hippo, Silent But Deadly…).
- **Legendary toots**: rare and announced to the whole room.
- **Chat** (online): eight quick lines a tap or a number key away, or type your own. What a hippo says pops up over its head and in a short log, and late joiners get the last 20 lines. Swear words are starred out, each player gets 5 lines per 10 s, and anyone can be muted from the chat panel. Settings › Chat turns it all off.
- **Online play**: a dropped player keeps their seat for 30 s while the game reconnects them; the host (crown) is the only one who can restart mid-run; rooms, connections and join attempts are rate limited; names go through a profanity filter.
- **Procedural audio**: every toot, splash, boing and the music loop is synthesised with WebAudio, so there are no audio files and no two toots sound the same.
- **Procedural art**: the hippos, raft, track, cliffs and scenery are all generated in code, so there are no 3D model files. The UI uses the game's own SVG icon set (`src/client/ui/icons.ts`); `pnpm icons` re-renders the favicon and app icons from it.

## How it's built

```
src/sim/        Deterministic, framework-free game simulation (runs in browser AND server)
  track.ts        Turtle-style course pieces → baked samples; track-relative queries
  courses.ts      The three rivers (pieces, difficulty, medal times)
  bot.ts          Autopilot: dodges hazards and waits for timed ones (tests, balance, menu raft)
  obstacles.ts    Hazards as pure functions of time (+ collision shapes)
  sim.ts          Raft physics, hippos, stamina, sync, pickups, deaths, checkpoints
  sectors.ts      Which slice of the rim each hippo in a crew may stand on
  protocol.ts     Client/server message types
server/index.ts   ws rooms with 4-letter codes, 60 Hz authoritative sim, 30 Hz snapshots
src/client/
  game/           Sessions (local vs online), interpolation, input devices, events
  scene/          React Three Fiber scene: track mesh builder, water shader, hippos, FX, per-river themes
  audio/          WebAudio synth (farts, sfx) + procedural music
  ui/             Menus, HUD, level select, results, settings (Tailwind) + the icon set
  state/          App store and saved progress (best times, medals, unlocks)
tests/            Vitest: every course is intact and finishable by bots with hazards live, deaths/respawn, stamina
trailer/          The launch trailer: shot list, title cards and the frame-by-frame recorder
```

- **Multiplayer**: the server owns the only simulation, clients send inputs (where to stand, toot, burst), and the server broadcasts snapshots that clients render about 100 ms in the past with interpolation. Obstacles are pure functions of the shared clock, so they cost no bandwidth. Your own toots play sound and particles instantly, before the server confirms them.
- **Solo and couch** run the exact same `Sim` in the browser, so every mode shares one code path.
- **Course authoring**: a course is a list of pieces (`len`, `turn`, `drop`, `width`, `left`/`right` edge: `wall | spikes | open`, `flow`, `ice`, `items`). Baking produces samples used by both physics and rendering. `pnpm test` checks that a course never folds back onto itself and that the autopilot can finish it.
- **Trailer**: the real game scene, steered by the autopilot from a shot list (`trailer/director.ts`) with scripted chat. `pnpm trailer` steps it frame by frame in headless Chromium on a fake clock while the game's synth renders into an `OfflineAudioContext`, so every frame and sound lands on time and each render comes out identical. `pnpm trailer:dryrun` plays the shots in Node and prints what happens in each. It needs ffmpeg and `pnpm exec playwright install chromium-headless-shell`.

```bash
pnpm test                 # sim, netcode and restart hand-off tests
pnpm typecheck
pnpm knip                 # unused files, exports and dependencies
pnpm balance [course-id]  # autopilot timings / death stats per river for tuning
pnpm trailer              # re-render the 1080p trailer master and a 1080p copy for social (trailer/out/)
```
