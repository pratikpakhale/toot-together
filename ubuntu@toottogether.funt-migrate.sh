#!/usr/bin/env bash
# One-off: move the running release from the hippo-toot service back to toot-together.
# Run after setup-server.sh has installed toot-together.service. Stopping parks rooms; starting restores them.
set -euo pipefail
[ -f /etc/systemd/system/hippo-toot.service ] || { echo "nothing to move"; exit 0; }
systemctl stop hippo-toot
if [ ! -e /opt/toot-together/current ]; then
  mv /opt/hippo-toot/releases/* /opt/toot-together/releases/
  ln -sfn "/opt/toot-together/releases/$(basename "$(readlink /opt/hippo-toot/current)")" /opt/toot-together/current
fi
install -d -o toot -g toot /var/lib/toot-together
if [ -f /var/lib/hippo-toot/rooms.json ]; then
  install -o toot -g toot -m 600 /var/lib/hippo-toot/rooms.json /var/lib/toot-together/rooms.json
fi
systemctl disable hippo-toot
rm -rf /etc/systemd/system/hippo-toot.service /etc/sudoers.d/hippo-toot /opt/hippo-toot /var/lib/hippo-toot
systemctl daemon-reload
systemctl start toot-together
if id hippo-toot >/dev/null 2>&1; then userdel hippo-toot; fi
systemctl is-active toot-together
