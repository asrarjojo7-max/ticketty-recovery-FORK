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

die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# Explicit assertions: under `set -e` a failing `! grep ...` is a silent no-op,
# so every check below exits non-zero on violation instead of relying on -e.
require(){ grep -Eq -- "$1" <<<"$2" || die "$3"; }
reject(){ ! grep -Eq -- "$1" <<<"$2" || die "$3"; }

# Regression: the image CMD is the Render bootstrap script. The backend service
# must override it, otherwise the container crash-loops demanding
# MIGRATION_DATABASE_URL (never passed to the app) before Nest ever starts.
backend_service="$(awk '/^  backend:/{f=1} f&&/^  [a-zA-Z]/{if(!/^  backend:/)exit} f' "$COMPOSE")"
[[ -n "$backend_service" ]] || die "backend service block not found in compose.yaml"
# Strip comments so prose (e.g. why the Render entrypoint is overridden) does not
# trip the assertions; only effective YAML keys are checked.
backend_effective="$(sed 's/#.*$//' <<<"$backend_service")"
require '^[[:space:]]+command:' "$backend_effective" "backend service must define a command override"
reject 'render-entrypoint\.sh' "$backend_effective" "backend command must not be the Render entrypoint"
require 'dist/main\.js' "$backend_effective" "backend command must start Nest directly (node dist/main.js)"
# The application must never receive Render's admin/bootstrap credentials.
reject 'MIGRATION_DATABASE_URL|RUNTIME_DATABASE_PASSWORD|INITIAL_ADMIN_(EMAIL|PASSWORD)' \
  "$backend_effective" "backend service must not receive admin/bootstrap credentials"
# The migrate service is the only one allowed to hold the admin connection.
require 'MIGRATION_DATABASE_URL' \
  "$(awk '/^  migrate:/{f=1} f&&/^  [a-zA-Z]/{if(!/^  migrate:/)exit} f' "$COMPOSE")" \
  "migrate service must keep the admin connection"

echo "installer wiring tests: PASS (release, backup, monitoring, Cloudflare, readiness gates, backend command)"
