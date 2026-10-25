#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TV=${1:?Usage: scripts/install-tv.sh root@TV_IP [http://TORRSERVER_IP:8090]}
TORRSERVER=${2:-}
# Avoid interpolating untrusted values into the remote shell.
case "$TV" in *[!a-zA-Z0-9@._-]*) echo 'Invalid SSH target' >&2; exit 1;; esac
case "$TORRSERVER" in *[!a-zA-Z0-9:/._-]*) echo 'Invalid TorrServer URL' >&2; exit 1;; esac
cd "$ROOT"
npm run check
npm run build
VERSION=$(node -p "require('./package.json').version")
scp -O "dist/org.torrenter.watcher_${VERSION}_all.ipk" "$TV:/tmp/torrenter-watcher.ipk"
scp -O scripts/install-on-tv.js "$TV:/tmp/torrenter-watcher-install.js"
ssh "$TV" "node /tmp/torrenter-watcher-install.js /tmp/torrenter-watcher.ipk '$TORRSERVER'"
