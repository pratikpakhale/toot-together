# Online rooms

A player creates a room on a chosen river and gets a 6-letter code (its region's id from `regions.json`, then 4 random letters, like `INBEAN`), shown in the HUD and put in the page URL as `?room=CODE`. Friends join with the code from the menu or by opening the invite link. Up to 4 hippos share the raft (race rooms hold 4 per raft); the first connected player is host (crown) and is the only one who can restart mid-run. A reload or a dropped connection keeps your seat for 30 s and puts you back on the same hippo; leaving on purpose (`Leave room`, the results `Menu`, Back from the pause menu) frees the seat at once.

## Sub-features

- `room-create` `Create room` -> level -> in a room, URL `?room=CODE`, HUD chip `ROOM CODE`, you are host.
- `room-join-code` the menu `CODE` box + `Join` puts a second player in the same room.
- `room-invite-link` opening `/?room=CODE` joins straight from page load; the HUD chip copies that link.
- `room-reconnect` reloading the page resumes the same seat (same player id, no duplicate hippo).
- `room-host` only the host's pause menu offers `Restart run (everyone)`; others see `Only the host can restart mid-run.` Once a co-op run has finished anyone can go again on the same river, but only the host gets `Next river: <name>`.
- `room-errors` a missing code shows `Room not found`; a full room shows `Room is full`. (`Check the code` exists for malformed codes, but the menu can't send one: the `CODE` box keeps letters only and `Join` stays disabled under 4.)
- `room-leave` pause menu `Leave room CODE` returns to the menu, drops `?room` from the URL and frees the seat at once.

## How to get to it (user POV)

- Main menu `Create room`, then a river in `CHOOSE A RIVER`.
- Main menu `CODE` textbox (letters only, 6 max), then `Join` (disabled until 6 letters).
- Any link `http(s)://host/?room=CODE`, including the one copied from the HUD `ROOM` chip (title `Copy invite link`).
- In a room: `Esc` (or `P`), the `Menu` button, or the browser's Back button for the pause menu; Back again from the pause menu leaves the room.

## Driving it with toot-verify + verify-browser

Preconditions:

- Baseline preconditions from the README; fewer than 8 rooms created from `127.0.0.1` in the last minute.

- **Create.** Fill `YOUR HIPPO NAME` with `Verifier`; click `Create room`; click `getByRole('button', { name: /^1 Lazy River/ })`; `page.waitForURL(/\?room=[A-Z]{6}/)`. HUD shows `ROOM CODE`; `curl -s http://127.0.0.1:<server port>/health` shows `rooms` up by one. (Proven 2026-10-23 as the setup of the chat proof.)
- **Join by code (bot as the other side).** `$T bot --create --name Host --stay 60 --out EV/rooms-host.jsonl` in the background; read the code from its `welcome` line. In the browser menu fill `getByPlaceholder('CODE')` with it and click `Join`. URL becomes `?room=CODE`; crew list shows `Host` with the crown and `Verifier (you)`; the bot JSONL gets a `roster` with both.
- **Invite link.** New browser context, `goto('http://127.0.0.1:<web port>/?room=CODE')`. It lands in the run without touching the menu; the first player's crew list gains this player. (Proven 2026-10-23 with the phone context in the chat proof.) To check the copy button, `ctx.grantPermissions(['clipboard-read','clipboard-write'])`, click `getByTitle('Copy invite link')`, then `navigator.clipboard.readText()` equals `http://127.0.0.1:<web port>/?room=CODE`.
- **Reconnect after reload.** Note `useApp.getState().session.localPlayers[0].id`; `page.reload()`. `Inflating the raft…` may flash; afterwards the id is the same, the roster has the same number of players, and a bot in the room logs a `roster` with this id `away:true` then `away:false` (or no change if the reload was fast), never a new id.
- **Host rights.** Browser as creator: `Esc` shows `Restart run (everyone)`. Browser as joiner of a bot-created room: `Esc` shows `Only the host can restart mid-run.`
- **Errors.** Menu `CODE` = a code no room has (check `/hippocam` or `/health`), `Join`: modal `Room not found` with `Room XXXX doesn't exist (or everyone left).`, `OK` closes it. Fill a co-op room with 4 players (browser + 3 bots), then join from a 5th context: `Room is full` with `Room XXXX already has 4 hippos.`
- **Leave.** `Esc`, click `getByRole('button', { name: /^Leave room / })`. Main menu returns and `page.url()` has no `room` param; a bot in the room logs a `roster` without this id (no `away:true` first).
- **Proof.** Screenshots of the HUD chip + crew list for each player, the error modals, an ARIA snapshot after rejoining, and the bot JSONLs.

## Gotchas

- The browser profile keeps the seat token in `sessionStorage` (`toot-together:seat`) per tab. A reload resumes; a new tab or context joins as a new hippo.
- A resumed seat that expired (over 30 s away while others kept the room open) silently falls back to a fresh join. If the room itself is gone (closed 60 s after the last player left, or the server restarted without `ROOMS_FILE`), the reload ends on `Room not found`. Verification runs never park rooms, so a `$T down`/`up` drops every room. A dropped connection retries for 25 s behind `Connection wobble…`, then shows `Lost connection to the server.`
- Failed joins count against `127.0.0.1` (20 per minute), then every join is refused with `Slow down!`/`Too many attempts`.
- Every name (on joining, and a mid-room rename from Settings) is run through the profanity filter, and a match is replaced with something like `Bubbles42`; use clean names in assertions.
- Without the permission grant the clipboard write can be refused; the chip then shows a `Couldn't copy the link` notice instead of turning its icon into a tick.
- Server restart hand-off (rooms parked to `ROOMS_FILE`, clients reconnecting) is covered by `pnpm test` (`tests/handoff.test.ts`), not by this map.
