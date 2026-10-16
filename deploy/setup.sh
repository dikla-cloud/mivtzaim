#!/usr/bin/env bash
# התקנה בשרת Ubuntu חדש (למשל Oracle Cloud Always Free), בפקודה אחת:
#   curl -fsSL https://raw.githubusercontent.com/<github-user>/mivtzaim/main/deploy/setup.sh | bash -s -- <github-user> <domain> <password> [email]
# אפשר להריץ שוב בכל זמן כדי לעדכן לגרסה האחרונה מ-GitHub.
set -euo pipefail

GH_USER="${1:?חסר שם משתמש GitHub}"
DOMAIN="${2:?חסרה כתובת, למשל mivtzaim.duckdns.org}"
TOKEN="${3:?חסרה סיסמה ראשונית לאפליקציה}"  # משמשת רק לכניסה הראשונה של המנהל
EMAIL="${4:-admin@example.com}"
APP_DIR=/opt/mivtzaim
DATA_DIR=/var/lib/mivtzaim
RUN_USER="$(id -un)"

echo "==> התקנת חבילות בסיס"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "==> התקנת Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "==> התקנת Caddy (שרת HTTPS עם תעודה חינמית)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "==> הורדת האפליקציה מ-GitHub"
if [ -d "$APP_DIR/.git" ]; then
  sudo git -C "$APP_DIR" pull --ff-only
else
  sudo git clone "https://github.com/$GH_USER/mivtzaim.git" "$APP_DIR"
fi
sudo chown -R "$RUN_USER" "$APP_DIR"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund)
sudo mkdir -p "$DATA_DIR"
sudo chown -R "$RUN_USER" "$DATA_DIR"

echo "==> הגדרת שירות שרץ תמיד (גם אחרי הפעלה מחדש)"
sudo tee /etc/systemd/system/mivtzaim.service >/dev/null <<EOF
[Unit]
Description=Mivtzaim deals app
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=DATA_DIR=$DATA_DIR
Environment=APP_TOKEN=$TOKEN
Environment=VAPID_SUBJECT=mailto:$EMAIL
Environment=GEOCODER_UA=MivtzaimApp/1.0 ($EMAIL)

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mivtzaim
sudo systemctl restart mivtzaim

echo "==> הגדרת HTTPS לכתובת $DOMAIN"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
  reverse_proxy localhost:3000
}
EOF
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "==> פתיחת פורטים 80 ו-443 בחומת האש של השרת"
if ! sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp -m multiport --dports 80,443 -j ACCEPT
fi
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

sleep 3
if curl -fs localhost:3000 >/dev/null; then
  echo
  echo "✔ האפליקציה פועלת. פתחי בדפדפן: https://$DOMAIN"
  echo "  (בפעם הראשונה ייתכן שיעברו דקה-שתיים עד שתעודת ה-HTTPS תונפק)"
else
  echo "✘ משהו לא עבד. לבדיקה: sudo journalctl -u mivtzaim -n 50"
  exit 1
fi
