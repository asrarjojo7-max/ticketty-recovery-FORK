#!/usr/bin/env bash
set -Eeuo pipefail

required=(
  install.sh
  ops/deployment/bootstrap.sh
  ops/deployment/cloudflare.sh
  ops/deployment/profile.sh
  ops/deployment/release-gate.sh
  ops/deployment/resource-preflight.sh
  ops/deployment/resource-profile.sh
  ops/deployment/ticketty
  ops/deployment/transfer.sh
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || { echo "missing executable: $path" >&2; exit 1; }
  [[ -x "$path" ]] || { echo "not executable: $path" >&2; exit 1; }
done

echo "deployment script modes: PASS (${#required[@]} entrypoints executable)"
