#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER="$ROOT/resource-preflight.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

MOCK="$TMP/resource-profile.sh"
cat > "$MOCK" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
case "${1:-}" in
  discover)
    case "${MOCK_PROFILE:-standard}" in
      standard) printf '%s\n' '{"schema_version":1,"effective_memory_kib":4194304,"effective_cpu_millicores":2000,"available_disk_kib":31457280}' ;;
      minimal) printf '%s\n' '{"schema_version":1,"effective_memory_kib":3145728,"effective_cpu_millicores":1500,"available_disk_kib":31457280}' ;;
      constrained) printf '%s\n' '{"schema_version":1,"effective_memory_kib":1048576,"effective_cpu_millicores":1000,"available_disk_kib":3145728}' ;;
      *) exit 2 ;;
    esac
    ;;
  plan)
    case "${MOCK_PROFILE:-standard}" in
      standard) printf '%s\n' '{"schema_version":1,"profile":"standard","decision":"ready","recommended_workers":1,"worker_recommendation_status":"not_load_validated","monitoring_profile":"standard","effective_memory_kib":4194304,"effective_cpu_millicores":2000,"available_disk_kib":31457280,"requires_operator_confirmation":true,"safety_gates_unchanged":true}' ;;
      minimal) printf '%s\n' '{"schema_version":1,"profile":"minimal","decision":"review","recommended_workers":1,"worker_recommendation_status":"not_load_validated","monitoring_profile":"local","effective_memory_kib":3145728,"effective_cpu_millicores":1500,"available_disk_kib":31457280,"requires_operator_confirmation":true,"safety_gates_unchanged":true}' ;;
      constrained) printf '%s\n' '{"schema_version":1,"profile":"constrained","decision":"blocked","recommended_workers":1,"worker_recommendation_status":"not_load_validated","monitoring_profile":"minimal","effective_memory_kib":1048576,"effective_cpu_millicores":1000,"available_disk_kib":3145728,"requires_operator_confirmation":true,"safety_gates_unchanged":true}' ;;
      *) exit 2 ;;
    esac
    ;;
  *)
    exit 2
    ;;
esac
EOF
chmod 0755 "$MOCK"

STATE="$TMP/state"
mkdir -p "$STATE"

# ticketty invokes the helper through command substitution, so interactive
# confirmation must use the controlling TTY while machine state stays on stdout.
grep -q 'read -r -p "$prompt" answer < /dev/tty' "$HELPER"
grep -q 'Accept resource profile' "$HELPER"

TTY_OUT="$TMP/tty.out"
printf 'y\n' | script -qec "MOCK_PROFILE=minimal NON_INTERACTIVE=0 CONFIRMED=0 \"$HELPER\" \"$MOCK\" \"$STATE\" server-tty 0" /dev/null >"$TTY_OUT"
grep -q 'RESOURCE_PROFILE=minimal' "$TTY_OUT"
jq -e '.accepted.profile == "minimal" and .accepted.server_id == "server-tty" and .accepted.explicit_confirmation == true' "$STATE/resource-plan.json" >/dev/null


out="$(MOCK_PROFILE=standard NON_INTERACTIVE=1 CONFIRMED=1 "$HELPER" "$MOCK" "$STATE" server-a 0)"
grep -q '^RESOURCE_PROFILE=standard$' <<<"$out"
jq -e '.accepted.profile == "standard" and .accepted.server_id == "server-a" and .accepted.explicit_confirmation == true' "$STATE/resource-plan.json" >/dev/null
first_at="$(jq -r '.accepted.accepted_at' "$STATE/resource-plan.json")"

out="$(MOCK_PROFILE=standard NON_INTERACTIVE=1 CONFIRMED=0 "$HELPER" "$MOCK" "$STATE" server-a 0)"
grep -q '^RESOURCE_PROFILE=standard$' <<<"$out"
grep -q 'خطة الموارد المعتمدة محفوظة' <<<"$out"
[[ "$(jq -r '.accepted.accepted_at' "$STATE/resource-plan.json")" == "$first_at" ]]

if MOCK_PROFILE=minimal NON_INTERACTIVE=1 CONFIRMED=0 "$HELPER" "$MOCK" "$STATE" server-a 0 >/dev/null 2>&1; then
  echo "resource profile changed silently on same server" >&2
  exit 1
fi

if MOCK_PROFILE=minimal NON_INTERACTIVE=1 CONFIRMED=0 "$HELPER" "$MOCK" "$STATE" server-a 1 >/dev/null 2>&1; then
  echo "reconfigure accepted without explicit confirmation" >&2
  exit 1
fi

out="$(MOCK_PROFILE=minimal NON_INTERACTIVE=1 CONFIRMED=1 "$HELPER" "$MOCK" "$STATE" server-a 1)"
grep -q '^RESOURCE_PROFILE=minimal$' <<<"$out"
[[ "$(jq -r '.accepted.profile' "$STATE/resource-plan.json")" == "minimal" ]]

if MOCK_PROFILE=constrained NON_INTERACTIVE=1 CONFIRMED=1 "$HELPER" "$MOCK" "$STATE" server-a 1 >/dev/null 2>&1; then
  echo "constrained resource plan bypassed safety gate" >&2
  exit 1
fi

out="$(MOCK_PROFILE=minimal NON_INTERACTIVE=1 CONFIRMED=1 "$HELPER" "$MOCK" "$STATE" server-b 0)"
grep -q '^RESOURCE_PROFILE=minimal$' <<<"$out"
[[ "$(jq -r '.accepted.server_id' "$STATE/resource-plan.json")" == "server-b" ]]

echo "resource-preflight tests: PASS (7 scenarios)"
