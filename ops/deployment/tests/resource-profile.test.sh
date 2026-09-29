#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/resource-profile.sh"
out="$(bash "$SCRIPT" plan 1048576 1000 10485760)"
grep -q '"profile":"constrained"' <<<"$out"
grep -q '"decision":"blocked"' <<<"$out"
out="$(bash "$SCRIPT" plan 3145728 2000 31457240)"
grep -q '"profile":"standard"' <<<"$out"
grep -q '"recommended_workers":1' <<<"$out"
out="$(bash "$SCRIPT" plan 16777216 8000 104857600)"
grep -q '"profile":"high-capacity"' <<<"$out"
grep -q '"recommended_workers":1' <<<"$out"
grep -q '"worker_recommendation_status":"not_load_validated"' <<<"$out"
out="$(bash "$SCRIPT" plan 16777216 1500 104857600)"
grep -q '"profile":"minimal"' <<<"$out"
if bash "$SCRIPT" plan nope 2000 3 >/dev/null 2>&1; then echo "invalid input accepted" >&2; exit 1; fi
echo "resource-profile tests: PASS (5 scenarios)"
