#!/usr/bin/env bash
# Installs or updates the artist upload API on the hackathon EC2 server.
# Uses its own clone (~/soundbeats-releases) so Parth's app in ~/soundbeats-EthGlobal is never touched.
# Run:  bash ~/soundbeats-releases/releases-api/deploy/install.sh
set -euo pipefail
API=/home/ubuntu/soundbeats-releases/releases-api
SITE=/etc/nginx/sites-available/arc

cd "$API"
mkdir -p /home/ubuntu/releases-api-data && chmod 700 /home/ubuntu/releases-api-data
npm ci --omit=dev --no-audit --no-fund --silent

echo "== S3 check"
AWS_REGION=ap-northeast-1 node selftest.js

echo "== service"
sudo cp deploy/soundbeats-releases-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now soundbeats-releases-api >/dev/null
sudo systemctl restart soundbeats-releases-api

echo "== site files"
sudo rm -rf /tmp/arc-dist && cp -r /home/ubuntu/soundbeats-releases/releases-app/dist /tmp/arc-dist
sudo cp -r /tmp/arc-dist/. /var/www/arc/ && rm -rf /tmp/arc-dist

echo "== nginx"
sudo cp deploy/nginx-arc-api.conf /etc/nginx/snippets/arc-api.conf
if ! sudo grep -q 'snippets/arc-api.conf' "$SITE"; then
  sudo cp "$SITE" "/home/ubuntu/arc.nginx.bak.$(date +%s)"
  sudo sed -i '0,/listen 443 ssl/{/listen 443 ssl/a\    include snippets/arc-api.conf;
}' "$SITE"
fi
if ! sudo nginx -t 2>/dev/null; then
  echo "nginx config test failed; restoring backup"; sudo cp "$(ls -t /home/ubuntu/arc.nginx.bak.* | head -1)" "$SITE"; exit 1
fi
sudo systemctl reload nginx

sleep 2
echo "== health"
curl -fsS https://arc.ethglobal.soundbeats.io/api/health && echo && echo INSTALL-OK
