#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

RESOURCE_SCRIPT="${1:-}"
STATE_DIR="${2:-}"
SERVER_ID="${3:-}"
FORCE_RECONFIGURE="${4:-0}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
CONFIRMED="${CONFIRMED:-0}"

die(){ echo "ERROR: $*" >&2; exit 1; }
[[ -x "$RESOURCE_SCRIPT" ]] || die "resource-profile.sh غير موجود أو غير قابل للتنفيذ."
[[ -n "$STATE_DIR" && -n "$SERVER_ID" ]] || die "مسار الحالة ومعرّف الخادم مطلوبان."
command -v jq >/dev/null 2>&1 || die "jq مطلوب لفحص خطة الموارد."
install -d -m 0700 "$STATE_DIR"
PLAN_FILE="$STATE_DIR/resource-plan.json"

discover="$("$RESOURCE_SCRIPT" discover)"
memory="$(jq -er '.effective_memory_kib' <<<"$discover")"
cpu="$(jq -er '.effective_cpu_millicores' <<<"$discover")"
disk="$(jq -er '.available_disk_kib' <<<"$discover")"
plan="$("$RESOURCE_SCRIPT" plan "$memory" "$cpu" "$disk")"

profile="$(jq -er '.profile' <<<"$plan")"
decision="$(jq -er '.decision' <<<"$plan")"
workers="$(jq -er '.recommended_workers' <<<"$plan")"
monitoring="$(jq -er '.monitoring_profile' <<<"$plan")"

printf '\n' >&2
printf '  Resource discovery:\n' >&2
printf '    Effective RAM: %s KiB\n' "$memory" >&2
printf '    Effective CPU: %s millicores\n' "$cpu" >&2
printf '    Available Docker disk: %s KiB\n' "$disk" >&2
printf '  Recommended profile: %s\n' "$profile" >&2
printf '  Decision: %s\n' "$decision" >&2
printf '  Recommended workers: %s (load validation not available yet)\n' "$workers" >&2
printf '  Monitoring: %s\n' "$monitoring" >&2

case "$decision" in
  blocked)
    die "الموارد ضمن فئة constrained؛ التثبيت محظور بهذه السياسة الحالية. لا يتم تجاوز بوابات الأمان."
    ;;
  review|ready) ;;
  *) die "قرار موارد غير معروف: $decision" ;;
esac

accepted_profile=""
accepted_server=""
accepted_at=""
if [[ -f "$PLAN_FILE" ]]; then
  accepted_profile="$(jq -r '.accepted.profile // empty' "$PLAN_FILE" 2>/dev/null || true)"
  accepted_server="$(jq -r '.accepted.server_id // empty' "$PLAN_FILE" 2>/dev/null || true)"
  accepted_at="$(jq -r '.accepted.accepted_at // empty' "$PLAN_FILE" 2>/dev/null || true)"
fi

same_server=0
[[ -n "$accepted_profile" && "$accepted_server" == "$SERVER_ID" ]] && same_server=1

emit_state(){
  printf 'RESOURCE_PROFILE=%s\n' "$profile"
  printf 'RESOURCE_PROFILE_DECISION=%s\n' "$decision"
  printf 'RESOURCE_PROFILE_SERVER_ID=%s\n' "$SERVER_ID"
  printf 'RESOURCE_PROFILE_ACCEPTED_AT=%s\n' "$accepted_at"
  printf 'RESOURCE_PROFILE_PLAN_FILE=%s\n' "$PLAN_FILE"
  printf 'RESOURCE_EFFECTIVE_MEMORY_KIB=%s\n' "$memory"
  printf 'RESOURCE_EFFECTIVE_CPU_MILLICORES=%s\n' "$cpu"
  printf 'RESOURCE_AVAILABLE_DISK_KIB=%s\n' "$disk"
}

if (( same_server == 1 && FORCE_RECONFIGURE != 1 )); then
  if [[ "$accepted_profile" == "$profile" ]]; then
    ok_msg="Accepted resource profile is already stored for this server: $accepted_profile"
    printf '  ✓ %s\n' "$ok_msg" >&2
    emit_state
    exit 0
  fi
  warn_msg="الخادم نفسه أعطى خطة مختلفة عن الخطة المعتمدة ($accepted_profile → $profile). لن نغيرها بصمت."
  printf '  ! %s\n' "$warn_msg" >&2
fi

if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
  [[ "$CONFIRMED" -eq 1 ]] || die "خطة الموارد تحتاج موافقة صريحة في التشغيل غير التفاعلي؛ استخدم --confirm."
else
  prompt="Accept resource profile '$profile' on this server? [y/N]: "
  if [[ -r /dev/tty ]]; then
    read -r -p "$prompt" answer < /dev/tty
  else
    read -r -p "$prompt" answer
  fi
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "Resource profile was not accepted." ;;
  esac
fi

accepted_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -n \
  --arg server "$SERVER_ID" \
  --arg accepted_at "$accepted_at" \
  --argjson discovery "$discover" \
  --argjson plan "$plan" \
  --argjson force "$FORCE_RECONFIGURE" \
  '$plan
   + {discovery:$discovery,
      accepted:{
        server_id:$server,
        profile:$plan.profile,
        accepted_at:$accepted_at,
        explicit_confirmation:true,
        reconfigured:($force == 1)
      }}' > "$PLAN_FILE.tmp"
chmod 600 "$PLAN_FILE.tmp"
mv "$PLAN_FILE.tmp" "$PLAN_FILE"

emit_state
