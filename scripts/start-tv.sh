#!/bin/sh
# Rooted webOS / webOSbrew init.d startup. No firmware partition writes.
APP=/media/developer/apps/usr/palm/applications/org.torrenter.watcher
STATE=/var/lib/torrenter-watcher
mkdir -p "$STATE"
chmod 700 "$STATE"
if [ -f "$STATE/helper.pid" ]; then
  TW_PID=$(cat "$STATE/helper.pid")
  case "$TW_PID" in ''|*[!0-9]*) TW_PID=0;; esac
  if [ "$TW_PID" -gt 1 ] && [ -r "/proc/$TW_PID/cmdline" ]; then
    if tr '\000' ' ' < "/proc/$TW_PID/cmdline" | grep -q 'org.torrenter.watcher/server/index.js'; then
      if [ "$1" != restart ]; then exit 0; fi
      kill "$TW_PID"
      sleep 1
    fi
  fi
fi
if [ -f "$STATE/helper.log" ] && [ "$(wc -c < "$STATE/helper.log")" -gt 1048576 ]; then mv "$STATE/helper.log" "$STATE/helper.log.old"; fi
TW_CONFIG="$STATE/config.json" nohup /usr/bin/node --max-old-space-size=64 "$APP/server/index.js" >> "$STATE/helper.log" 2>&1 < /dev/null &
echo "$!" > "$STATE/helper.pid"
