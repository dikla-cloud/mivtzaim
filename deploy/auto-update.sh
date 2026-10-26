#!/usr/bin/env bash
# עדכון אוטומטי: בודק אם יש גרסה חדשה ב-GitHub, ואם כן – מעדכן ומפעיל מחדש את כל ההתקנות בשרת.
# רץ כל 10 דקות (שירות mivtzaim-update.timer). אם האפליקציה לא עולה אחרי העדכון – חוזרים לגרסה הקודמת.
# יומן: sudo journalctl -u mivtzaim-update -n 50
set -euo pipefail
APP_DIR=/opt/mivtzaim
cd "$APP_DIR"
# השירות רץ כ-root, והתיקייה שייכת למשתמש אחר: בלי זה git מסרב לעבוד („dubious ownership”)
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$APP_DIR"
git fetch --quiet origin main
OLD="$(git rev-parse HEAD)"
NEW="$(git rev-parse origin/main)"
[ "$OLD" = "$NEW" ] && exit 0

echo "עדכון: $(git log -1 --format=%s "$NEW")"
OWNER="$(stat -c %U "$APP_DIR/package.json")"
deploy() {
  git reset --hard --quiet "$1"
  chown -R "$OWNER" "$APP_DIR"
  # חבילות – רק אם השתנו
  if ! git diff --quiet "$2" "$1" -- package.json package-lock.json 2>/dev/null; then
    sudo -u "$OWNER" npm install --omit=dev --no-audit --no-fund --prefix "$APP_DIR"
  fi
  for unit in /etc/systemd/system/mivtzaim*.service; do
    name="$(basename "$unit")"
    [ "$name" = "mivtzaim-update.service" ] && continue
    systemctl restart "$name"
  done
}
healthy() {
  sleep 5
  for unit in /etc/systemd/system/mivtzaim*.service; do
    port="$(sed -n 's/^Environment=PORT=//p' "$unit")"
    [ -z "$port" ] && continue
    curl -fs "localhost:$port/api/setup" >/dev/null || return 1
  done
}

deploy "$NEW" "$OLD"
if healthy; then
  echo "✔ עודכן ל-$(git rev-parse --short HEAD)"
else
  echo "✘ האפליקציה לא עלתה אחרי העדכון – חוזרים לגרסה הקודמת $OLD"
  deploy "$OLD" "$NEW"
  exit 1
fi
