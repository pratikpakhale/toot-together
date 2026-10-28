---
name: analyze-toot-together
description: Analyse Toot Together's players and production servers from three read-only sources (PostHog product analytics, each game server's JSON event log, Caddy access logs), queried with HogQL, jq and DuckDB. Use for questions about traffic, players, funnels, drop-off, sources, rivers, online rooms, connection errors, server health, a sudden spike or dip, or a "how is the game doing" report.
---

# Analyze Toot Together

Three sources, all read-only. Every timestamp is UTC.

| Source | What it knows | How to get it |
| --- | --- | --- |
| **PostHog** (project in `.env.local`) | Every page visit and what players did in the page: who, where from, device, rivers started/finished/quit, online errors, survey answers. | `$PH "<HogQL>"`, or `$PH --jsonl "<HogQL>" > /tmp/x.jsonl` for jq or DuckDB. |
| **Server event log** (journald on each region's box) | What the game servers saw: every socket, room, join, refusal, close code, run start/finish, every death with its position on the river, and minute stats. | `scripts/logs.sh [IN\|US\|all] [--since T] [--until T] > /tmp/server.jsonl` |
| **Caddy access log** (each box) | Every request that reached the box, including ones the game server never answered (502s), and each WebSocket's lifetime. | `scripts/logs.sh … --caddy > /tmp/caddy.jsonl` |

```bash
PH=.agents/skills/analyze-toot-together/scripts/ph.mjs   # from the repo root; settings in .env.local (see .env.example)
```

`EVENTS.md` lists every event and field in all three sources. `RECIPES.md` has tested queries for the common questions; start from one when it fits.

## Steps

1. **Pin the question and the window.** Write down the exact UTC window and what would answer the question (a count, a comparison, a list of people). "Since yesterday" becomes two timestamps.
2. **Pull.** Run the PostHog queries; pull the server logs for the same window when the question touches online play, connections, servers or deaths. The server log starts on the release that added it (2026-10-28); before that only PostHog has data.
3. **Query until every number has its denominator.** "12 finished" is incomplete; "12 of 31 starters (39%)" is the answer. Split by whatever could explain the result: mode (solo/couch/online), river, source, device and browser, new vs returning.
4. **Cross-check across sources.** Online rooms appear in both: PostHog's `room_code` on `run_finished`/`run_quit`/`race_finished` matches `room` in the server log. When they disagree, say which and why (ad blockers drop PostHog events; the server counts every socket).
5. **Report.** Lead with the answer, then the evidence: tables with denominators, the window, and what was excluded. Name each person-level claim's basis (city, device, first-seen date) without names or IPs. End with what to do about it, if anything.

## Gotchas

- **Filter to the game.** The PostHog project holds other apps too. Put `{game}` in every `where`; `ph.mjs` turns it into the hostname filter.
- **Bots.** About a third of "visitors" are link previews and crawlers: desktop, no clicks, no `game_started`, gone in 0 s. Leave them out of conversion rates (`RECIPES.md` has the filter) and say so.
- **River starts are two events.** `game_started` fires when a game begins from the menu (solo, couch, or creating/joining a room); `river_started` fires on Results › Next river. Replays (Play again, Restart) fire neither. Starts per river = both events.
- **`run_quit` exists from 2026-10-28.** Before that, a quit is only visible as a start with no finish.
- **People vs devices.** A PostHog person is one browser. One player on a phone and a laptop is two people.
- **HogQL** caps results at 100 rows without a `LIMIT`, and reserves some aliases (`first`, `new`, `day`); rename on a parse error.
- **DuckDB**: run `SET TimeZone = 'UTC';` first, or timestamps shift to this machine's zone. Read logs with `read_json_auto('/tmp/server.jsonl', union_by_name = true)`, since events have different fields.
- **IPs** are in the server and Caddy logs to group devices on one network and to spot abuse. Never put them in a report.
