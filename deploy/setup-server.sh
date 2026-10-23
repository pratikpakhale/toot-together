#!/usr/bin/env bash
set -euo pipefail

# Extra domains (www, domains the game moved from) redirect to the main one.
DOMAIN=${1:?usage: setup-server.sh <domain> [redirect-from-domain ...]}
shift
REDIRECT_FROM="$*"
HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=/opt/hippo-toot
DEPLOY_USER=${SUDO_USER:-ubuntu}

# Oracle's Ubuntu images reject everything but SSH in iptables, on top of the VCN security list.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
netfilter-persistent save

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

if ! command -v node >/dev/null || ! node -v | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi
npm install -g pnpm@10.12.1

id hippo-toot >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin hippo-toot
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/releases"

install -m 644 "$HERE/hippo-toot.service" /etc/systemd/system/hippo-toot.service
{
  cat "$HERE/Caddyfile"
  if [ -n "$REDIRECT_FROM" ]; then cat "$HERE/Caddyfile.redirect"; fi
} | sed -e "s|{\$DOMAIN}|$DOMAIN|g" -e "s|{\$REDIRECT_FROM}|$REDIRECT_FROM|g" >/etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable hippo-toot caddy
systemctl reload-or-restart caddy

echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart hippo-toot" >/etc/sudoers.d/hippo-toot
chmod 440 /etc/sudoers.d/hippo-toot

# One-time move from the game's old name (Toot Together): the running release moves to the new
# service, user and paths. Stopping parks open rooms; the new service restores them on start, so
# players see a short freeze and reconnect.
if [ -f /etc/systemd/system/toot-together.service ]; then
  systemctl stop toot-together
  if [ -L /opt/toot-together/current ] && [ ! -e "$APP_DIR/current" ]; then
    mv /opt/toot-together/releases/* "$APP_DIR/releases/"
    ln -sfn "$APP_DIR/releases/$(basename "$(readlink /opt/toot-together/current)")" "$APP_DIR/current"
  fi
  install -d -o hippo-toot -g hippo-toot /var/lib/hippo-toot
  if [ -f /var/lib/toot-together/rooms.json ]; then
    install -o hippo-toot -g hippo-toot -m 600 /var/lib/toot-together/rooms.json /var/lib/hippo-toot/rooms.json
  fi
  systemctl disable toot-together
  rm -rf /etc/systemd/system/toot-together.service /etc/sudoers.d/toot-together /opt/toot-together /var/lib/toot-together
  systemctl daemon-reload
  if [ -e "$APP_DIR/current" ]; then systemctl start hippo-toot; fi
  if id toot >/dev/null 2>&1; then userdel toot; fi
fi

echo "Provisioned for https://$DOMAIN${REDIRECT_FROM:+ (redirecting $REDIRECT_FROM)}"
