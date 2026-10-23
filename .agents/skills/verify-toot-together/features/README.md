# Toot Together verification map

This directory is the maintained source for verifying what a Toot Together player can do. Read this index, then use the matching feature file as the recipe. `T` below is `.agents/skills/verify-toot-together/scripts/toot-verify.mjs`, run from the repo root.

## Baseline preconditions

- A run is up: `$T up` printed `DOCTOR OK`, and `$T status` gives the web port (default 5273) and server port (default 2667).
- `$T doctor` passes, including the line `vite /ws proxy reaches our room server`.
- The browser is on `http://127.0.0.1:<web port>/`, never the production site and never the user's `:5173`.
- The player under test has typed a known name into `YOUR HIPPO NAME` (the verify browser keeps the last run's `localStorage`).
- Nobody else is in the rooms you use: `curl -s http://127.0.0.1:<server port>/health` shows the rooms you expect.

## Driving conventions

- Act through the UI: clicks/taps on ARIA roles and names, keys sent to the page. `window.__toot.useApp.getState()` is for reading state only.
- Other people are `$T bot` processes or extra browser contexts. Run a bot in the background when it must stay present while you drive.
- Room codes are random 4-letter codes. Read the code from the URL (`?room=CODE`) or the HUD `ROOM` chip after creating; never hard-code one.
- Wait on UI state (`locator.waitFor`, `waitForURL`), not fixed sleeps, except where a feature file says a delay is part of the behaviour.
- Close extra browser contexts and `browser_navigate about:blank` before `$T down`.

## Proof and skip reporting

- Capture the action and the resulting state: a screenshot before and after, plus an ARIA snapshot of the end state.
- Pair what one player sees with what another received: bot `--out` JSONL, or a screenshot from the second context.
- Save everything under `/tmp/verify/toot-together/evidence/<runId>/` as `<feature>-NN-<what>.<ext>`.
- Report an unreachable path with the attempted step and the unmet precondition. Do not report a skipped entry point as verified through another one.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the user-visible behaviour, then exactly four H2s in this order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)` (every entry point), `Driving it with toot-verify + verify-browser` (starts with `Preconditions:`; labelled bullets pairing each action with the exact call and the observable result), `Gotchas`.

## Features

| Feature | File | Last proven |
| --- | --- | --- |
| Chat in online rooms | [chat.md](./chat.md) | 2026-10-23, all sub-features (run `2026-10-23T10-31-37-306`) |
| Online rooms: create, join, invite link, reconnect | [online-rooms.md](./online-rooms.md) | create + invite-link join exercised as part of the chat proof; join-by-code, reload reconnect and errors not yet run |
| Solo run | [solo-run.md](./solo-run.md) | not yet run |
| Couch party lobby | [couch-party.md](./couch-party.md) | not yet run |
| Raft racing: river picker, join sheet, lobby, crews, countdown, race HUD, closing, results, rematch | [race.md](./race.md) | 2026-10-24, R1–R10 on desktop 1280×720 and phone 844×390 (runs `2026-10-23T20-02-00-892`, `2026-10-23T20-06-12-387`) |
| Hippocam spectator page | [hippocam.md](./hippocam.md) | room list with two rooms seen 2026-10-23 (run `2026-10-23T10-38-39-617`); Watch/Back/closed not yet run |
