#!/usr/bin/env bash
set -euo pipefail

# scripts/logs.sh [<region>|all] [--since TIME] [--until TIME] [--caddy]
#
# Prints a region's server event log as JSON lines (one object per event; see the analyze-toot-together skill for
# the events). --caddy prints Caddy's access log instead, each line tagged with its region. TIME is anything
# `date -d` on the box understands ("2026-10-28 04:00", "3 hours ago"), in UTC; the default is the last 24 hours.
# Read-only: nothing on the box changes.

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi

TARGET=all
SINCE="24 hours ago"
UNTIL=now
CADDY=0
while [ $# -gt 0 ]; do
  case $1 in
    --since) SINCE=$2; shift 2 ;;
    --until) UNTIL=$2; shift 2 ;;
    --caddy) CADDY=1; shift ;;
    -*) echo "Unknown option $1" >&2; exit 1 ;;
    *) TARGET=$1; shift ;;
  esac
done

if [ "$TARGET" = all ]; then
  IDS=$(node -e 'for (const r of require("./regions.json")) console.log(r.id)')
else
  IDS=$TARGET
fi

for ID in $IDS; do
  HOST_VAR="DEPLOY_HOST_$ID"
  HOST=${!HOST_VAR:?$HOST_VAR is not set; copy .env.example to .env.local and fill it in}
  if [ "$CADDY" = 1 ]; then
    # Rolled files are gzipped; zcat -f reads both. Caddy's `ts` is in Unix seconds.
    ssh "$HOST" "FROM=\$(date -ud '$SINCE' +%s); TO=\$(date -ud '$UNTIL' +%s); sudo -n sh -c 'zcat -f /var/log/caddy/access*.log* 2>/dev/null' | awk -v from=\$FROM -v to=\$TO 'match(\$0, /\"ts\":[0-9.]+/) { ts = substr(\$0, RSTART + 5, RLENGTH - 5); if (ts >= from && ts <= to) print }'" |
      jq -c --arg region "$ID" '. + {region: $region}'
  else
    # The service also prints a few human lines; the events are the ones that are JSON objects.
    ssh "$HOST" "sudo -n journalctl -u toot-together -o cat -q --since \"\$(date -ud '$SINCE' '+%F %T')\" --until \"\$(date -ud '$UNTIL' '+%F %T')\"" |
      grep '^{' || true
  fi
done
