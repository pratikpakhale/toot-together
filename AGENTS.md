# Notes for agents

## Deploying

Production is one game server per region plus the page on Vercel. `regions.json` lists the regions: an id (two capital letters), a name and the server's public URL. A room code starts with its region's id (`INBEAN`), and that's how the page knows which server to connect to. The first region is the default, and a single region needs no further setup. Each region is an Ubuntu VM provisioned with `deploy/setup-server.sh`: Caddy handles HTTPS and proxies WebSockets to the Node server, which runs as the systemd service `toot-together` with `REGION` set to its id. The SSH target of each box comes from `.env.local` (`DEPLOY_HOST_<ID>`; see `.env.example`), which isn't committed.

**Details of the owner's production instance (host, SSH, DNS, live URLs) are in `AGENTS.local.md`.** If that file exists, read it before any deploy or production check. If it doesn't, there is no production instance for you to touch.

- **Only deploy when the user asks.** Never commit or push without their go-ahead either.
- **Never deploy a server while anyone is on it.** Check `curl -s <region url>/health` first: if `sockets` is above 0, someone is in a room (or watching on `/hippocam`), so don't deploy. That holds for a one-line fix too, and parked rooms (below) are no reason to go ahead. Tell the user who's on (`/hippocam` lists every live room, with a tab per region) and wait until it's empty. `scripts/deploy.sh` checks this itself and refuses to run while anyone is connected.
- **Deploy a server with `scripts/deploy.sh <ID>`** from the repo root, one region at a time. It builds locally (typecheck included), uploads a release, restarts the service and waits for `/health`. It ships whatever is on disk, including other threads' unfinished work, so run `pnpm test` and `pnpm build` first and mention anything half-done.
- **Deploy the page with `scripts/deploy.sh web`.** It builds locally and ships the build to Vercel with the Vercel CLI (`vercel link` once per checkout). `vercel.json` turns off Vercel's deploys on push, so the page only changes when this runs. One page talks to every region, so after a `PROTOCOL_VERSION` bump, deploy every server first and the page last. The script refuses to ship the page while any region still reports the old protocol on `/health`.
- **Parked rooms are a safety net, not permission to deploy.** On shutdown the server parks every room in `/var/lib/toot-together/rooms.json`, and the new process picks them up, so a crash or an unplanned restart doesn't throw everyone out. It is no reason to deploy over players. Even when it works they freeze for several seconds (3–5 s measured on the box), and it can't cover three cases:
  - A release that changes the simulation's state (fields of `Sim`, its players or its raft). Those rooms are dropped, the log says `Room XXXX not restored`, and their players end up back on the menu.
  - A protocol change. Open pages keep running the old client until they reload. If `PROTOCOL_VERSION` was bumped, the server refuses them on reconnect and they reload onto the new release once.
  - A restart that takes longer than the 30 s seat hold. The new process ignores the parked rooms.
- **Hippocam is locked.** Every server checks `HIPPOCAM_KEY` on each watch (the room list and spectating); a wrong key is refused and logged as `hippocam_denied`. The key lives in a root-only systemd drop-in that `setup-server.sh` writes when run with `HIPPOCAM_KEY=…` in its environment, and the page asks for it once. Without it a production server refuses every watch; in development hippocam stays open.
- **Play with anyone** puts strangers in public co-op rooms on the nearest region, which bots top up while a human floats alone. Players are never told which hippos are bots; only hippocam and the server log (`bot_join`/`bot_leave`) say. The bots live in `server/bots.ts`.
- **Changes under `deploy/`** (service, Caddyfile, setup) take effect only after re-running the setup on the box: copy `deploy/` over and run `sudo bash setup-server.sh <region> <domain> [redirect domains…]` with the same region and domains as before (`AGENTS.local.md` has the exact line). It is safe to re-run.
- **Redirect domains** (www, domains the game moved from) 301 to the main one, keeping path and query, and still proxy `/ws` for pages opened before a move.
- **Logs:** the server writes one JSON line per event (sockets, rooms, joins, refusals, runs, deaths, minute stats) to journald, and Caddy keeps a JSON access log. `scripts/logs.sh [<ID>|all] [--since T] [--caddy]` pulls either, read-only; `ssh $DEPLOY_HOST_<ID> journalctl -u toot-together -f` follows live.
- **Analysis:** the `analyze-toot-together` skill answers questions about players and servers from PostHog and those logs.
- **Analytics:** production builds send PostHog events only when `VITE_POSTHOG_KEY` is set in `.env.local`. Player feedback goes through two PostHog API surveys the game draws itself (`VITE_POSTHOG_RUN_SURVEY`, `VITE_POSTHOG_FEEDBACK_SURVEY`; see `.env.example`); without them the results row and Feedback buttons stay hidden.

## Testing

Test with `pnpm test` (vitest; `tests/handoff.test.ts`, `tests/chat.test.ts`, `tests/race-room.test.ts` and `tests/regions.test.ts` spawn real servers), node scripts against `pnpm dev`, `pnpm typecheck`, `pnpm lint` (Biome: formatting, lint and import order; `pnpm format` fixes what it can. Accessibility and hook rules are off there because React Doctor owns them; `src/sim/courses.ts` keeps its hand-laid river layouts unformatted), `pnpm knip`, and `pnpm react-doctor` (React Doctor: errors fail it, warnings are advisory; `--no-score` keeps results off react.doctor's servers).

## Design

Toot Together is a party game for friends, played on phones held in landscape (both thumbs busy with the joystick and TOOT) and on laptops (hands on WASD and Space). It works when a room of friends is laughing together, so the UI should stay out of the way of the run and make talking, picking a raft and starting again effortless. Most UI is touched mid-run, so every in-game control has to work in under a second without looking away from the river.

The look is chunky, cheeky and toy-like: thick ink outlines, candy colours, a bouncy display font, everything like a plastic toy you could pick up. References: Fall Guys (bubbly, colourful, readable at a glance) and the Valorant ping wheel (structure and speed of in-game comms).

- **Never make a player look away.** In-game UI is glanceable, fixed in place and driven by muscle memory: the same thing always lives in the same spot.
- **Thumbs and keys first.** Every action has a fast path for a held thumb and a held key; tapping through menus is the fallback.
- **Use the game's own toy box.** The icon set, ink outlines and display font. Add to them rather than reaching for unicode arrows and checkmarks, default form widgets or flat, thin, SaaS-dashboard UI.
- **Scale to a full room.** Anything listing players stays tidy with 16 hippos on 4 rafts; panels must not grow with player count and push the game out of view.
- **Accessibility:** respect `prefers-reduced-motion`, tell rafts apart by shape as well as colour, make touch targets at least 44 px, and keep in-game text at 13 px or more.

## Agent files

`AGENTS.md` and `.agents/skills/` are the source of truth for every agent. `.claude` is a symlink to `.agents` so Claude Code finds the skills; don't put content in it. Keep anything specific to the owner's machine or servers (SSH targets, IPs, accounts, DNS) in `AGENTS.local.md`, never in committed files. The one exception is the servers' public URLs, which every player's browser sees anyway: they live in `regions.json`.
