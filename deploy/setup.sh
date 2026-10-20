#!/usr/bin/env bash
# התקנה בשרת Ubuntu חדש (למשל Oracle Cloud Always Free), בפקודה אחת:
#   curl -fsSL https://raw.githubusercontent.com/<github-user>/mivtzaim/main/deploy/setup.sh | bash -s -- <github-user> <domain> <password> [email]
# אפשר להריץ שוב בכל זמן כדי לעדכן לגרסה האחרונה מ-GitHub (כל ההתקנות בשרת מתעדכנות יחד).
#
# התקנה נוספת על אותו שרת (כתובת, משתמשים ושפה משלה), למשל לאוסטריה:
#   ... | bash -s -- <github-user> <domain2> <password2> <email> mivtzaim-wien de AT 3001
#   (שם ההתקנה, שפת ברירת מחדל he/de/en, מדינה IL/AT, ופורט פנימי פנוי)
set -euo pipefail

GH_USER="${1:?חסר שם משתמש GitHub}"
DOMAIN="${2:?חסרה כתובת, למשל mivtzaim.duckdns.org}"
TOKEN="${3:?חסרה סיסמה ראשונית לאפליקציה}"  # משמשת רק לכניסה הראשונה של המנהל
EMAIL="${4:-admin@example.com}"
INSTANCE="${5:-mivtzaim}"
APP_LANG="${6:-he}"
APP_COUNTRY="${7:-IL}"
PORT="${8:-3000}"
# הגנה מפני פקודה משובשת (למשל שתי פקודות שנדבקו לשורה אחת)
if [ "$#" -gt 8 ] || ! [[ "$INSTANCE" =~ ^mivtzaim[a-z0-9-]*$ ]] || ! [[ "$APP_LANG" =~ ^(he|de|en|ar)$ ]] \
  || ! [[ "$APP_COUNTRY" =~ ^[A-Z]{2}$ ]] || ! [[ "$PORT" =~ ^[0-9]{4,5}$ ]] || ! [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]]; then
  echo "✘ הפקודה לא תקינה (אולי שתי פקודות נדבקו לשורה אחת?). מריצים את פקודת העדכון לבד, בשורה נקייה."
  exit 1
fi
APP_DIR=/opt/mivtzaim
DATA_DIR=/var/lib/$INSTANCE
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
  # מעדכנים בכוח לגרסה שב-GitHub (שינויים מקומיים בקוד, למשל package-lock.json שנכתב מחדש ע"י npm, נדרסים;
  # הנתונים שמורים ב-/var/lib ובתיקיית data, ולא נפגעים)
  sudo git -C "$APP_DIR" fetch --quiet origin main
  sudo git -C "$APP_DIR" reset --hard --quiet origin/main
else
  sudo git clone "https://github.com/$GH_USER/mivtzaim.git" "$APP_DIR"
fi
sudo chown -R "$RUN_USER" "$APP_DIR"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund)
sudo mkdir -p "$DATA_DIR"
sudo chown -R "$RUN_USER" "$DATA_DIR"

echo "==> הגדרת שירות שרץ תמיד (גם אחרי הפעלה מחדש): $INSTANCE"
sudo tee /etc/systemd/system/$INSTANCE.service >/dev/null <<EOF
[Unit]
Description=Mivtzaim deals app ($INSTANCE)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA_DIR
Environment=APP_LANG=$APP_LANG
Environment=APP_COUNTRY=$APP_COUNTRY
Environment=APP_TOKEN=$TOKEN
Environment=VAPID_SUBJECT=mailto:$EMAIL
Environment=GEOCODER_UA=MivtzaimApp/1.0 ($EMAIL)

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now "$INSTANCE"
# הקוד משותף לכל ההתקנות בשרת – מפעילים מחדש את כולן
for unit in /etc/systemd/system/mivtzaim*.service; do sudo systemctl restart "$(basename "$unit")"; done

echo "==> הגדרת HTTPS לכתובת $DOMAIN"
# כל התקנה מקבלת קובץ משלה, והקובץ הראשי מצרף את כולם
sudo mkdir -p /etc/caddy/sites
printf '%s {\n  reverse_proxy localhost:%s\n}\n' "$DOMAIN" "$PORT" | sudo tee "/etc/caddy/sites/$INSTANCE.caddy" >/dev/null
echo 'import sites/*.caddy' | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "==> פתיחת פורטים 80 ו-443 בחומת האש של השרת"
if ! sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp -m multiport --dports 80,443 -j ACCEPT
fi
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

sleep 3
if curl -fs "localhost:$PORT" >/dev/null; then
  echo
  echo "✔ האפליקציה פועלת. פתחי בדפדפן: https://$DOMAIN"
  echo "  (בפעם הראשונה ייתכן שיעברו דקה-שתיים עד שתעודת ה-HTTPS תונפק)"
else
  echo "✘ משהו לא עבד. לבדיקה: sudo journalctl -u $INSTANCE -n 50"
  exit 1
fi
