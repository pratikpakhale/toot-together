# Raft racing

An online room with 2–4 rafts. Between races, anyone opening the room lands on the raft with the most room (the host on Red); the pond is the lobby, with one big button that does the next thing (Invite friends / Split crews / Start race for the host, Ready for everyone else, Hop on from the bench) and one tap to switch rafts; a 3·2·1 countdown holds every raft behind a striped boom across the start gate; the race HUD adds a place chip, rival badges on the progress bar and (desktop) mini standings; someone arriving mid-race watches from the bench and can hop on; after the first finish the rest get 30 s, then results rank every raft with Rematch / Ready for rematch. There are no rim spots to pick. A one-raft room is plain co-op and must look exactly like it always did.

## Sub-features

- R1 River picker: **Float together | Race** toggle, raft stepper 2·3·4 (online only).
- R2 Seating: a newcomer between races is put on the emptiest raft (first on a tie) with a `YOU'RE ON <RAFT>` toast; mid-race (or in the countdown) they land on the bench watching the leader.
- R3 Pond lobby, desktop: the `Race lobby` card. One row per raft (your row tinted, gold outline, `YOU`), `Switch` (or `Hop on` from the bench) on the others, a dashed Bench row when anyone sits out, `n of m ready` (the host isn't counted), host-only `Crews` (C), and the big button (Y) with a hint under it.
- R4 Pond lobby, phone: a pill per raft at the top (your pill ringed with your hippo; tap another to switch), an eye pill with the bench count, host-only `Crews`, and the big button bottom-centre between the stick and TOOT, with a one-line hint above it.
- R5 Big button by state: host alone `Invite friends` (copies the link and toasts `INVITE LINK COPIED`; share sheet on phones), host with everyone on one raft `Split crews` (shuffle), host otherwise `Start race`; racer `Ready` / `Ready!`; bench `Hop on <emptiest>`.
- R6 Auto-start: once every connected non-host racer is ready (and two rafts have crews), the countdown starts without the host.
- R7 Host Crews panel (`C`, host only): RAFTS 2·3·4, Shuffle, tap a hippo then `Move here` on a raft or `Bench <name>`.
- R8 Countdown and GO; start boom down until GO; rival raft tags show crew names before GO and `<Raft> · <place>` after.
- R9 Racing HUD: place chip (`2ND/3`), rival badges, mini standings (desktop), closing chip (`Teal finished! 0:24 left`).
- R10 Watch bar (bench mid-race, or your raft done): `Race in progress` / `Waiting for … · 0:24`, chevron buttons (← →), `<Raft> · <place>`, `My raft`, and from the bench `Hop on <raft>` (Y) for the raft you're watching while it's still racing with room.
- R11 Esc menu in the pond: `Sit out the next race` on a raft, `Hop on <raft>` on the bench.
- R12 Results: `<TEAM> WINS!`, standings with times / DNF, Gas Assassin award; host Rematch / Next river / Change crews; racers Ready for rematch n/m; bench `Hop on <raft>`.
- R13 Abandoned raft: a crew that leaves mid-race drops out of the standings.
- R14 Hippocam: `Race · N rafts`, raft badges per player and on the progress bar.

## How to get to it (user POV)

- Main menu → **Create room** → **Race** → rafts → a river card.
- Invite link / **Join** with a race room's code (lands straight on a raft, or on the bench mid-race).
- In a race room: Esc → **Sit out the next race** / **Hop on**; results → **Change crews** (host).
- `/hippocam` → a race room's card → **Watch**.

## Driving it with toot-verify + verify-browser

Preconditions: a run is up and the browser is on the menu with a known name.

- **Create (R1, R2, R5)**: click `Create room`, `getByRole('radio', { name: 'Race' })`, `getByRole('radio', { name: '3' })`, then `/^1 Lazy River/`. Expect the roster to put you on raft 0, `overlay === null`, and `Invite friends`. Grant `clipboard-read`/`clipboard-write` on the context, press `y`, and read `navigator.clipboard.readText()` for the `?room=CODE` link.
- **Joiners (R2, R3)**: `$T bot --name Mira --room CODE --stay 900` lands on the emptiest raft by itself; `--pick RAFT|bench` moves it after that. A second browser context opening `/?room=CODE` lands on a raft with the toast.
- **Racing bots (R6, R8–R12)**: `$T bot --name Mira --room CODE --pick 1 --ready --drive --stay 900` in the background, one per raft. `--drive` steers with the game's own test bot, so a crew of drivers finishes Lazy River in about 2 minutes; idle crewmates slow a raft right down. With the host sitting out and two `--ready` bots on two rafts, the race starts by itself (R6).
- **Start (R8)**: host presses `y` (or `Start race`). `frame.view.phase` goes `countdown` → `racing` after 3 s.
- **Mid-race join (R2, R10)**: a new context opening the link while racing gets the watch bar; `getByRole('button', { name: 'Next raft' })`, then `/^Hop on/`.
- **Phone (R4)**: a context with `isMobile`, `hasTouch`, 844×390. Pills are buttons named `/^Teal raft/` etc.; the big button is `/^Ready$/`, `/Split crews/`, `/Invite friends/` or `/^Hop on/`. Tap them with `locator.tap()`.
- **Crews (R7)**: host presses `c`, taps a hippo chip (`getByRole('button', { name: /Mira/ })`), then `Move here` or `Bench Mira`; read the roster (`raft`) after each.
- **Abandoned (R13)**: kill a bot mid-race; 30 s later its raft is gone from the standings and the place chip's total drops.

## Gotchas

- `$T up` runs the room server without file watching: restart the run (`down`, `up`) after editing `src/sim` or `server/`. Vite picks up client edits live.
- Killing a bot leaves its seat held for 30 s (it shows as away and still counts as crew), which is what R13 relies on.
- The host never readies: its Start is its ready, and the ready count leaves it out.
- Before GO, rival tags read crew names (`Kabir, Mira +1`); places only show while racing.
- Under SwiftShader a long race starves the room server and the race clock runs slow; shrink the pages (960×540) or close extra contexts while waiting for results.
