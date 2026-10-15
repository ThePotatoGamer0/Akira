#!/bin/bash
set -euo pipefail

mkdir -p /data /data/runtime /app/assets/cards
rm -rf /app/data
ln -s /data/runtime /app/data
cd /app

echo "Akira is preparing the catalog."
node --import tsx src/init/index.ts

echo "Akira is starting the bot and the WebUI API."
node --import tsx src/bot/index.ts &
bot_pid=$!
node --import tsx webui/server/src/index.ts &
web_pid=$!

shutdown() {
  kill "$bot_pid" "$web_pid" 2>/dev/null || true
  wait "$bot_pid" "$web_pid" 2>/dev/null || true
}
trap shutdown EXIT INT TERM

wait -n "$bot_pid" "$web_pid"
status=$?
exit "$status"
