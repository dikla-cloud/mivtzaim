#!/usr/bin/env bash
# הפעלת העדכון האוטומטי (פעם אחת): sudo bash /opt/mivtzaim/deploy/enable-auto-update.sh
# לביטול: sudo systemctl disable --now mivtzaim-update.timer
set -euo pipefail
tee /etc/systemd/system/mivtzaim-update.service >/dev/null <<'EOF'
[Unit]
Description=Mivtzaim auto update from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/mivtzaim/deploy/auto-update.sh
EOF
tee /etc/systemd/system/mivtzaim-update.timer >/dev/null <<'EOF'
[Unit]
Description=Check for Mivtzaim updates every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now mivtzaim-update.timer
echo "✔ העדכון האוטומטי פועל: השרת בודק כל 10 דקות אם יש גרסה חדשה ב-GitHub."
