---
name: verify-toot-together
description: Launch and drive Toot Together (co-op hippo raft browser game, React + react-three-fiber client, Node ws room server) locally the way a player does, and capture proof. Use to verify a change in the browser UI (menu, level select, HUD, chat, pause, couch lobby, /hippocam spectator page) or online rooms, or whenever you need a disposable running copy with bot players. Local only; never production.
---

# Verify Toot Together

Drives a disposable local copy of the game on its own ports, with a browser (the verify browser: whichever Playwright browser MCP server is set up, its tools named `mcp__<server>__browser_*`; `AGENTS.local.md` names the owner's) and headless bot players over the real websocket protocol. Read `features/README.md` and the feature file you need before driving.

**Never drive the production site.** It has real players. Everything here is `127.0.0.1`.

Helper (executable, no install step; uses the repo's own `node_modules`, so `pnpm install` must have been run):

```bash
T=.agents/skills/verify-toot-together/scripts/toot-verify.mjs   # from the repo root
```

| Command | What it does |
| --- | --- |
| `$T up [--web-port N] [--server-port N]` | Starts the room server and vite on free ports (defaults 2667 and 5273), waits until usable, then runs `doctor`. Refuses if a run is already up. |
| `$T doctor` | Read-only. Processes alive, ports owned by our process groups, `/health` ok, page served, and a `watch` socket through vite's `/ws` proxy reaches **our** server. Ends with `DOCTOR OK` or `DOCTOR FAIL`. |
| `$T status` | Prints the run's ports, PIDs, log paths and evidence folder as JSON. |
| `$T bot --name N --room CODE [--say TEXT]... [--gap MS] [--stay S] [--out FILE]` | A second/third player. Joins, says each `--say` line (`--gap` ms apart, default 600), stays `--stay` s (default 20), prints every message except snapshots/events/pongs as JSON lines, and appends them to `--out`. `--create [--course lazy-river]` makes a room instead of joining. `--via server` skips the vite proxy. |
| `$T down` | Kills only the two process groups `up` started (SIGTERM, then SIGKILL), copies the logs into the evidence folder, deletes the scratch state. Evidence stays. |

## Launch

```bash
$T up          # ~5-15 s cold; prints {"ready":true,"web":"http://127.0.0.1:5273/",...} then DOCTOR OK
```

What it runs (same as `pnpm dev`, minus file watching, on other ports):

- Room server: `node --import tsx server/index.ts` with `PORT=<server port>`, `NODE_ENV=development`, and `ROOMS_FILE`/`STATE_DIRECTORY`/`HOST`/`TRUST_PROXY_HEADER` unset, so rooms are never parked to disk and the rate limits key on `127.0.0.1`. Ready when its log says `Toot Together server on` and `/health` answers `{"ok":true,...}`.
- Client: vite with `scripts/vite.verify.config.ts`, which loads the repo's `vite.config.ts` unchanged and overrides only the port (strict), host (`127.0.0.1`), the `/ws` proxy target, and the dependency cache dir. **Why it exists:** the repo config hard-codes the proxy to `ws://localhost:2567`, so a plain `vite --port X` would send every websocket to the user's own `pnpm dev` server. Ready when vite logs `ready in` and serves `/src/client/main.tsx`.
- No seed data exists or is needed: there is no database. Rooms live in server memory; progress, name and tutorial state live in the browser's `localStorage` (`toot-together:settings`, the progress store) and the seat token in `sessionStorage` (`toot-together:seat`).

Isolation: two runs can coexist with the user's `pnpm dev` (5173/2567). The helper allows one verification run at a time (`/tmp/verify/toot-together/current.json`). Vite serves the working tree live, so uncommitted edits by other threads show up mid-run; `doctor` prints the checkout's dirty count.

If `up` fails it prints both log tails. Run `$T down` before retrying, every time.

## Doctor

Run `$T doctor` first whenever anything looks off (blank page, "Can't reach the game server", rooms that never appear). A `FAIL` on the proxy line means the page's websockets go somewhere else: do not trust any online result until it passes.

## Drive

Browser: the tools you need are `browser_navigate`, `browser_snapshot`, `browser_run_code_unsafe`, `browser_take_screenshot`, `browser_evaluate` and `browser_press_key` (load them first if your agent defers MCP tools). `browser_run_code_unsafe` with Playwright locators is the most reliable way to chain steps and wait on UI state.

- Open `http://127.0.0.1:<web port>/` (from `$T status`). Main menu handles: textbox `YOUR HIPPO NAME`, buttons `Play solo`, `Couch party (1–4)`, `Create room`, textbox with placeholder `CODE` + button `Join`, `How to play`, `Settings`.
- Level select (title `CHOOSE A RIVER`): level cards are buttons whose names start with the number, so use `getByRole('button', { name: /^1 Lazy River/ })`. `/Lazy River/` alone also matches the locked Canyon Run card ("Finish Lazy River to unlock.").
- In a run: keys go to `window` while no input has focus. `Esc` pause menu, `R` respawn, `A`/`D` walk, `Space` toot, `Shift` burst, `Q` quick chat, `T` type chat. HUD chip `ROOM <CODE>` (button titled `Copy invite link`), crew list bottom-right with `(you)`, `(reconnecting)` and a `Host` crown.
- Observing only: in dev, `window.__toot.useApp.getState()` exposes `screen`, `overlay`, `sessionInfo` (`roomCode`, `status`, `roster`, `chat`), `muted`, `settings`. Use it to assert and to dump state into evidence. **Never call its setters to make something happen**; proofs act through clicks and keys.
- Phone UI: touch layout is fixed at page load from `matchMedia('(pointer: coarse)')`, so resizing does nothing. In `browser_run_code_unsafe`:
  ```js
  const ctx = await page.context().browser().newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })   // 2 = 4x the pixels to render
  const phone = await ctx.newPage(); await phone.goto(url)   // use locator.tap()
  ```
  Variables don't survive between calls; find it again with `page.context().browser().contexts()`. Close every extra context before you finish. A new context is also the way to get a second real browser player (fresh `localStorage`/`sessionStorage`).
- Other players: `$T bot ...` (run it in the background when it must stay in the room while you drive the browser). Bots that send no `input` just float idle, which the server allows.

## Keep it cheap (CPU and heat)

The game redraws a full three.js scene 60 times a second, and a headless page counts as visible, so Chrome never throttles it. How much that costs depends on what renders WebGL:

- **Headless Chromium emulates the GPU on the CPU by default.** A Playwright config with `headless: true` and no `args` renders WebGL with `ANGLE (… SwiftShader driver)`, and Chrome's GPU process then runs at several hundred % CPU while a game page is open.
- **`--use-angle=metal` (macOS) or `--enable-gpu` at launch moves WebGL onto the real GPU.** `--ignore-gpu-blocklist` alone doesn't. These are launch flags: no page, context or `browser_run_code_unsafe` call can change them on a browser that is already running.
- **The browser MCP's config is usually shared with every project and other threads, so ask the user before changing it.** The change is `"launchOptions": { "headless": true, "args": ["--use-angle=metal"] }` in its Playwright config, and it applies only after the MCP server restarts (a new agent session). `AGENTS.local.md` says where the owner's config lives.

Check which renderer you have before a long drive. This uses its own throwaway context, so it doesn't touch anyone's pages:

```js
// browser_run_code_unsafe
async (page) => {
  const ctx = await page.context().browser().newContext()
  try {
    const p = await ctx.newPage()
    await p.setContent('<canvas id=c></canvas>')
    return await p.evaluate(() => { const gl = document.getElementById('c').getContext('webgl'); return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) })
  } finally { await ctx.close() }
}
```

`SwiftShader` means every open game page burns several CPU cores. Whichever renderer you have:

- Leave a game page only while you are driving it. Go to `about:blank` and close extra contexts as soon as a step's evidence is captured, not at the end of the session.
- Use the smallest viewport the check allows (`browser_resize` to 960×540 for desktop UI), and `deviceScaleFactor: 1` for phone contexts unless the check is about sharpness. A factor of 2 is four times the pixels.
- Pick **Settings › Graphics › Fast** in the verify browser unless the change under test is about visuals. It persists in that browser's `localStorage`.
- Don't park a phone context or a second player tab while you do something else. Each one renders on its own.

## Evidence

Everything goes to the run's evidence folder, printed by `up`/`status`: `/tmp/verify/toot-together/evidence/<runId>/`. It is outside the repo (no `.gitignore` entry needed) and `down` never deletes it. `down` adds `server.log`, `web.log` and `run.json` to it.

Name files `<feature>-NN-<what>.png|.aria.yml|.json|.jsonl`. A proof needs:

- The action and the resulting state: a screenshot before and after (`page.screenshot({ path })` or `browser_take_screenshot` with `filename`), not only the final frame.
- An ARIA snapshot of the end state (`browser_snapshot` with `filename`), plus a store dump if it helps (`browser_evaluate` with `filename`).
- The side effect from the other end: what another player received. Bot `--out` JSONL is the record of what the server actually broadcast (censoring, history, roster). For room lifecycle also check `curl -s http://127.0.0.1:<server port>/health`.
- The real user path: menus, keys, taps, invite links. Not `useApp` setters, not hand-crafted websocket messages from the page. Bots stand in for *other people*, never for the player under test.

Screenshots can only be written under `/tmp/verify` or the repo.

## Cleanup

```bash
# browser: close extra contexts, then leave the page so it stops reconnecting
#   browser_run_code_unsafe: for (const c of page.context().browser().contexts()) if (c !== page.context()) await c.close()
#   browser_navigate about:blank
$T down
ls /tmp/verify/toot-together/evidence/<runId>/   # evidence must still be there
```

`down` only signals the process groups recorded at `up` (both are started detached, so each is its own group that includes tsx's/vite's esbuild children). Never `pkill node`/`vite`/`tsx`: the user may be running `pnpm dev`. Background bots exit on their own after `--stay`. Run `down` after every failed attempt too.

## Gotchas

- Browser `localStorage` persists across runs in the shared verify browser: the generated name, unlocked levels, medals and `tutorialDone` carry over. Type the name you want into `YOUR HIPPO NAME`; use a new browser context when you need a first-time player (Hippo school, only Lazy River unlocked).
- Server limits all apply to `127.0.0.1`: 8 room creates per minute, 20 failed joins per minute, 24 sockets per IP, 4 players per room. Many quick runs will hit `Slow down!`; wait a minute.
- A player who disconnects (bot ending, page closed) keeps their seat for 30 s, shown as `(reconnecting)`, and still counts towards the 4-player cap. Empty rooms close 60 s after the last player leaves.
- Production-only behaviour is not covered: the PWA service worker and PostHog analytics only run in `pnpm build` output, and Caddy/TLS/`TRUST_PROXY_HEADER` only exist on the VM. Don't use `pnpm build && pnpm start` to cover them: the build overwrites `dist/` that the deploy script ships, and with `VITE_POSTHOG_KEY` in `.env.local` the production client sends analytics to the real PostHog project.
- Under SwiftShader (see *Keep it cheap*) frames are slow and late, so the HUD ping can read 150–350 ms locally. It's the renderer, not the network.

## Feature map

`features/README.md` indexes the verified journeys. Keep it current; `/maintain-verification-skill` exists for that.
