# Notes for agents

## Deploying

Production is a single Ubuntu VM provisioned with `deploy/setup-server.sh`. Caddy handles HTTPS and proxies WebSockets to the Node server, which runs as the systemd service `hippo-toot`. Where it lives comes from `.env.local` (`DEPLOY_HOST`, `DEPLOY_URL`; see `.env.example`). Neither file is committed.

**Details of the owner's production instance (host, SSH, DNS, live URLs) are in `AGENTS.local.md`.** If that file exists, read it before any deploy or production check. If it doesn't, there is no production instance for you to touch.

- **Only deploy when the user asks.** Never commit or push without their go-ahead either.
- **Check for players first.** `curl -s $DEPLOY_URL/health` shows `rooms` and `sockets`, and `$DEPLOY_URL/hippocam` lists every live room. Deploy when nobody is mid-run if you can; otherwise tell the user who's playing and let them decide.
- **Deploy with `scripts/deploy.sh`** from the repo root. It builds locally (typecheck included), uploads a release, restarts the service and waits for `/health`. It ships whatever is on disk, including other threads' unfinished work, so run `pnpm test` and `pnpm build` first and mention anything half-done.
- **Rooms survive a restart.** On shutdown the server parks every room in `/var/lib/hippo-toot/rooms.json`, and the new process picks them up. Players freeze for a few seconds (3–5 s measured on the box), reconnect with their seat tokens and carry on. Two things it can't cover:
  - A release that changes the simulation's state (fields of `Sim`, its players or its raft). Those rooms are dropped, the log says `Room XXXX not restored`, and their players end up back on the menu. Deploy those only when the server is quiet.
  - A protocol change. Open pages keep running the old client until they reload.
- **Changes under `deploy/`** (service, Caddyfile, setup) take effect only after re-running the setup on the box: copy `deploy/` over and run `sudo bash setup-server.sh <domain> [redirect domains…]` with the same domains as before (`AGENTS.local.md` has the exact line). It is safe to re-run.
- **Redirect domains** (www, domains the game moved from) 301 to the main one, keeping path and query, and still proxy `/ws` for pages opened before a move.
- **Logs:** `ssh $DEPLOY_HOST journalctl -u hippo-toot -f`
- **Analytics:** production builds send PostHog events only when `VITE_POSTHOG_KEY` is set in `.env.local`.

## Testing

Test with `pnpm test` (vitest; `tests/handoff.test.ts` spawns real servers), node scripts against `pnpm dev`, and `pnpm typecheck`.

## Agent files

`AGENTS.md` and `.agents/skills/` are the source of truth for every agent. `CLAUDE.md` and `.claude` (a symlink to `.agents`) exist only because Claude Code looks there, so don't put content in them. Keep anything specific to the owner's machine or servers in `AGENTS.local.md`, never in committed files.
