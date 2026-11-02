#!/bin/bash
# Restart server + cloudflared quick tunnel. Prints the public URL.
cd "$(dirname "$0")"
pkill -f "node server.js"; pkill -f "cloudflared tunnel"
sleep 1
nohup node server.js >> server.log 2>&1 &
nohup cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:3456 > tunnel.log 2>&1 &
for i in $(seq 1 30); do U=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' tunnel.log | head -1); [ -n "$U" ] && break; sleep 1; done
echo "$U" | tee PUBLIC_URL.txt
