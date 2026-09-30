#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TICKETTY="$ROOT/ticketty"
INSTALL_ROOT="$(cd "$ROOT/../.." && pwd)"
COMPOSE="$INSTALL_ROOT/compose.yaml"

# Production readiness must include the real operational gates.
grep -Fq 'phase BACKUP backup_setup' "$TICKETTY"
grep -Fq 'phase MONITORING monitoring_verify' "$TICKETTY"
grep -Fq 'setv PUBLIC_ACCESS_STATUS VERIFIED' "$TICKETTY"
grep -Fq 'setv PUBLIC_ACCESS_STATUS FAILED' "$TICKETTY"
grep -Fq 'setv BACKUP_STATUS VERIFIED' "$TICKETTY"
grep -Fq 'setv MONITORING_STATUS VERIFIED' "$TICKETTY"
grep -Fq 'expected_jobs=' "$TICKETTY"
grep -Fq 'ticketty-backend' "$INSTALL_ROOT/ops/monitoring/prometheus.yml"
grep -Fq 'postgres-exporter:9187' "$INSTALL_ROOT/ops/monitoring/prometheus.yml"
grep -Fq 'node-exporter:9100' "$INSTALL_ROOT/ops/monitoring/prometheus.yml"
grep -Fq 'blackbox-exporter:9115' "$INSTALL_ROOT/ops/monitoring/prometheus.yml"
grep -Fq 'alertmanager:9093' "$INSTALL_ROOT/ops/monitoring/prometheus.yml"

# Backup must be scheduled independently and use an off-site destination.
for unit in ticketty-backup.service ticketty-backup.timer ticketty-backup-watchdog.service ticketty-backup-watchdog.timer ticketty-worker-watchdog.service ticketty-worker-watchdog.timer; do
  [[ -f "$INSTALL_ROOT/ops/systemd/$unit" ]]
done
grep -Fq 'systemctl enable --now ticketty-backup.timer ticketty-backup-watchdog.timer ticketty-worker-watchdog.timer' "$TICKETTY"
grep -Fq 'RCLONE_REMOTE=$remote' "$TICKETTY"
grep -Fq 'Initial off-site backup failed' "$TICKETTY"

# PostgreSQL remains private to the host and is available to the backup client.
grep -Fq '127.0.0.1:${POSTGRES_HOST_PORT:-15432}:5432' "$COMPOSE"

# Cloudflare supports both token and local-config profiles.
grep -Fq -- '--profile cloudflare-local up -d cloudflared-local' "$TICKETTY"
grep -Fq -- '--profile cloudflare up -d cloudflared' "$TICKETTY"
grep -Fq 'ensure_cloudflared' "$ROOT/cloudflare.sh"

# The bootstrap must not fetch unverified master code for an existing production install.
! grep -Fq 'fetch --force "$REPO" master' "$INSTALL_ROOT/install.sh"

echo "installer wiring tests: PASS (release, backup, monitoring, Cloudflare, readiness gates)"
