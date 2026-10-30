# Recipes

Tested queries. `$PH` is `scripts/ph.mjs`; change the windows to fit the question.

## PostHog

**Daily funnel, with likely bots counted apart.** People by the day they first showed up in the window.

```sql
with p as (
  select person_id, toDate(min(timestamp)) first_day,
    countIf(event in ('game_started', 'river_started')) > 0 started,
    countIf(event = 'run_finished') > 0 finished,
    countIf(event in ('$autocapture', 'game_started')) = 0 and any(properties.$device_type) = 'Desktop' likely_bot
  from events where {game} and timestamp > now() - interval 7 day
  group by person_id
)
select first_day, count() visitors, countIf(likely_bot) bots, countIf(started) started, countIf(finished) finished
from p group by first_day order by first_day
```

**Where people come from, and whether they play.**

```sql
select coalesce(nullIf(person.properties.$initial_referring_domain, '$direct'), 'direct') source,
  count(distinct person_id) visitors,
  count(distinct if(event = 'game_started', person_id, null)) started,
  count(distinct if(event = 'run_finished', person_id, null)) finished
from events where {game} and timestamp > now() - interval 7 day
group by source order by visitors desc limit 20
```

`html-classic.itch.zone` is the itch.io embed. Swap `source` for `properties.$browser`, `properties.$os` or `properties.$geoip_country_code` to split by those.

**Where runs are abandoned.**

```sql
select properties.course course, properties.mode mode, properties.phase phase,
  count() quits, round(avg(toFloat(properties.progress)), 2) avg_progress, round(avg(toFloat(properties.deaths)), 1) avg_deaths
from events where {game} and event = 'run_quit' and timestamp > now() - interval 7 day
group by course, mode, phase order by quits desc limit 50
```

**Deaths and time per finished run, solo vs online.**

```sql
select properties.course course, properties.mode mode, count() runs,
  round(avg(toFloat(properties.deaths)), 1) avg_deaths, round(median(toFloat(properties.deaths)), 1) median_deaths,
  round(avg(toFloat(properties.time)) / 60, 1) avg_mins
from events where {game} and event = 'run_finished' and timestamp > now() - interval 30 day
group by course, mode order by course, mode
```

**Who is in a burst.** Everyone active in a window, with where they are, how they arrived and when each was first seen.

```sql
select person_id, min(timestamp) first_in_window, any(properties.$geoip_city_name) city,
  any(properties.$geoip_country_code) cc, any(properties.$device_type) device, any(properties.$browser) browser,
  any(properties.$current_url) url, any(person.properties.$initial_referring_domain) first_source,
  countIf(event = 'game_started') starts, countIf(event = 'run_finished') finishes
from events where {game} and timestamp > now() - interval 2 hour
group by person_id order by first_in_window
```

Then, for those people, `select person_id, min(timestamp) from events where {game} and person_id in (…) group by person_id` tells new from returning.

**Getting players out of Instagram's and Facebook's browsers.** Prompts shown, taps by route, Not now, and pages that arrived in a real browser. Arrivals are new people (another browser), so compare counts, not people. Before 2026-10-30 the prompt only showed in-game and nothing counted arrivals.

```sql
select properties.app app, properties.$os os,
  countIf(event = 'in_app_prompt_shown' and properties.where = 'menu') shown_on_arrival,
  countIf(event = 'in_app_prompt_shown' and properties.where = 'game') shown_in_game,
  countIf(event = 'open_in_browser' and properties.via != 'copy') tapped_open,
  countIf(event = 'open_in_browser' and properties.via = 'copy') copied,
  countIf(event = 'in_app_prompt_stayed') stayed,
  countIf(event = 'open_in_browser_arrived') arrived
from events where {game} and timestamp > now() - interval 7 day
  and event in ('in_app_prompt_shown', 'open_in_browser', 'in_app_prompt_stayed', 'open_in_browser_arrived')
group by app, os order by app, os
```

`os` on `open_in_browser_arrived` is the real browser's, which matches the phone. For whether in-app players still play, split the funnel recipe by `match(properties.$raw_user_agent, 'Instagram|FBAN|FBAV|FB_IAB')` and `properties.$os`.

**Online errors.**

```sql
select toDate(timestamp) d, properties.code code, properties.close close, properties.opened opened, properties.server server,
  count() n, count(distinct person_id) people
from events where {game} and event = 'online_error' and timestamp > now() - interval 7 day
group by d, code, close, opened, server order by d, n desc
```

**Which region serves which players.** From the menu probe: the ping every country gets from each region, and how many are far from both. Add a column per region as regions are added.

```sql
select properties.$geoip_country_code cc, count(distinct person_id) people,
  round(quantile(0.5)(toFloat(properties.ping_IN))) in_median, round(quantile(0.5)(toFloat(properties.ping_US))) us_median,
  round(quantile(0.9)(least(toFloat(coalesce(properties.ping_IN, 9999)), toFloat(coalesce(properties.ping_US, 9999))))) best_p90,
  countIf(least(toFloat(coalesce(properties.ping_IN, 9999)), toFloat(coalesce(properties.ping_US, 9999))) > 150) over_150ms
from events where {game} and event = 'region_pings' and timestamp > now() - interval 30 day
group by cc order by people desc limit 30
```

**Lag in real runs, by server and outcome.** Do laggy runs end in quits?

```sql
select substring(properties.room_code, 1, 2) server, event, count() runs,
  round(quantile(0.5)(toFloat(properties.ping))) ping, round(quantile(0.5)(toFloat(properties.ping_p90))) p90,
  round(avg(toFloat(properties.late)), 3) late
from events where {game} and event in ('run_finished', 'run_quit', 'race_finished') and properties.ping_p90 is not null
  and timestamp > now() - interval 30 day
group by server, event order by server, event
```

**Survey answers.**

```sql
select timestamp, properties.$survey_name survey, properties.$survey_submission_id sub, properties.$survey_questions answers,
  properties.$geoip_country_code cc
from events where {game} and event = 'survey sent' and timestamp > now() - interval 7 day
order by timestamp desc limit 50
```

Keep the last row per `sub`, then read the event timeline of the person just before they answered: it explains most ratings.

**One person's story.**

```sql
select timestamp, event, properties.course, properties.mode, properties.code, properties.deaths, properties.progress
from events where {game} and person_id = '<id>' and event not in ('$autocapture', '$rageclick', '$web_vitals')
order by timestamp limit 500
```

## Server and Caddy logs (DuckDB)

```bash
scripts/logs.sh all --since "7 days ago" > /tmp/server.jsonl
scripts/logs.sh all --since "7 days ago" --caddy > /tmp/caddy.jsonl
duckdb   # then:
```

```sql
SET TimeZone = 'UTC';
create view ev as select * from read_json_auto('/tmp/server.jsonl', union_by_name = true);
```

**Peak concurrency per hour and region.**

```sql
select region, date_trunc('hour', t::timestamptz) h, max(players) peak_players, max(rooms) peak_rooms, max(sockets) peak_sockets
from ev where ev = 'stats' group by all order by h, region;
```

**Ping on each server, minute by minute.** Spikes line up with crowded minutes or one far-away player.

```sql
select region, date_trunc('hour', t::timestamptz) h, max(players) players, median(pingMedian) ping, max(pingP90) p90, max(pingMax) worst
from ev where ev = 'stats' and pingMedian is not null group by all order by h, region;
```

**Where online crews die.** Deaths per tenth of each river, by cause. A spike at one `progress` bucket is one hazard.

```sql
select course, floor(progress * 10) / 10 stretch, cause, count(*) deaths, count(distinct room) rooms
from ev where ev = 'death' group by all order by course, stretch, deaths desc;
```

**Rooms: how big, how long, how many runs.**

```sql
select region, peak, count(*) rooms, round(avg(mins), 1) avg_mins, round(avg(runs), 1) avg_runs, sum(runs = 0) never_finished
from ev where ev = 'room_close' group by all order by region, peak;
```

**Why connections fail.** Sockets that closed without joining, and refusals.

```sql
select code, count(*) n, round(avg(secs), 1) avg_secs from ev where ev = 'close' and room is null and watching is null group by code order by n desc;
select code, why, count(*) n, count(distinct sid) sockets from ev where ev = 'reject' group by all order by n desc;
```

Then look for the failure in Caddy: a page's `unreachable` with no matching `conn` in the server log means the socket died before reaching the game server.

```sql
create view caddy as select * from read_json_auto('/tmp/caddy.jsonl', union_by_name = true);
select region, request.uri uri, status, count(*) n from caddy where request.uri like '/ws%' group by all order by n desc;
select to_timestamp(ts) at_time, region, status, duration, request.client_ip ip from caddy where request.uri like '/ws%' and status <> 101 order by ts;
```

**Join PostHog to the server log by room.**

```bash
$PH --jsonl "select timestamp, person_id, event, properties.room_code room, properties.course course, properties.deaths deaths
  from events where {game} and properties.room_code is not null and timestamp > now() - interval 7 day limit 50000" > /tmp/ph-rooms.jsonl
```

```sql
create view ph as select * from read_json_auto('/tmp/ph-rooms.jsonl');
select r.room, r.peak, r.mins, r.runs, count(distinct ph.person_id) posthog_people
from ev r left join ph on ph.room = r.room where r.ev = 'room_close' group by all order by r.peak desc;
```

Fewer PostHog people than `peak` seats means some players block analytics.
