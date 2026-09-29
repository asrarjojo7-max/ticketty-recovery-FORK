#!/usr/bin/env bash
set -Eeuo pipefail

TICKETTY="$(cd "$(dirname "$0")/.." && pwd)/ticketty"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

extract_monitoring_fn(){
  awk '/^prepare_monitoring_bind_mounts\(\)/,/^stack_up\(\)/ {if ($0 !~ /^stack_up\(\)/) print}' "$TICKETTY"
}

die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
INSTALL_ROOT="$TMP/install"
mkdir -p "$INSTALL_ROOT/ops/monitoring"

touch \
  "$INSTALL_ROOT/ops/monitoring/prometheus.yml" \
  "$INSTALL_ROOT/ops/monitoring/alertmanager.yml" \
  "$INSTALL_ROOT/ops/monitoring/blackbox.yml" \
  "$INSTALL_ROOT/ops/alert-rules.yml"

chmod 0700 "$INSTALL_ROOT/ops" "$INSTALL_ROOT/ops/monitoring"
chmod 0600 \
  "$INSTALL_ROOT/ops/monitoring/prometheus.yml" \
  "$INSTALL_ROOT/ops/monitoring/alertmanager.yml" \
  "$INSTALL_ROOT/ops/monitoring/blackbox.yml" \
  "$INSTALL_ROOT/ops/alert-rules.yml"

eval "$(extract_monitoring_fn)"
prepare_monitoring_bind_mounts

[[ "$(stat -c '%a' "$INSTALL_ROOT/ops")" == "755" ]]
[[ "$(stat -c '%a' "$INSTALL_ROOT/ops/monitoring")" == "755" ]]
for file in \
  "$INSTALL_ROOT/ops/monitoring/prometheus.yml" \
  "$INSTALL_ROOT/ops/monitoring/alertmanager.yml" \
  "$INSTALL_ROOT/ops/monitoring/blackbox.yml" \
  "$INSTALL_ROOT/ops/alert-rules.yml"; do
  [[ "$(stat -c '%a' "$file")" == "644" ]]
done

echo "monitoring permission tests: PASS (non-secret bind mounts are readable)"
