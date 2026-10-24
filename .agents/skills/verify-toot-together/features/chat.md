# Chat in online rooms

Players in an online room have a comms wheel of eight lines (a co-op set on one-raft rooms, a race set on race rooms), a row of emoji reactions under it, and a text box. Lines show in a short-lived log at the bottom left and as a bubble over the speaker's hippo (emoji-only lines as a big emoji); late joiners get the last 20 lines; swear words are starred out by the server; each player may send 5 lines per 10 s; anyone can be muted from the text box's `Mute` chips. Couch and solo runs have no chat, and Settings › `Chat: ON/OFF` hides all of it.

## Sub-features

- `chat-receive` shows another player's line in the log and as a bubble.
- `chat-wheel-hold` hold Q, move the mouse towards a line (it highlights and shows in the hub), let go: it's sent. Let go without aiming: nothing is sent and the wheel closes.
- `chat-wheel-keys` tap Q: the wheel stays open; 1–8 sends that line (1 at the top, clockwise), a click on a line or its slice sends it, a click outside closes it.
- `chat-sets` co-op rooms show `3, 2, 1, TOOT! 🎵` … `Careful! ⚠️`; race rooms show `Let's go! 🔥` … `Revenge! 😤`.
- `chat-reactions` the emoji row under the wheel sends that emoji; it shows as a big bubble.
- `chat-type` T (or `Type` under the wheel) focuses the text box, Enter sends, the box closes.
- `chat-esc` Esc closes the wheel or the box without opening the pause menu.
- `chat-mute` the text box's `Mute` chips hide a player's later lines on this device only.
- `chat-history` a player who joins late receives the room's recent lines.
- `chat-flood` the 6th line inside 10 s is refused with an `Easy there!` toast.
- `chat-censor` profanity arrives starred (`shit` -> `s***`) for everyone.
- `chat-touch` on a phone the round `Chat` button above TOOT: press and slide onto a line, let go to send; or tap it, then tap a line. A tap outside the wheel closes it without pressing whatever is underneath.

## How to get to it (user POV)

- Desktop, in an online room: press `Q` (wheel, dialog named `Quick chat`), `T` (text box), or click the `Q Chat` button next to `Esc Menu` / `R Respawn`.
- Phone, in an online room: the round speech-bubble button (accessible name `Chat`) above BURST/TOOT.
- Over the results screen of an online run the same keys and button work.

## Driving it with toot-verify + verify-browser

Preconditions:

- Baseline preconditions from the README.
- The browser player has created a room: `Create room` -> `getByRole('button', { name: /^1 Lazy River/ })` -> `waitForURL(/\?room=[A-Z]{4}/)`. Call the code `CODE` and the evidence folder `EV`.
- The room has at most 1 other player (4 is the cap, and departed bots hold seats for 30 s).

- **Receive.** Start a bot in the background: `$T bot --room CODE --name Bubbles --say "hello from the bot" --stay 60 --out EV/chat-bot.jsonl`. In the browser `getByText('hello from the bot').first().waitFor()`. The line shows bottom-left prefixed `Bubbles` and as a bubble over a hippo. Screenshot `chat-01-bot-line-received.png`.
- **Hold and aim.** `page.mouse.move(640, 360)`, `keyboard.down('q')`, wait 400 ms, `page.mouse.move(<wheel centre x + 0.4 × width>, <centre y>, { steps: 5 })` (the wheel is `.chat-wheel`); `Go right ➡️` is highlighted and in the hub (screenshot `chat-02-wheel-aim.png`); `keyboard.up('q')`. The dialog `Quick chat` detaches and the bot JSONL gets `{"type":"chat","lines":[{"name":"<your name>","text":"Go right ➡️"}]}`.
- **Tap Q and a number.** `press('q')`; the dialog stays; `press('5')` sends `Stop tooting! ✋` and closes it.
- **Typed line.** `press('t')`; `getByPlaceholder('Say something…')` is focused; `pressSequentially('typed by the verifier')`; `press('Enter')`. The box detaches, the line appears in the log, and the bot JSONL receives it.
- **Mute.** With a second bot that speaks twice (`$T bot --room CODE --name Pudding --say "before mute" --say "after mute" --gap 8000 --stay 30 --out EV/chat-bot-late.jsonl`, background): after `before mute` shows, press `t`, then click `getByRole('button', { name: 'Pudding', exact: true })`. It gets `aria-pressed="true"` and strikethrough. `press('Escape')` closes the box. After the store shows `after mute` arrived (`sessionInfo.chat`), `getByText('after mute')` count is 0. Screenshots `chat-04`, `chat-05`.
- **History.** The `Pudding` bot's first `chat` message has `"history":true` and contains the earlier lines in order.
- **Esc.** After closing the wheel with `Escape`, `getByText('Leave room CODE')` count is 0 (pause menu did not open) and the Chat button has `aria-expanded="false"`.
- **Flood limit.** Six times: `press('q')`, wait for the `Quick chat` dialog, `press(String(i))`. Lines 1–5 send; on the 6th `getByText('Easy there!')` appears and the wheel stays open. Screenshot `chat-06-flood-limit-toast.png`. Wait 10 s before chatting again.
- **Censor.** `$T bot --room CODE --name Mudpie --say "this river is shit" --stay 3 --out EV/chat-bot-censor.jsonl`. The JSONL shows the server broadcast `this river is s***`. In the browser press `t` (the open text box shows the last 8 lines) and find `/this river is s\*\*\*/`; `getByText('this river is shit')` count is 0.
- **Touch.** New phone context (see SKILL.md) on `http://127.0.0.1:<web port>/?room=CODE`. `getByRole('button', { name: 'Chat', exact: true }).tap()`; the `Quick chat` dialog stays open; tap `getByRole('button', { name: 'GG 🦛' })`. The desktop page shows `GG 🦛` from the phone player's name. For press-slide-release, send raw touches through CDP (`Input.dispatchTouchEvent` touchStart on the button, touchMoves to a line, touchEnd), since `tap()` can't hold. Close the context.
- **Proof.** `browser_snapshot` to `EV/chat-final.aria.yml`; `browser_evaluate` of `sessionInfo.chat`, `roster` and `muted` to `EV/chat-final.store.json`. Together with the three bot JSONLs they show every line, who received it, and the censored text.

## Gotchas

- The closed log drops lines after 8 s. To find an older line, open the text box (`t`), which shows the last 8 without timing out, or read the bot JSONL.
- Number keys only send while the wheel is open; with the text box focused they type digits.
- The wheel only aims once the mouse has moved 8 px since it opened, so move the mouse after `keyboard.down('q')`, not before.
- `getByRole('button', { name: /Lazy River/ })` matches two cards; anchor it with `^1 `.
- The touch layout is decided at page load. Resizing a desktop page never shows the phone `Chat` button; use an `isMobile`/`hasTouch` context.
- A fresh phone profile shows the `Hippo school` checklist, and the open text box covers it on an 844×390 screen. That's what a first-time phone player sees, not a harness artefact.
- Muting is per device and per room session; it resets on reload.
- Bots joining quickly in a row count against the 4-seat cap while away (30 s). If a join fails with `Room CODE already has 4 hippos.`, wait or make a new room.
