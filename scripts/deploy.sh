#!/usr/bin/env bash
set -euo pipefail

# scripts/deploy.sh <region>  ships the game server to that region's box (ids in regions.json).
# scripts/deploy.sh web       ships the page to Vercel.

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi
TARGET=${1:?usage: scripts/deploy.sh <region id from regions.json> | web}

region_urls() {
  node -e 'for (const r of require("./regions.json")) console.log(r.id, r.url)'
}

if [ "$TARGET" = web ]; then
  command -v vercel >/dev/null || { echo "Install the Vercel CLI (npm i -g vercel) first." >&2; exit 1; }
  [ -f .vercel/project.json ] || { echo "Run 'vercel link' once to pick the Vercel project." >&2; exit 1; }

  # The page talks to every server, so after a protocol change each one must be running it before the page goes out.
  PROTOCOL=$(sed -n 's/^export const PROTOCOL_VERSION = \([0-9]*\)$/\1/p' src/sim/protocol.ts)
  while read -r ID URL; do
    LIVE=$(curl -fs --max-time 5 "$URL/health" | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).protocol ?? "none"))' 2>/dev/null || echo unreachable)
    if [ "$LIVE" != "$PROTOCOL" ]; then
      echo "Not deploying the page: $ID ($URL) speaks protocol $LIVE, this page speaks $PROTOCOL. Deploy the servers first." >&2
      exit 1
    fi
  done < <(region_urls)

  vercel pull --yes --environment=production
  vercel build --prod
  vercel deploy --prebuilt --prod
  exit 0
fi

URL=$(region_urls | awk -v id="$TARGET" '$1 == id { print $2 }')
[ -n "$URL" ] || { echo "No region $TARGET in regions.json." >&2; exit 1; }
HOST_VAR="DEPLOY_HOST_$TARGET"
HOST=${!HOST_VAR:?$HOST_VAR is not set; copy .env.example to .env.local and fill it in}
APP_DIR=/opt/toot-together
RELEASE=$(date -u +%Y%m%d%H%M%S)
KEEP=3

# Never restart the server under players. An unreachable server (down, or never set up) has nobody to lose.
SOCKETS=$(curl -fs --max-time 5 "$URL/health" | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).sockets ?? 0))' 2>/dev/null || echo 0)
if [ "$SOCKETS" -gt 0 ]; then
  echo "Not deploying: $SOCKETS connected on $URL (see $URL/hippocam). Wait until nobody is on." >&2
  exit 1
fi

pnpm build:deploy

ssh "$HOST" "mkdir -p $APP_DIR/releases/$RELEASE"
rsync -az dist dist-server package.json pnpm-lock.yaml "$HOST:$APP_DIR/releases/$RELEASE/"

ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd $APP_DIR/releases/$RELEASE
pnpm install --prod --frozen-lockfile --reporter=silent
ln -sfn $APP_DIR/releases/$RELEASE $APP_DIR/current
sudo systemctl restart toot-together
cd $APP_DIR/releases && ls -1 | sort | head -n -$KEEP | xargs -r rm -rf
EOF

for _ in $(seq 1 20); do
  if curl -fs --max-time 3 "$URL/health" >/dev/null; then
    echo "Released $RELEASE: $URL"
    exit 0
  fi
  sleep 1
done
echo "Release $RELEASE is not answering on $URL/health" >&2
ssh "$HOST" "systemctl status toot-together --no-pager | tail -20" >&2
exit 1
