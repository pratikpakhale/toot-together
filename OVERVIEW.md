# Toot Together: what's in it and how it's built

## What's in it

- **Eight rivers that ramp up**, each with its own look, and each harder towards its end:
  1. **Lazy River** (meadow): introduces each hazard on its own, with room to recover.
  2. **Canyon Run** (desert canyon): spike alley, spinner plaza, the drop, the ice shelf, crusher canyon and the sky-ribbon finale.
  3. **Volcano Peak** (lava): spinner gauntlet, lava chute, obsidian ice, the crusher corridor and the caldera rim.
  4. **Bayou Bends** (swamp at dusk): introduces sideways currents, whirlpools and spike fences.
  5. **Frostbite Falls** (glacier): ice runs, sweeper booms, fences over open edges and two frozen falls.
  6. **Sunken Temple** (jungle ruins): introduces fire jets, mixed with crushers, sweepers and pistons.
  7. **Dragon's Gullet** (lava): fire-jet waves, whirlpool pairs, open-edged drops and a double sweeper.
  8. **Thunder Run** (storm): every hazard in the game, back to back.
- **Progression**: finishing a river unlocks the next. Best times and bronze/silver/gold medals are saved per river, and the results screen has *Next river*, *Again* and *Share*.
- **Hippo school**: first-time players get a hands-on checklist in the practice pond (walk, toot, burst, then START).
- **Hazards**: spiked walls, spinning spike crosses, swinging maces, sliding spike logs, crusher doors, slamming pistons, floating mines, sweeper booms hinged on a bank, wall-mounted fire jets, spike fences with a sliding gap, whirlpools that drag the raft in, sideways currents, bouncy mushrooms, rocks, boost pads, and open edges you can fall off. Hit shapes cover the spikes you can see, so a raft that looks like it touched them did.
- **Gas tank**: tooting drains stamina. Run dry and you wheeze until it refills.
- **Toot Sync**: two or more hippos tooting the same way at the same moment get a rainbow speed boost and a chord.
- **Snacks**: beans (turbo), chili (endless fire farts), prune (you can't stop tooting).
- **Blame**: every crash names the hippo whose toots caused it. The results screen hands out awards (Most Toxic, Saboteur, Harmony Hippo, Silent But Deadly…).
- **Legendary toots**: rare and announced to the whole room.
- **Chat** (online): a comms wheel of eight lines, one set for co-op crews and one for races (hold Q, nudge the mouse towards a line and let go, or tap Q and press 1–8; on a phone, hold the chat button by TOOT and nudge your thumb towards a line), a row of emoji reactions, or type your own (T, or a tap on the phone's chat button). What a hippo says pops up over its head (reactions as a big emoji) and in a short log, and late joiners get the last 20 lines. Swear words are starred out, each player gets 5 lines per 10 s, and anyone can be muted from the type box's player list (in a race, one column per raft, so a full room never wraps). Settings › Chat turns it all off.
- **Raft racing** (online): 2–4 rafts with crews of 1–4 race down the same river. Opening the link puts you on the raft with the most room; one tap switches rafts, and the host can also set the raft count, shuffle and move hippos. Everyone readies up in the pond (the host's Start counts as ready), and a 3·2·1 countdown drops the start gate for everyone at once. Rafts bump, toots shove rivals (a rival pushed into a hazard counts as a snipe, for the Gas Assassin award), a respawning raft is a ghost until it's clear, and after the first finish the rest have 30 s before they're out of time. Results rank every raft; races don't touch medals or best times. Someone arriving mid-race watches from the bench and can hop onto any raft that's still racing.
- **Online play**: a dropped player keeps their seat for 30 s while the game reconnects them; the host (crown) is the only one who can restart mid-run; rooms, connections and join attempts are rate limited; names go through a profanity filter. `/hippocam` (linked from nowhere in the game) lists every live room with the server's stats and lets you watch any of them as an invisible spectator.
- **Installable**: the game is a PWA that opens full screen from a home screen, and solo games work offline. A new release reloads the page as soon as the player isn't mid-run.
- **Procedural audio**: every toot, splash, boing and the music loop is synthesised with WebAudio, so there are no audio files and no two toots sound the same.
- **Procedural art**: the hippos, raft, track, cliffs and scenery are all generated in code, so there are no 3D model files. The UI uses the game's own SVG icon set (`src/client/ui/icons.ts`); `pnpm icons` re-renders the favicon and app icons from it.

## How it's built

```
src/sim/        Deterministic, framework-free game simulation (runs in browser AND server)
  track.ts        Turtle-style course pieces → baked samples; track-relative queries
  courses.ts      The eight rivers (pieces, difficulty, medal times)
  bot.ts          Autopilot: plans a lane and speed (or waits, or backs off) clear of timed hazards (tests, balance, menu raft)
  obstacles.ts    Hazards as pure functions of time (+ collision shapes, and the force fields of boosts, currents and whirlpools)
  sim.ts          Raft physics, hippos, stamina, sync, pickups, deaths, checkpoints; crews, countdown, places and the rest of a race
                  (co-op is simply a race with one raft)
  sectors.ts      Which slice of the rim each hippo in a crew may stand on
  protocol.ts     Client/server message types
server/index.ts   ws rooms with 4-letter codes, 60 Hz authoritative sim, 60 Hz snapshots
src/client/
  game/           Sessions (local vs online), interpolation, input devices, events
  scene/          React Three Fiber scene: track mesh builder, water shader, hippos, FX, per-river themes
  audio/          WebAudio synth (farts, sfx) + procedural music
  ui/             Menus, HUD, level select, results, settings (Tailwind) + the icon set
  state/          App store and saved progress (best times, medals, unlocks)
  lab/            /lab: a showroom of the hippos, rafts, hazards and rivers (loaded only on that route)
tests/            Vitest: every course is intact and finishable by bots with hazards live, deaths/respawn, stamina,
                  each hazard, race rules and a random-action fuzz against the room's invariants, chat, the snapshot clock,
                  and rooms surviving a server restart (the room tests spawn real servers on spare ports)
trailer/          The launch trailer: shot list, title cards and the frame-by-frame recorder
```

- **Multiplayer**: the server owns the only simulation, clients send inputs (where to stand, toot, burst), and the server broadcasts snapshots that clients render slightly in the past with interpolation (one snapshot interval plus the jitter they measure, at most 250 ms). Obstacles are pure functions of the shared clock, so they cost no bandwidth. Your own toots play sound and particles instantly, before the server confirms them.
- **Solo and couch** run the exact same `Sim` in the browser, so every mode shares one code path.
- **Course authoring**: a course is a list of pieces (`len`, `turn`, `drop`, `width`, `left`/`right` edge: `wall | spikes | open`, `flow`, `ice`, `items`). Baking produces samples used by both physics and rendering. `pnpm test` checks that a course never folds back onto itself and that the autopilot can finish it.
- **Trailer**: the real game scene, steered by the autopilot from a shot list (`trailer/director.ts`) with scripted chat. `pnpm trailer` steps it frame by frame in headless Chromium on a fake clock while the game's synth renders into an `OfflineAudioContext`, so every frame and sound lands on time and each render comes out identical. `pnpm trailer:dryrun` plays the shots in Node and prints what happens in each. It needs ffmpeg and `pnpm exec playwright install chromium-headless-shell`.

```bash
pnpm test                 # sim, race, chat, netcode and restart hand-off tests
pnpm typecheck
pnpm react-doctor         # React Doctor lint (errors fail it)
pnpm knip                 # unused files, exports and dependencies
pnpm balance [course-id]  # autopilot timings / death stats per river for tuning
pnpm level-shots [id...]  # re-render level-select thumbnails (public/levels/) in headless Chromium
pnpm trailer              # re-render the README preview (trailer/preview.webp), the 1080p master and a 1080p copy for social (trailer/out/)
pnpm reel                 # the vertical 1080×1920 cut of the trailer for phones (trailer/out/)
pnpm og                   # re-render the link preview card (public/og.jpg) from a trailer frame
```
