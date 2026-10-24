# Notes for agents

## Deploying

Production is a single Ubuntu VM provisioned with `deploy/setup-server.sh`. Caddy handles HTTPS and proxies WebSockets to the Node server, which runs as the systemd service `toot-together`. Where it lives comes from `.env.local` (`DEPLOY_HOST`, `DEPLOY_URL`; see `.env.example`). Neither file is committed.

**Details of the owner's production instance (host, SSH, DNS, live URLs) are in `AGENTS.local.md`.** If that file exists, read it before any deploy or production check. If it doesn't, there is no production instance for you to touch.

- **Only deploy when the user asks.** Never commit or push without their go-ahead either.
- **Never deploy while anyone is on production.** Check `curl -s $DEPLOY_URL/health` first: if `sockets` is above 0, someone is in a room (or watching on `/hippocam`), so don't deploy. That holds for a one-line fix too, and parked rooms (below) are no reason to go ahead. Tell the user who's on (`$DEPLOY_URL/hippocam` lists every live room) and wait until it's empty. `scripts/deploy.sh` checks this itself and refuses to run while anyone is connected.
- **Deploy with `scripts/deploy.sh`** from the repo root. It builds locally (typecheck included), uploads a release, restarts the service and waits for `/health`. It ships whatever is on disk, including other threads' unfinished work, so run `pnpm test` and `pnpm build` first and mention anything half-done.
- **Parked rooms are a safety net, not permission to deploy.** On shutdown the server parks every room in `/var/lib/toot-together/rooms.json`, and the new process picks them up, so a crash or an unplanned restart doesn't throw everyone out. It is no reason to deploy over players. Even when it works they freeze for several seconds (3–5 s measured on the box), and it can't cover two cases:
  - A release that changes the simulation's state (fields of `Sim`, its players or its raft). Those rooms are dropped, the log says `Room XXXX not restored`, and their players end up back on the menu.
  - A protocol change. Open pages keep running the old client until they reload.
- **Changes under `deploy/`** (service, Caddyfile, setup) take effect only after re-running the setup on the box: copy `deploy/` over and run `sudo bash setup-server.sh <domain> [redirect domains…]` with the same domains as before (`AGENTS.local.md` has the exact line). It is safe to re-run.
- **Redirect domains** (www, domains the game moved from) 301 to the main one, keeping path and query, and still proxy `/ws` for pages opened before a move.
- **Logs:** `ssh $DEPLOY_HOST journalctl -u toot-together -f`
- **Analytics:** production builds send PostHog events only when `VITE_POSTHOG_KEY` is set in `.env.local`.

## Testing

Test with `pnpm test` (vitest; `tests/handoff.test.ts` spawns real servers), node scripts against `pnpm dev`, `pnpm typecheck`, and `pnpm doctor` (React Doctor: errors fail it, warnings are advisory; `--no-score` keeps results off react.doctor's servers).

## Agent files

`AGENTS.md` and `.agents/skills/` are the source of truth for every agent. `.claude` is a symlink to `.agents` so Claude Code finds the skills; don't put content in it. Keep anything specific to the owner's machine or servers in `AGENTS.local.md`, never in committed files.
