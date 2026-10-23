# Raft racing

An online room with 2–4 rafts. Everyone starts on the bench and picks a raft (and a spot round its rim) from the join sheet; the pond is the lobby, with ready ticks and a host Start; a 3·2·1 countdown holds every raft behind a striped boom across the start gate; the race HUD adds a place chip, rival badges on the progress bar and (desktop) mini standings; after the first finish the rest get 30 s, then results rank every raft with Rematch / Ready for rematch. A one-raft room is plain co-op and must look exactly like it always did.

## Sub-features

- R1 River picker: **Float together | Race** toggle, raft stepper 2·3·4 (online only).
- R2 Join sheet: newcomers on the bench get `PICK YOUR RAFT` (Enter hops on the highlighted, emptiest raft) or, mid-race, `RACE IN PROGRESS` with **Watch & join next race**.
- R3 Pond lobby: desktop card `Race lobby` (crews, ready ticks, `Start race` for the host / `Ready` for others, `Crews`); phone strip with the same buttons.
- R4 Crews panel (`C`): rim ring per raft, Hop on, Swap ← →, Sit this one out; host: RAFTS 2·3·4, Shuffle, Move.
- R5 Countdown and GO; start boom down until GO.
- R6 Racing HUD: place chip (`2ND/3`), rival badges, rival raft tags (`Teal · 1st`), mini standings (desktop), closing chip (`Teal finished! 0:24 left`).
- R7 Bench / finished: watch bar (◀ Watching Teal ▶, My raft, Join a raft).
- R8 Results: `<TEAM> WINS!`, standings with times / DNF, Gas Assassin award; host Rematch / Next river / Change crews; others Ready for rematch n/m.
- R9 Abandoned raft: a crew that leaves mid-race drops out of the standings.
- R10 Hippocam: `Race · N rafts`, raft badges per player and on the progress bar.

## How to get to it (user POV)

- Main menu → **Create room** → **Race** → rafts → a river card.
- Invite link / **Join** with a race room's code (lands on the join sheet).
- In a race room: Esc → **Switch raft** / **Join a raft** / **Back to the pond (everyone)**; results → **Change crews**.
- `/hippocam` → a race room's card → **Watch**.

## Driving it with toot-verify + verify-browser

Preconditions: a run is up and the browser is on the menu with a known name.

- **Create (R1, R2)**: click `Create room`, `getByRole('radio', { name: 'Race' })`, `getByRole('radio', { name: '3' })`, then `/^1 Lazy River/`. Expect `PICK YOUR RAFT` and `useApp.getState().overlay === 'join'`, roster raft `null`. `Enter` → raft 0, overlay `null`.
- **Racing bots (R3, R5–R8)**: `$T bot --name Mira --room CODE --pick 1 --ready --drive --stay 900` in the background, one per raft. `--drive` steers with the game's own test bot, so they finish Lazy River in about 2 minutes; `--ready` readies them up again after each race. The lobby card shows `n of m ready` with ticks.
- **Start (R5)**: host presses `y` (or `Start race`). `frame.view.phase` goes `countdown` → `racing` after 3 s; screenshot the big 3/2/1 and the boom.
- **Closing and results (R6, R8)**: poll `frame.view.closeAt` / `phase`; an idle host raft gets the closing chip, then `OUT OF TIME!`, then results about 2.6 s after `phase === 'finished'`. `Rematch` → `countdown` with every raft back on the grid (`rafts[].s` all equal).
- **Phone (R2, R3, R7)**: a second context (`isMobile`, `hasTouch`, 844×390) opening `/?room=CODE` mid-race gets `RACE IN PROGRESS`; tap `Watch & join next race`, then `Next raft` changes `frame.watch`. In the pond the strip shows `Ready` / `Crews`.
- **Crews (R4)**: `c`, then `getByRole('button', { name: '2 rafts race' })`, `Move` → `Move here`, `Shuffle`; read the roster (`raft`, `ord`) after each.
- **Abandoned (R9)**: kill a bot mid-race; 30 s later its raft is gone from the standings and the place chip's total drops.

## Gotchas

- `$T up` runs the room server without file watching: restart the run (`down`, `up`) after editing `src/sim` or `server/`. Vite picks up client edits live.
- Killing a bot leaves its seat held for 30 s (it shows as away and still counts as crew), which is what R9 relies on.
- The host never needs to ready up: `Y` is Start for the host, and the countdown also starts by itself only when every connected hippo on a raft is ready.
- Places only show while racing: in the pond rival tags read just `Teal`.
