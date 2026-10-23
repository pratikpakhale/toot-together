# Solo run

One player floats a river alone with keyboard, gamepad or touch. The run starts in a practice pond (first-timers get the `Hippo school` checklist), the timer starts at the START gate, and finishing shows `YOU MADE IT!` with time, medal, and `Next river` / `Again` / `Share`. Finishing a river unlocks the next; best times and medals are saved in the browser.

## Sub-features

- `solo-start` `Play solo` -> `CHOOSE A RIVER` -> an unlocked river starts a local run (no room code, no chat).
- `solo-locks` locked rivers are disabled cards reading `Finish <previous river> to unlock.`
- `solo-tutorial` a first-time player sees `Hippo school`; each line ticks when the hippo walks (A/D), toots (Space) and bursts (Shift).
- `solo-hud` HUD shows `GAS` meter, timer `00:00.00`, river name, deaths skull, progress bar, `Esc Menu`, `R Respawn`.
- `solo-pause` `Esc` freezes the run behind `PAUSED` with `Resume`, `Respawn at checkpoint`, `Restart run`, `How to play`, `Settings`, `Quit to menu`.
- `solo-finish` reaching the finish shows the results screen and records the best time on the level card.

## How to get to it (user POV)

- Main menu `Play solo`, then a river card.
- From the results screen: `Next river`, `Again`.

## Driving it with toot-verify + verify-browser

Preconditions:

- Baseline preconditions from the README. For `solo-tutorial` and `solo-locks`, use a fresh browser context (no saved progress).

- **Start.** Click `Play solo`; `CHOOSE A RIVER` appears with `Each river unlocks the next. Beat the clock for medals!`; click `getByRole('button', { name: /^1 Lazy River/ })`. The HUD appears, the URL has no `room`, and there is no `Chat` button. `useApp.getState().session.kind === 'local'`.
- **Locks.** In a fresh context, the cards `2 Canyon Run` and `3 Volcano Peak` are `disabled` and read `Finish … to unlock.`
- **Tutorial.** In a fresh context, `Hippo school` lists `Hold A or D to walk around the rim`, `Hold Space to toot`, `Tap Shift to burst`. Hold `KeyD` (`keyboard.down('d')`, wait ~500 ms, `up`), hold `Space` the same way, press `ShiftLeft`. Each line gets struck through; the last line `Toot through the START gate together!` lights up.
- **Timer.** Toot through the START gate (stand at the back with `S`, hold `Space`). The timer leaves `00:00.00`.
- **Pause.** `press('Escape')`: `PAUSED`; the timer text stays the same over 2 s. `Resume` continues. `Quit to menu` returns to the main menu.
- **Finish.** Not yet driven. Needs a full Lazy River run by keyboard (gold under 2:00, bronze 4:10), steering around hazards. Report it as unverified unless you actually reach `YOU MADE IT!`; do not fake progress through the store.
- **Proof.** Screenshot per step, ARIA snapshot of the pause menu and of the level select.

## Gotchas

- Keys only reach the game while no input is focused; click the canvas area or press `Escape` twice if the name box kept focus.
- A hidden/backgrounded tab auto-pauses local runs (`visibilitychange`). Keep the page in front.
- Saved progress persists in the verify browser; use a new context to see first-time behaviour.
- The menu's background raft is a local attract-mode session too; check `screen === 'game'`, not just `session.kind`.
