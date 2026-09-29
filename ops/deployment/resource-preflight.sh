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

printf '\n'
printf '  الموارد المكتشفة فعليًا:\n'
printf '    RAM الفعّالة: %s KiB\n' "$memory"
printf '    CPU الفعّال: %s millicores\n' "$cpu"
printf '    المساحة المتاحة لـDocker: %s KiB\n' "$disk"
printf '  الخطة المقترحة: %s\n' "$profile"
printf '  القرار: %s\n' "$decision"
printf '  العمال المقترحون: %s (لم تثبت قابليتها بالتجارب الحملية بعد)\n' "$workers"
printf '  المراقبة: %s\n' "$monitoring"

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

if (( same_server == 1 && FORCE_RECONFIGURE != 1 )); then
  if [[ "$accepted_profile" == "$profile" ]]; then
    ok_msg="خطة الموارد المعتمدة محفوظة ولم تتغير على هذا الخادم: $accepted_profile"
    printf '  ✓ %s\n' "$ok_msg"
    exit 0
  fi
  warn_msg="الخادم نفسه أعطى خطة مختلفة عن الخطة المعتمدة ($accepted_profile → $profile). لن نغيرها بصمت."
  printf '  ! %s\n' "$warn_msg"
fi

if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
  [[ "$CONFIRMED" -eq 1 ]] || die "خطة الموارد تحتاج موافقة صريحة في التشغيل غير التفاعلي؛ استخدم --confirm."
else
  read -r -p "اعتماد خطة الموارد '$profile' على هذا الخادم؟ [y/N]: " answer
  [[ "$answer" =~ ^[Yy]$ ]] || die "لم يتم اعتماد خطة الموارد."
fi

accepted_at="${accepted_at:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
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

printf 'RESOURCE_PROFILE=%s\n' "$profile"
printf 'RESOURCE_PROFILE_DECISION=%s\n' "$decision"
printf 'RESOURCE_PROFILE_SERVER_ID=%s\n' "$SERVER_ID"
printf 'RESOURCE_PROFILE_ACCEPTED_AT=%s\n' "$accepted_at"
printf 'RESOURCE_PROFILE_PLAN_FILE=%s\n' "$PLAN_FILE"
printf 'RESOURCE_EFFECTIVE_MEMORY_KIB=%s\n' "$memory"
printf 'RESOURCE_EFFECTIVE_CPU_MILLICORES=%s\n' "$cpu"
printf 'RESOURCE_AVAILABLE_DISK_KIB=%s\n' "$disk"
