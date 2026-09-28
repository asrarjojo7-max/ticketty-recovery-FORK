#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${TICKETTY_INSTALL_ROOT:-/srv/ticketty}"
STATE="${TICKETTY_DEPLOYMENT_STATE_DIR:-/var/lib/ticketty/deployment}"
ETC="/etc/ticketty"
die(){ echo "ERROR: $*" >&2; exit 1; }
profile="$STATE/ticketty-profile.json"
profile_script="$ROOT/ops/deployment/profile.sh"
[[ -f "$ETC/ticketty.env" ]] || die "بيئة Ticketty غير موجودة."
[[ -f "$profile_script" ]] || die "profile.sh غير موجود."

export_bundle(){
  local output="${1:-$STATE/ticketty-transfer-$(date -u +%Y%m%dT%H%M%SZ).tar.gz}"
  mkdir -p "$(dirname "$output")"
  "$profile_script" export "$profile" >/dev/null
  local release commit schema server manifest
  release="$(grep "^RELEASE_REF=" "$STATE/state.env" 2>/dev/null | cut -d= -f2- || true)"
  commit="$(grep "^RELEASE_COMMIT=" "$STATE/state.env" 2>/dev/null | cut -d= -f2- || true)"
  server="$(grep "^SERVER_ID=" "$STATE/state.env" 2>/dev/null | cut -d= -f2- || hostname -s)"
  schema="$(find "$ROOT/backend/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" 2>/dev/null | sort | tail -1 || true)"
  manifest="$STATE/transfer-manifest.txt"
  {
    echo "Ticketty Transfer Bundle"
    echo "schema_version=1"
    echo "server_id=$server"
    echo "release=$release"
    echo "commit=$commit"
    echo "latest_migration=$schema"
    echo "secrets_included=false"
    echo "database_included=false"
  } > "$manifest"
  chmod 600 "$manifest"
  tar -czf "$output" -C "$STATE" "$(basename "$profile")" "$(basename "$manifest")"
  sha256sum "$output" > "$output.sha256"
  chmod 600 "$output" "$output.sha256"
  echo "Transfer bundle created: $output"
  echo "Secrets included: NO"
  echo "Database included: NO"
}

import_bundle(){
  local input="${1:-}"
  [[ -f "$input" ]] || die "ملف النقل غير موجود."
  tar -tzf "$input" >/dev/null || die "ملف النقل تالف."
  local temp; temp="$(mktemp -d)"
  trap "rm -rf \"$temp\"" EXIT
  tar -xzf "$input" -C "$temp"
  local p; p="$(find "$temp" -maxdepth 1 -name "ticketty-profile.json" -print -quit)"
  [[ -n "$p" ]] || die "ملف profile غير موجود داخل الحزمة."
  jq -e ".schema_version == 1 and .secrets_included == false" "$p" >/dev/null || die "profile غير آمن."
  mkdir -p "$STATE"
  install -m 0600 "$p" "$profile"
  echo "تم استيراد إعدادات النقل غير السرية."
  echo "لم يتم استيراد أي secret أو بيانات قاعدة بيانات."
}
case "${1:-export}" in
  export) shift; export_bundle "${1:-}" ;;
  import) shift; import_bundle "${1:-}" ;;
  *) die "الاستخدام: transfer.sh export [bundle] | import <bundle>" ;;
esac