# Hippocam spectator page

`/hippocam` is a public but unlinked page listing every live room once a second (code, river, phase, progress, time, deaths, crew with ping, spectators) under a bar of server stats, with a `Watch` button that drops you into a room as an invisible spectator. Nothing in the game links to it.

## Sub-features

- `cam-empty` with no rooms: `No rooms right now. The river is quiet.`
- `cam-list` each room card shows its code, river name, phase chip (`IN THE POND`, `COUNTDOWN` in race rooms, `RACING`, `FINISHED`, `EMPTY Ns`), crew names with host crown and ping, and a `Watch` button.
- `cam-regions` with more than one region in `regions.json` a `Server` tablist (one tab per region, the first selected) sits by the title. Locally every tab reads the same room server, so they all list the same rooms.
- `cam-stats` the bar shows `Rooms`, `Players`, `Spectators`, `Sockets`, `CPU`, `Load`, `Steal`, `Memory`, `Free`, `Tick late`, `Uptime`, `Release`.
- `cam-watch` `Watch` opens the run with a `SPECTATING` chip, no stamina meter, no touch controls, a `Players` button (the mute list) instead of `Chat`, and the room's chat log visible.
- `cam-back` the spectator pause menu (`Esc`) says `You're watching room CODE. Nobody can see you.` and `Back to rooms` returns to the list; `Back to the game` on the list goes to the main menu at `/`.
- `cam-closed` when the watched room closes the spectator returns to the list.

## How to get to it (user POV)

- Type `http://127.0.0.1:<web port>/hippocam` in the address bar.

## Driving it with toot-verify + verify-browser

Preconditions:

- Baseline preconditions from the README.

- **Empty.** `goto('/hippocam')` right after `$T up`: `HIPPOCAM` title (styled text, not a heading role; use `getByText`), stats bar with `Rooms 0`, and the quiet-river line.
- **List.** `$T bot --create --name Host --stay 90 --out EV/cam-host.jsonl` in the background, then `$T bot --room CODE --name Guest --stay 90` in the background. Within ~1 s a card with `CODE`, `Lazy River`, `IN THE POND`, `Host` (crown) and `Guest` appears; `Rooms 1`, `Players 2`.
- **Watch.** Click the card's `Watch` (`getByRole('button', { name: /Watch/ })`). HUD has `SPECTATING`, no `GAS` meter, no `Respawn`; `Esc` shows `Keep watching` / `Back to rooms`. A second context on `/hippocam` sees the card's eye count go 0 -> 1 while you watch, and back to 0 after `Back to rooms`.
- **Back.** `Back to rooms` returns to the list; `Back to the game` lands on the main menu at `/`.
- **Closed.** Let the bots' `--stay` run out: the card switches to `EMPTY Ns` as soon as nobody is connected, its crew shows `away` (seats held 30 s), `Players` drops to 0, and about 60 s after the last player left the card disappears (a spectator inside is sent back to the list). Observed 2026-10-23: `VNYW EMPTY 2s … Verifier away Bubbles away`.
- **Proof.** Screenshot of the list with the card, of the spectating HUD, and the ARIA snapshot of the list.

## Gotchas

- The page opens its own websocket in `watch` mode; spectators are not players and never keep a room alive.
- Spectator sockets are ping-limited and get nothing else; there is no way to chat or act from here.
- Analytics are off on this route by design, which only matters for production builds.
- Never open production `/hippocam` for verification: it shows real players' rooms.
