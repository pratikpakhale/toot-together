# Toot Together

A co-op physics party game for the browser, inspired by *Fart Together*. Up to four hippos share one inflatable raft, and the only way to move it is to toot. Each hippo waddles around the rim and pushes the raft away from its own butt, so everyone's toots add up into one direction and one bad toot ruins it for everyone.

**Play it at https://toottogether.fun**

<img src="trailer/preview.webp" width="800" alt="Trailer: four hippos toot their raft past spinners, Kabir pops it on the spikes, and the crew makes the finish">

## Run it

```bash
pnpm install
pnpm dev            # game on http://localhost:5173, room server on :2567
```

Open the URL, pick a name, and choose a mode:

| Mode | How |
| --- | --- |
| **Play solo** | One hippo, keyboard / gamepad / touch. |
| **Couch party** | Up to 4 hippos on one screen: WASD + Space, Arrows + Enter, and gamepads (press A to join). |
| **Online** | **Create room**, pick a river, then share the 4-letter code or the invite link from the HUD. Friends hit **Join**. |

To play online on your LAN, friends open `http://<your-ip>:5173` (Vite prints it as "Network").

### Production

```bash
pnpm build
pnpm start          # serves the built game + WebSocket rooms on one port ($PORT, default 2567)
```

Any Node host that supports WebSockets will run it (a VPS, Render, Railway, …). It is a single process with no database. Rooms live in memory, so run exactly **one** instance.

### Self-hosting

The repo ships everything for a small VM: Caddy in front for HTTPS and the WebSocket proxy, and the Node server running as the `toot-together` systemd service.

1. Point a domain's A record at a fresh Ubuntu 24.04 VM, and open TCP 80 and 443 in your cloud provider's firewall.
2. Copy `deploy/` to the box and run `sudo bash setup-server.sh <domain> [other domains…]` there. It opens 80/443 in the VM firewall and adds swap, then installs Node 24, pnpm and Caddy. Any other domains (say `www.<domain>`, or one the game moved from) permanently redirect to `<domain>`. It is safe to re-run.
3. Copy `.env.example` to `.env.local` and fill in `DEPLOY_HOST` and `DEPLOY_URL`. `VITE_POSTHOG_KEY` is optional: without it, analytics stay off.

```bash
scripts/deploy.sh                                     # builds locally, uploads a release, restarts, checks /health
ssh <deploy host> journalctl -u toot-together -f         # logs
```

Redeploying restarts the server, but rooms carry over: they're parked in `/var/lib/toot-together/rooms.json` on the way down and restored on the way up, and players reconnect after a few seconds. A release that changes the simulation's state can't restore old rooms, so deploy those when nobody is playing (`/health` shows the room count). See `AGENTS.md` for the full deploy checklist.

## Controls

| | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Walk around the rim (hold) | A / D (P2: ← / →) | D-pad left / right | |
| Stand at the front / back | W / S (P2: ↑ / ↓) | D-pad up / down | |
| Stand where you point | | Left stick | Drag on the left half |
| Toot (hold) | Space (P2: Enter) | A / RT / LT | TOOT |
| Burst | Shift / E (P2: Right Shift) | X / RB / B | BURST |
| Respawn | R | Back/Select | Menu button |
| Menu | Esc / P | Start | Menu button |
| Chat (online) | Q quick lines (then 1–8), T to type | | Chat button |

Hold left or right and your hippo keeps walking around the rim; point the stick and it walks to that spot. Its butt faces outward, so a toot pushes the raft the opposite way. To go forward, stand at the back. The arrow on the water shows where your toot will push.

A lone hippo has the whole rim. In a crew of 2–4, each hippo owns an equal slice (shown in its colour on the raft ring) and stops at the edge of it, so nobody can wander into a teammate's spot. Slices are handed out in seat order and start at the back, so two hippos can always share the forward push.

What's in the game and how it's built: [OVERVIEW.md](OVERVIEW.md).

## License

[MIT](LICENSE)
