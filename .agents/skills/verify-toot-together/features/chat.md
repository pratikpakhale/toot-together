# Chat in online rooms

Players in an online room have a comms wheel of eight lines (a co-op set on one-raft rooms, a race set on race rooms), a row of emoji reactions under it, and a text box. Lines show in a short-lived log (the last 4, at the bottom left; top left on a phone) and as a bubble over the speaker's hippo (emoji-only lines as a big emoji); late joiners get the last 20 lines; swear words are starred out by the server; each player may send 5 lines per 10 s; anyone can be muted from the text box's player list (a spectator, who can't talk, gets a `Players` button that opens the same list). Couch and solo runs have no chat, and Settings › `Chat: ON/OFF` hides all of it.

## Sub-features

- `chat-receive` shows another player's line in the log and as a bubble.
- `chat-sets` co-op rooms show `COUNT IN` (`3, 2, 1, TOOT! 🎵`) … `CAREFUL` (`Careful!`); race rooms show `LET'S GO` (`Let's go! 🔥`) … `REVENGE` (`Revenge! 😤`). Each slice is a `button` named after the line it sends. Slot 1 is at the top, then clockwise.
- `chat-reactions` the emoji row (under the desktop wheel, and in the text box) sends that emoji; it shows as a big bubble.
- `chat-mute` the text box's `Players` button opens everyone in the room (in a race room one column per raft, plus `WATCHING` for the bench; in co-op one list); tapping a hippo mutes it on this device only (`aria-pressed`, struck out, crossed-out speaker) and the button counts `N muted`.
- `chat-history` a player who joins late receives the room's recent lines (up to 20); they show in the log for 8 s, without bubbles.
- `chat-flood` the 6th line inside 10 s is refused with an `Easy there!` toast and never sent. The server counts too (per seat, so the count survives a reload): a client over the limit gets `{"type":"refused","reason":"Too many messages. Wait a few seconds."}`, which the page shows as a toast unless an overlay is open.
- `chat-censor` profanity arrives starred (`shit` -> `s***`) for everyone.
- The states below: `chat-desktop-*` and `chat-touch-*`.

## States

`useApp.getState().chatPanel` is the state: `null`, `aim` (wheel shown while Q or the phone's chat button is held), `wheel` (wheel left open), `type` (text box), `people` (player list: above the text box on desktop, instead of it on a phone or for a spectator). Aiming works like a stick: the direction moved from where the press began picks the slot, past a dead zone (24 px mouse, 18 px thumb); nowhere near the wheel itself.

| From | Event | To | Sends |
| --- | --- | --- | --- |
| `null` | Q down | `aim` | |
| `aim` | Q up within 250 ms | `wheel` | |
| `aim` | Q up after 250 ms, aimed at a slot | `null` | that line |
| `aim` | Q up after 250 ms, inside the dead zone (no move, or moved and came back) | `null` | nothing |
| `aim`, `wheel` | 1–8 | `null` | that line |
| `wheel` | click a slice, or anywhere outside the hub out to 1.7× the wheel's radius (picks the slice in that direction) | `null` | that line, once |
| `wheel` | Q, Esc, a click on the hub or beyond 1.7× the wheel's radius | `null` | nothing; Esc doesn't open the pause menu |
| `null` | desktop `Q Chat` button | `wheel` | |
| any | T, or `TYPE` under the desktop wheel | `type`, field focused | |
| `null` | phone chat button released within 250 ms, moved < 12 px | `type`, field focused inside the tap (iOS raises the keyboard only then) | |
| `null` | phone chat button held 250 ms, or slid 12 px | `aim` | |
| `aim` (phone) | let go aimed at a slot / in the dead zone / touch cancelled | `null` | that line / nothing / nothing |
| `type` | Enter or Send with text; a reaction | `null` | it; sent text clears the draft, a reaction keeps it |
| `type` | Esc, a tap or click elsewhere (field blurs), the phone keyboard going away (the viewport shrinks by more than 120 px, then grows back to within 60 px of where it started), the phone chat button | `null` | nothing; the draft comes back next time |
| `type` | `Players` | `people`; desktop keeps the field focused, a phone drops the field (and the keyboard) | |
| `people` | a hippo in the list | unchanged (desktop field still focused); that player muted or unmuted | |
| `people` | `Players` again (desktop) | `type` | |
| `people` (phone) | `Done`, a tap on the dimmed game, the chat button | `null` | nothing; the keyboard dropping does not close it |
| `people` (desktop) | Esc, a click on the game | `null` | |
| `type`, `wheel` | flood limit | unchanged, `Easy there!` toast | nothing |
| `aim` | flood limit on release | `null`, `Easy there!` toast | nothing |
| `type`, `wheel` | connection down | unchanged, `Not sent` toast | nothing |
| `aim` | connection down on release | `null`, `Not sent` toast | nothing |
| `aim` (desktop) | the window loses focus | `null` | nothing |
| any | the pause menu or another overlay opens (results excepted), leaving the room | `null` | |

While a thumb aims, the wheel ignores touches (`pointer-events: none`), so the other thumb can keep tooting.

## How to get to it (user POV)

- Desktop, in an online room: hold or tap `Q` (wheel, dialog named `Quick chat`), `T` (text box), or click the `Q Chat` button next to `Esc Menu` / `R Respawn`.
- Phone, in an online room: the round speech-bubble button (accessible name `Chat`) above TOOT. Tap: text box. Hold: wheel.
- Over the results screen of an online run the same keys and button work.

## Driving it with toot-verify + verify-browser

Preconditions:

- Baseline preconditions from the README.
- The browser player has created a room: `Create room` -> `getByRole('button', { name: /^1 Lazy River/ })` -> `waitForURL(/\?room=[A-Z]{6}/)`. Call the code `CODE` and the evidence folder `EV`.
- The room has at most 1 other player (4 is the cap, and departed bots hold seats for 30 s).

- **Receive.** Start a bot in the background: `$T bot --room CODE --name Bubbles --say "hello from the bot" --stay 60 --out EV/chat-bot.jsonl`. In the browser `getByText('hello from the bot').first().waitFor()`. The line shows bottom-left prefixed `Bubbles` and as a bubble over a hippo. Screenshot `chat-01-bot-line-received.png`.
- **Hold and aim.** `page.mouse.move(550, 300)`, `keyboard.down('q')`, wait 300 ms, `page.mouse.move(620, 300, { steps: 6 })` (70 px right of where it was); the `RIGHT` slice turns yellow and `Go right!` shows in the hub (screenshot `chat-02-wheel-aim.png`); `keyboard.up('q')`. Repeat for all 8 directions (`sin`/`-cos` of `i × 45°`), 2 s apart for the flood limit. The dialog `Quick chat` detaches and the bot JSONL gets a line whose `recv` is `{"type":"chat","lines":[{"id":…,"name":"<your name>","seat":…,"text":"Go right!"}]}`.
- **Tap Q and a number.** `press('q')`; the dialog stays; `press('5')` sends `Stop tooting!` and closes it.
- **Typed line.** `press('t')`; `getByPlaceholder('Say something…')` is focused; `pressSequentially('typed by the verifier')`; `press('Enter')`. The box detaches, the line appears in the log, and the bot JSONL receives it.
- **Mute.** With a second bot that speaks twice (`$T bot --room CODE --name Pudding --say "before mute" --say "after mute" --gap 8000 --stay 30 --out EV/chat-bot-late.jsonl`, background): after `before mute` shows, press `t`, click `getByRole('button', { name: /Players/ })`, then `getByRole('button', { name: /Pudding/ })`. It gets `aria-pressed="true"`, strikethrough and a red speaker, and the Players button shows `1 muted`. `press('Escape')` closes the box. After the store shows `after mute` arrived (`sessionInfo.chat`), `getByText('after mute')` count is 0. Screenshots `chat-04`, `chat-05`.
- **History.** The `Pudding` bot's first `chat` message has `"history":true` and contains the earlier lines in order.
- **Esc.** After closing the wheel with `Escape`, `getByText('Leave room CODE')` count is 0 (pause menu did not open) and the Chat button has `aria-expanded="false"`.
- **Flood limit.** Six times: `press('q')`, wait for the `Quick chat` dialog, `press(String(i))`. Lines 1–5 send; on the 6th `getByText('Easy there!')` appears and the wheel stays open. Screenshot `chat-06-flood-limit-toast.png`. Wait 10 s before chatting again.
- **Censor.** `$T bot --room CODE --name Mudpie --say "this river is shit" --stay 3 --out EV/chat-bot-censor.jsonl`. The JSONL shows the server broadcast `this river is s***`. In the browser press `t` (the open text box shows the last 8 lines) and find `/this river is s\*\*\*/`; `getByText('this river is shit')` count is 0.
- **Touch.** New phone context (see SKILL.md) on `http://127.0.0.1:<web port>/?room=CODE`.
  - Tap: `getByRole('button', { name: 'Chat', exact: true }).tap()`; right after it, `document.activeElement` is the `Say something…` field.
  - Keyboard going away: `pressSequentially('half typed')`, then `setViewportSize({ width: 844, height: 190 })` (keyboard up) and back to `390` (keyboard down). `chatPanel` is `null`; the next tap shows `half typed` again. A 20 px wobble (toolbar) leaves the box open.
  - Hold and slide: `tap()` can't hold, so send raw touches with `ctx.newCDPSession(page)` and `Input.dispatchTouchEvent` (`touchStart` at the button's centre, wait 300 ms, five `touchMove`s 8 px apart, `touchEnd`). Up sends slot 1, left slot 7, and so on; the desktop page shows the phone player's line. `touchCancel` instead of `touchEnd` sends nothing.
  - Close the context.
- **Proof.** `browser_snapshot` to `EV/chat-final.aria.yml`; `browser_evaluate` of `sessionInfo.chat`, `roster` and `muted` to `EV/chat-final.store.json`. Together with the three bot JSONLs they show every line, who received it, and the censored text.

## Gotchas

- The closed log shows only the last 4 lines and drops them after 8 s. To find an older line, open the text box (`t`), which on desktop shows the last 8 without timing out (on a phone it shows none), or read the bot JSONL.
- Number keys only send while the wheel is open; with the text box focused they type digits.
- Aiming counts from the first mouse move after Q goes down, so move the mouse after `keyboard.down('q')`, not before.
- `getByRole('button', { name: /Lazy River/ })` matches two cards; anchor it with `^1 `.
- The touch layout is decided at page load. Resizing a desktop page never shows the phone `Chat` button; use an `isMobile`/`hasTouch` context.
- A fresh phone profile shows the `Hippo school` checklist, and the open text box covers it on an 844×390 screen. That's what a first-time phone player sees, not a harness artefact.
- Muting is per device and per room session; it resets on reload.
- Changing the name in Settings mid-room sends `rename`: the player list and later lines use the new name, lines already sent keep the old one, and a mute stays on (mutes go by player id).
- Bots joining quickly in a row count against the 4-seat cap while away (30 s). If a join fails with `Room CODE already has 4 hippos.`, wait or make a new room.
