#!/usr/bin/env bash
set -euo pipefail

# REGION is this box's id in regions.json. Extra domains (www, domains the game moved from) redirect to the main one.
USAGE='usage: setup-server.sh <region> <domain> [redirect-from-domain ...]'
REGION=${1:?$USAGE}
[[ $REGION =~ ^[A-Z]{2}$ ]] || { echo "$USAGE (region is its two-letter id in regions.json)" >&2; exit 1; }
DOMAIN=${2:?$USAGE}
shift 2
REDIRECT_FROM="$*"
HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=/opt/toot-together
DEPLOY_USER=${SUDO_USER:-ubuntu}

# Oracle's Ubuntu images reject everything but SSH in iptables, on top of the VCN security list. Other clouds
# (Jetstream2) leave iptables open and filter in their security groups only.
if command -v netfilter-persistent >/dev/null; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null ||
      iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  netfilter-persistent save
fi

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

id toot >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin toot
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/releases"

install -m 644 "$HERE/toot-together.service" /etc/systemd/system/toot-together.service
install -d /etc/systemd/system/toot-together.service.d
printf '[Service]\nEnvironment=REGION=%s\n' "$REGION" >/etc/systemd/system/toot-together.service.d/region.conf
{
  cat "$HERE/Caddyfile"
  if [ -n "$REDIRECT_FROM" ]; then cat "$HERE/Caddyfile.redirect"; fi
} | sed -e "s|{\$DOMAIN}|$DOMAIN|g" -e "s|{\$REDIRECT_FROM}|$REDIRECT_FROM|g" >/etc/caddy/Caddyfile
# As Caddy's own user: validating opens the log files, and ones it created as root Caddy couldn't write to.
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable toot-together caddy
systemctl reload-or-restart caddy

echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart toot-together" >/etc/sudoers.d/toot-together
chmod 440 /etc/sudoers.d/toot-together

echo "Provisioned region $REGION for https://$DOMAIN${REDIRECT_FROM:+ (redirecting $REDIRECT_FROM)}"
