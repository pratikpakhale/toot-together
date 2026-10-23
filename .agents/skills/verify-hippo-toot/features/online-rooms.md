# Online rooms

A player creates a room on a chosen river and gets a 4-letter code, shown in the HUD and put in the page URL as `?room=CODE`. Friends join with the code from the menu or by opening the invite link. Up to 4 hippos share the raft; the first connected player is host (crown) and is the only one who can restart mid-run. A reload or a dropped connection keeps your seat for 30 s and puts you back on the same hippo.

## Sub-features

- `room-create` `Create room` -> level -> in a room, URL `?room=CODE`, HUD chip `ROOM CODE`, you are host.
- `room-join-code` the menu `CODE` box + `Join` puts a second player in the same room.
- `room-invite-link` opening `/?room=CODE` joins straight from page load; the HUD chip copies that link.
- `room-reconnect` reloading the page resumes the same seat (same player id, no duplicate hippo).
- `room-host` only the host's pause menu offers `Restart run (everyone)`; others see `Only the host can restart mid-run.`
- `room-errors` a missing code shows `Room not found`; a full room shows `Room is full`; a malformed code shows `Check the code`.
- `room-leave` pause menu `Leave room CODE` returns to the menu and drops `?room` from the URL.

## How to get to it (user POV)

- Main menu `Create room`, then a river in `CHOOSE A RIVER`.
- Main menu `CODE` textbox (letters only, 4 max), then `Join` (disabled until 4 letters).
- Any link `http(s)://host/?room=CODE`, including the one copied from the HUD `ROOM` chip (title `Copy invite link`).
- In a room: `Esc` or the `Menu` button for the pause menu.

## Driving it with hippo-verify + verify-browser

Preconditions:

- Baseline preconditions from the README; fewer than 8 rooms created from `127.0.0.1` in the last minute.

- **Create.** Fill `YOUR HIPPO NAME` with `Verifier`; click `Create room`; click `getByRole('button', { name: /^1 Lazy River/ })`; `page.waitForURL(/\?room=[A-Z]{4}/)`. HUD shows `ROOM CODE`; `curl -s http://127.0.0.1:<server port>/health` shows `rooms` up by one. (Proven 2026-10-23 as the setup of the chat proof.)
- **Join by code (bot as the other side).** `$T bot --create --name Host --stay 60 --out EV/rooms-host.jsonl` in the background; read the code from its `welcome` line. In the browser menu fill `getByPlaceholder('CODE')` with it and click `Join`. URL becomes `?room=CODE`; crew list shows `Host` with the crown and `Verifier (you)`; the bot JSONL gets a `roster` with both.
- **Invite link.** New browser context, `goto('http://127.0.0.1:<web port>/?room=CODE')`. It lands in the run without touching the menu; the first player's crew list gains this player. (Proven 2026-10-23 with the phone context in the chat proof.) To check the copy button, `ctx.grantPermissions(['clipboard-read','clipboard-write'])`, click `getByTitle('Copy invite link')`, then `navigator.clipboard.readText()` equals `http://127.0.0.1:<web port>/?room=CODE`.
- **Reconnect after reload.** Note `useApp.getState().session.localPlayers[0].id`; `page.reload()`. `Inflating the raft…` may flash; afterwards the id is the same, the roster has the same number of players, and a bot in the room logs a `roster` with this id `away:true` then `away:false` (or no change if the reload was fast), never a new id.
- **Host rights.** Browser as creator: `Esc` shows `Restart run (everyone)`. Browser as joiner of a bot-created room: `Esc` shows `Only the host can restart mid-run.`
- **Errors.** Menu `CODE` = a code no room has (check `/hippocam` or `/health`), `Join`: modal `Room not found` with `Room XXXX doesn't exist (or everyone left).`, `OK` closes it. Fill a room with 4 players (browser + 3 bots), then join from a 5th context: `Room is full`.
- **Leave.** `Esc`, click `getByRole('button', { name: /^Leave room / })`. Main menu returns and `page.url()` has no `room` param.
- **Proof.** Screenshots of the HUD chip + crew list for each player, the error modals, an ARIA snapshot after rejoining, and the bot JSONLs.

## Gotchas

- The browser profile keeps the seat token in `sessionStorage` per tab. A reload resumes; a new tab or context joins as a new hippo.
- A resumed seat that expired (over 30 s away, or the server restarted without `ROOMS_FILE`) silently falls back to a fresh join. Verification runs never park rooms, so a `$T down`/`up` drops every room.
- Failed joins count against `127.0.0.1` (20 per minute), then every join is refused with `Slow down!`/`Too many attempts`.
- A joiner's name is run through the profanity filter and replaced with something like `Bubbles42`; use clean names in assertions.
- Clipboard writes fail silently without the permission grant, and the chip's icon then never turns into a tick.
- Server restart hand-off (rooms parked to `ROOMS_FILE`, clients reconnecting) is covered by `pnpm test` (`tests/handoff.test.ts`), not by this map.
