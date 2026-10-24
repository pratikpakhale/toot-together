# Notes for agents

## Deploying

Production is a single Ubuntu VM provisioned with `deploy/setup-server.sh`. Caddy handles HTTPS and proxies WebSockets to the Node server, which runs as the systemd service `toot-together`. Where it lives comes from `.env.local` (`DEPLOY_HOST`, `DEPLOY_URL`; see `.env.example`). Neither file is committed.

**Details of the owner's production instance (host, SSH, DNS, live URLs) are in `AGENTS.local.md`.** If that file exists, read it before any deploy or production check. If it doesn't, there is no production instance for you to touch.

- **Only deploy when the user asks.** Never commit or push without their go-ahead either.
- **Never deploy while anyone is on production.** Check `curl -s $DEPLOY_URL/health` first: if `sockets` is above 0, someone is in a room (or watching on `/hippocam`), so don't deploy. That holds for a one-line fix too, and parked rooms (below) are no reason to go ahead. Tell the user who's on (`$DEPLOY_URL/hippocam` lists every live room) and wait until it's empty. `scripts/deploy.sh` checks this itself and refuses to run while anyone is connected.
- **Deploy with `scripts/deploy.sh`** from the repo root. It builds locally (typecheck included), uploads a release, restarts the service and waits for `/health`. It ships whatever is on disk, including other threads' unfinished work, so run `pnpm test` and `pnpm build` first and mention anything half-done.
- **Parked rooms are a safety net, not permission to deploy.** On shutdown the server parks every room in `/var/lib/toot-together/rooms.json`, and the new process picks them up, so a crash or an unplanned restart doesn't throw everyone out. It is no reason to deploy over players. Even when it works they freeze for several seconds (3–5 s measured on the box), and it can't cover three cases:
  - A release that changes the simulation's state (fields of `Sim`, its players or its raft). Those rooms are dropped, the log says `Room XXXX not restored`, and their players end up back on the menu.
  - A protocol change. Open pages keep running the old client until they reload. If `PROTOCOL_VERSION` was bumped, the server refuses them on reconnect and they reload onto the new release once.
  - A restart that takes longer than the 30 s seat hold. The new process ignores the parked rooms.
- **Changes under `deploy/`** (service, Caddyfile, setup) take effect only after re-running the setup on the box: copy `deploy/` over and run `sudo bash setup-server.sh <domain> [redirect domains…]` with the same domains as before (`AGENTS.local.md` has the exact line). It is safe to re-run.
- **Redirect domains** (www, domains the game moved from) 301 to the main one, keeping path and query, and still proxy `/ws` for pages opened before a move.
- **Logs:** `ssh $DEPLOY_HOST journalctl -u toot-together -f`
- **Analytics:** production builds send PostHog events only when `VITE_POSTHOG_KEY` is set in `.env.local`.

## Testing

Test with `pnpm test` (vitest; `tests/handoff.test.ts`, `tests/chat.test.ts` and `tests/race-room.test.ts` spawn real servers), node scripts against `pnpm dev`, `pnpm typecheck`, and `pnpm react-doctor` (React Doctor: errors fail it, warnings are advisory; `--no-score` keeps results off react.doctor's servers).

## Design

Toot Together is a party game for friends, played on phones held in landscape (both thumbs busy with the joystick and TOOT) and on laptops (hands on WASD and Space). It works when a room of friends is laughing together, so the UI should stay out of the way of the run and make talking, picking a raft and starting again effortless. Most UI is touched mid-run, so every in-game control has to work in under a second without looking away from the river.

The look is chunky, cheeky and toy-like: thick ink outlines, candy colours, a bouncy display font, everything like a plastic toy you could pick up. References: Fall Guys (bubbly, colourful, readable at a glance) and the Valorant ping wheel (structure and speed of in-game comms).

- **Never make a player look away.** In-game UI is glanceable, fixed in place and driven by muscle memory: the same thing always lives in the same spot.
- **Thumbs and keys first.** Every action has a fast path for a held thumb and a held key; tapping through menus is the fallback.
- **Use the game's own toy box.** The icon set, ink outlines and display font. Add to them rather than reaching for unicode arrows and checkmarks, default form widgets or flat, thin, SaaS-dashboard UI.
- **Scale to a full room.** Anything listing players stays tidy with 16 hippos on 4 rafts; panels must not grow with player count and push the game out of view.
- **Accessibility:** respect `prefers-reduced-motion`, tell rafts apart by shape as well as colour, make touch targets at least 44 px, and keep in-game text at 13 px or more.

## Agent files

`AGENTS.md` and `.agents/skills/` are the source of truth for every agent. `.claude` is a symlink to `.agents` so Claude Code finds the skills; don't put content in it. Keep anything specific to the owner's machine or servers in `AGENTS.local.md`, never in committed files.
