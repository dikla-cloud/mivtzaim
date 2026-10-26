#!/usr/bin/env bash
# עדכון אוטומטי: בודק אם יש גרסה חדשה ב-GitHub, ואם כן – מעדכן ומפעיל מחדש את כל ההתקנות בשרת.
# רץ כל 10 דקות (שירות mivtzaim-update.timer). אם האפליקציה לא עולה אחרי העדכון – חוזרים לגרסה הקודמת.
# יומן: sudo journalctl -u mivtzaim-update -n 50
set -euo pipefail
APP_DIR=/opt/mivtzaim
cd "$APP_DIR"
# השירות רץ כ-root, והתיקייה שייכת למשתמש אחר. git של root מסרב לעבוד בה („dubious ownership”),
# ולכן מריצים את git בשם בעל התיקייה
OWNER="$(stat -c %U "$APP_DIR/package.json")"
git() { sudo -H -u "$OWNER" /usr/bin/git -C "$APP_DIR" "$@"; }
git fetch --quiet origin main
OLD="$(git rev-parse HEAD)"
NEW="$(git rev-parse origin/main)"
[ "$OLD" = "$NEW" ] && exit 0

echo "עדכון: $(git log -1 --format=%s "$NEW")"
deploy() {
  chown -R "$OWNER" "$APP_DIR"
  git reset --hard --quiet "$1"
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
