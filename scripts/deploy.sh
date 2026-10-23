#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi
HOST=${DEPLOY_HOST:?DEPLOY_HOST is not set; copy .env.example to .env.local and fill it in}
URL=${DEPLOY_URL:?DEPLOY_URL is not set; copy .env.example to .env.local and fill it in}
APP_DIR=/opt/toot-together
RELEASE=$(date -u +%Y%m%d%H%M%S)
KEEP=3

pnpm build

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
