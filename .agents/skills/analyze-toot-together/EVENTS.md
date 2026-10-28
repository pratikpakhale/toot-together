# Events and fields

## PostHog

Sent by the page (`src/client/analytics.ts` and its `track(...)` callers; grep there when this list looks stale). Properties live under `properties.<name>`.

| Event | When | Properties |
| --- | --- | --- |
| `game_started` | A game begins from the menu. | Solo/couch: `mode` (`solo`/`couch`), `course`, `players` (on this device). Online: `mode: 'online'`, `room` (`create`/`join`), `region` (server id), `course`, `rafts` (creates only; 1 co-op, 2–4 race). |
| `river_started` | Results › Next river. | `mode` (`solo`/`couch`/`online`), `course` |
| `run_finished` | A co-op or solo run reaches the finish (not races). | `mode`, `course`, `time` (s), `deaths`, `players` (in the run), `medal` (`gold`/`silver`/`bronze`/null), `room_code` and the connection summary (online) |
| `race_finished` | A race ends. | `course`, `rafts`, `players`, `place` (null: out of time or benched), `room_code`, the connection summary |
| `run_quit` | A run left before its finish, through the menu (`how: 'menu'`) or by closing the page (`how: 'closed'`). From 2026-10-28. | `how`, `phase` (`pond`: before the start line, `countdown`, `racing`), `mode`, `race`, `course`, `room_code`, `progress` (0–1 down the river), `deaths`, `time` (s since the start), the connection summary (online) |
| `region_pings` | Once per page, from the main menu: the page times every region to pick the nearest for a new room. Pages that skip the menu (invite links) don't send it. | `ping_<region id>` (ms, median of 3 warm HTTP round trips; null: no answer within 2 s), `fastest` (region id, null if none answered) |
| `online_error` | The player was sent back to the menu with an error notice. | `code`: `not_found` (no such room: typo or closed), `full`, `busy`, `rate_limited`, `expired` (seat given away), `outdated` (shown only if the reload failed), `unreachable` (the socket closed before joining), `disconnected` (lost mid-game and the 30 s reconnect window ran out). From 2026-10-28, `unreachable`/`disconnected` also carry `close` (WebSocket close code, see below), `opened` (whether the socket ever connected) and `server` (region id). |
| `open_in_browser` | The in-app browser prompt's buttons. | `via` (`chrome`/`intent`/`copy`), `app` (Instagram, Facebook, …) |
| `survey shown` / `survey sent` | The game's own survey cards. | `$survey_name` ("Run: how was that river?", "Feedback button"), `$survey_questions` (array of `{question, response}`), `$survey_completed`. A partly answered survey sends twice with one `$survey_submission_id`; keep the last. |
| `$pageview`, `$pageleave` | Page loads and exits. | `$current_url` (`?ref=itch` from itch.io's embed, `?room=XXXXXX` from invite links), `$referrer` |
| `$autocapture`, `$rageclick` | Clicks. TOOT/BURST taps are excluded from 2026-10-28. | `$el_text`, `$elements_chain` |

**Connection summary** (online runs, from the run's start, restart or a race's GO; before that, from joining the room): `ping` (median WebSocket round trip, ms; one sample a second), `ping_p90`, `ping_max`, `late` (share of frames drawn past the newest snapshot, the stutter players feel). Until 2026-10-28, `ping` was the median of the last 5 samples at the finish. The server is the room code's first two letters.

Useful on every event: `$host`, `$device_type` (`Mobile`/`Desktop`/`Tablet`), `$os`, `$browser`, `$screen_width`/`$screen_height` (portrait vs landscape), `$geoip_country_code`, `$geoip_city_name`, `$geoip_subdivision_1_name`, `$session_id`. On the person: `person.properties.$initial_referring_domain` (`$direct` when none), `$initial_current_url`. In-app browsers show up in `$raw_user_agent` (`Instagram`, `FBAN`/`FBAV`, `musical_ly`, `Snapchat`).

## Server event log

One JSON object per line from `server/index.ts`'s `log()`; grep `log('` there for the source of truth. Every line has `t` (ISO time), `ev` and `region`. `sid` is one WebSocket, unique across restarts.

| `ev` | Fields | Notes |
| --- | --- | --- |
| `start` / `stop` | `release`, `protocol`, `rooms` / `signal`, `rooms`, `sockets` | Process start and shutdown (deploys, restarts). |
| `stats` | `sockets`, `rooms`, `players`, `pingMedian`, `pingP90`, `pingMax` (ms; null with nobody on), `rssMb`, `cpu`, `load`, `stealPct`, `tickLateMax` (ms) | Every minute. `players` counts held seats, so concurrency per minute is `max(players)`. The pings are each connected player's latest heartbeat round trip (taken every 5 s). |
| `conn` | `sid`, `ip`, `ua`, `origin` | Every WebSocket that reached the game server. |
| `join` | `sid`, `how` (`create`/`join`/`resume`), `room`, `course`, `player` (id in the room), `players` (seats after joining) | `resume` is a reconnect taking its seat back. |
| `reject` | `sid`, `code` (same codes as `online_error`), `why` (the message shown), `room` when one was named, plus the limit hit (`sockets`, `joins`, `creates`, `rooms`, `v`) | The page shows this as an error notice. |
| `join_timeout` | `sid` | Opened but never asked to join within 10 s. |
| `close` | `sid`, `code`, `reason`, `secs` (socket lifetime), `room`, `player`, `watching` | Every socket's end. No `room`: it never joined. |
| `socket_error` | `sid`, `error` | Protocol errors on a socket (e.g. an oversized message). |
| `watch` | `sid`, `room` (absent: the /hippocam room list) | Spectators. |
| `room_open` / `room_close` | `room`, `course`, `rafts` / `room`, `course` (last river), `mins` (lifetime), `peak` (most seats at once), `runs` (finished) | A room closes 60 s after its last player's seat is released. |
| `room_lost` | `room`, `course`, `players` | A parked room the new release couldn't restore. |
| `course` | `room`, `from`, `to` | The host picked the next river. |
| `run_start` / `run_restart` / `run_finish` | `room`, `course`, `race`; start adds `players`, `rafts`; finish adds `time` (s), `deaths` (all rafts), `players`, `rafts` | Start: co-op crossed the start line, or a race's gate opened. |
| `death` | `room`, `course`, `race`, `raft`, `crew` (hippos on it), `cause`, `s` (metres down the course), `progress` (0–1), `deaths` (that raft's total this run), `time` (s into the run), `blamed` (a hippo got the blame), `rival` (shoved by another raft) | Causes: `spikes`, `spinner`, `mace`, `crusher`, `slider`, `mine`, `piston`, `whirlpool`, `sweeper`, `flame`, `fence`, `gate`, `lightning`, `fall`, `reset`. |

**Close codes**: `4000` left through the menu; `1001` tab closed or navigated away; `1005` closed by the page without a code (after an error notice); `1006` dropped without a goodbye (lost network, phone asleep, killed by the server's 5 s heartbeat); `1012` server restarting.

## Caddy access log

Caddy's JSON access log on each box (`/var/log/caddy/access.log`, rolled at 50 MB, 10 kept); `scripts/logs.sh --caddy` adds `region`. Fields: `ts` (Unix seconds), `status`, `duration` (s), `size`, `request.client_ip`, `request.method`, `request.uri`, `request.headers["User-Agent"][0]`, `request.headers.Origin[0]`.

- `/ws` with `status` 101 is a WebSocket, logged when it closes; `duration` is its lifetime. A `/ws` with 502 means the game server was down or restarting.
- `/ping` is each page load timing the servers to pick the nearest region; `/health` is monitoring (and agents).
