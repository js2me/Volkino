#!/bin/sh
# Rooted webOS / webOSbrew init.d startup. No firmware partition writes.
APP=/media/developer/apps/usr/palm/applications/org.torrenter.watcher
STATE=/var/lib/torrenter-watcher
mkdir -p "$STATE"
chmod 700 "$STATE"

# Stay alive across a Node crash or webOS terminating the helper on standby.
if [ "$1" = supervise ]; then
  trap 'kill "$TW_CHILD" 2>/dev/null; exit 0' TERM INT
  while :; do
    if [ -f "$STATE/helper.log" ] && [ "$(wc -c < "$STATE/helper.log")" -gt 1048576 ]; then
      mv "$STATE/helper.log" "$STATE/helper.log.old"
    fi
    TW_CONFIG="$STATE/config.json" /usr/bin/node --max-old-space-size=64 "$APP/server/index.js" >> "$STATE/helper.log" 2>&1 < /dev/null &
    TW_CHILD=$!
    echo "$TW_CHILD" > "$STATE/helper.pid"
    wait "$TW_CHILD"
    TW_EXIT=$?
    echo "Helper exited ($TW_EXIT); restarting in 2 seconds" >> "$STATE/helper.log"
    sleep 2
  done
fi

# Check cmdline as PID files survive reboots and the PID may have been reused.
stop_or_keep() {
  TW_FILE=$1
  TW_MATCH=$2
  [ -f "$TW_FILE" ] || return
  TW_PID=$(cat "$TW_FILE")
  case "$TW_PID" in ''|*[!0-9]*) return;; esac
  [ "$TW_PID" -gt 1 ] && [ -r "/proc/$TW_PID/cmdline" ] || return
  tr '\000' ' ' < "/proc/$TW_PID/cmdline" | grep -q "$TW_MATCH" || return
  if [ "$TW_ACTION" != restart ]; then exit 0; fi
  kill "$TW_PID" 2>/dev/null
}
TW_ACTION=$1
stop_or_keep "$STATE/supervisor.pid" '65-torrenter-watcher supervise'
# Also migrate helpers started by the older script without a supervisor.
if [ "$TW_ACTION" = restart ]; then
  stop_or_keep "$STATE/helper.pid" 'org.torrenter.watcher/server/index.js'
  sleep 1
else
  # Stop the old unsupervised process before taking over its port.
  TW_ACTION=restart
  stop_or_keep "$STATE/helper.pid" 'org.torrenter.watcher/server/index.js'
  sleep 1
fi
nohup setsid /bin/sh /var/lib/webosbrew/init.d/65-torrenter-watcher supervise >> "$STATE/helper.log" 2>&1 < /dev/null &
echo "$!" > "$STATE/supervisor.pid"
