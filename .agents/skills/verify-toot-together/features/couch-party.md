# Couch party lobby

Up to four hippos on one screen. In the lobby each player claims a seat by pressing their device's toot key: Space for the WASD player, Enter for the arrows player, A on a gamepad. Players pick a river from the compact cards and start the run together; P1 uses WASD + Space, P2 arrows + Enter.

## Sub-features

- `couch-open` main menu `Couch party (1–4)` opens `COUCH PARTY` with four `Press to join` slots.
- `couch-join-keys` Space fills a slot labelled `WASD + Space`, Enter fills one labelled `Arrows + Enter`; pressing the same key again does nothing.
- `couch-river` the compact river cards highlight the picked river.
- `couch-start` the button reads `Waiting for hippos…` (disabled) until someone joins, then `Start with N hippo(s)!` and starts a local run with N hippos.
- `couch-back` `Back` or Esc returns to the menu.

## How to get to it (user POV)

- Main menu `Couch party (1–4)`.

## Driving it with toot-verify + verify-browser

Preconditions:

- Baseline preconditions from the README (desktop context; no gamepad needed).

- **Open.** Click `Couch party (1–4)`. `COUCH PARTY` heading; four `Press to join`; `getByRole('button', { name: 'Waiting for hippos…' })` is disabled.
- **Join P1.** `press('Space')`. Slot 1 shows your name and `WASD + Space`; the start button reads `Start with 1 hippo!`.
- **Join P2.** `press('Enter')`. Slot 2 shows `Orange Hippo` and `Arrows + Enter`; button reads `Start with 2 hippos!`. `press('Space')` again leaves it at 2.
- **River.** Click the compact `1 Lazy River` card; it gets the active outline.
- **Start.** Click `Start with 2 hippos!`. The HUD shows two named meters (not `GAS`), the crew list shows both, and no `Chat` button exists.
- **Back.** Reopen the lobby and press `Escape`: main menu.
- **Proof.** Screenshot after each join and after start; ARIA snapshot of the lobby with two seats.

## Gotchas

- Enter is a toot key, so it is swallowed instead of clicking a focused button; click `Start` with the mouse.
- Esc from a keyboard backs out of the lobby; Start on a joined gamepad starts it. Headless browsers have no gamepads, so gamepad joins stay unverified.
- The second seat's name comes from the seat colour (`SEAT_NAMES`), not the name box.
