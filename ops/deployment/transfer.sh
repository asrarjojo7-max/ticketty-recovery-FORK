#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="${TICKETTY_INSTALL_ROOT:-/srv/ticketty}"
STATE="${TICKETTY_DEPLOYMENT_STATE_DIR:-/var/lib/ticketty/deployment}"
ETC="${TICKETTY_ETC_ROOT:-/etc/ticketty}"
die(){ echo "ERROR: $*" >&2; exit 1; }
profile="$STATE/ticketty-profile.json"
profile_script="$ROOT/ops/deployment/profile.sh"
[[ -f "$profile_script" ]] || die "profile.sh is missing."

export_bundle(){
  [[ -f "$ETC/ticketty.env" ]] || die "Ticketty environment is not available for export."
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
  [[ -f "$input" ]] || die "Transfer bundle is missing."
  [[ -f "$input.sha256" ]] || die "checksum Transfer bundle is missing."
  (
    cd "$(dirname "$input")"
    sha256sum --check "$(basename "$input").sha256" >/dev/null
  ) || die "Transfer bundle checksum does not match."
  tar -tzf "$input" >/dev/null || die "Transfer bundle is corrupted."
  if tar -tzf "$input" | awk 'index($0, "..") || substr($0,1,1)=="/" {bad=1} END{exit bad}'; then :; else die "Transfer bundle contains an unsafe path."; fi
  local temp; temp="$(mktemp -d)"
  trap "rm -rf \"$temp\"" EXIT
  tar -xzf "$input" -C "$temp" --no-same-owner
  local p manifest release commit
  p="$(find "$temp" -maxdepth 1 -name "ticketty-profile.json" -print -quit)"
  [[ -n "$p" ]] || die "Profile file is missing from the bundle."
  manifest="$(find "$temp" -maxdepth 1 -name "transfer-manifest.txt" -print -quit)"
  [[ -n "$manifest" ]] || die "Transfer manifest is missing from the bundle."
  jq -e ".schema_version == 1 and .secrets_included == false" "$p" >/dev/null || die "Profile is unsafe."
  grep -qx "secrets_included=false" "$manifest" || die "Manifest indicates disallowed secrets."
  grep -qx "database_included=false" "$manifest" || die "Manifest indicates a disallowed database."
  release="$(grep "^release=" "$manifest" | cut -d= -f2- || true)"
  commit="$(grep "^commit=" "$manifest" | cut -d= -f2- || true)"
  if [[ -n "$release" ]]; then
    [[ "$release" =~ ^v?[0-9][A-Za-z0-9._+-]*$ ]] || die "Invalid transfer release."
  fi
  if [[ -n "$commit" ]]; then
    [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || die "Invalid transfer commit."
  fi
  mkdir -p "$STATE"
  chmod 700 "$STATE"
  install -m 0600 "$p" "$profile"
  if [[ -n "$release" ]]; then
    local state_file="$STATE/state.env" tmp_state
    tmp_state="$(mktemp "$STATE/state.XXXXXX")"
    [[ -f "$state_file" ]] && awk -F= '$1!="TRANSFER_SOURCE_RELEASE" && $1!="TRANSFER_SOURCE_COMMIT"{print}' "$state_file" > "$tmp_state" || true
    printf "TRANSFER_SOURCE_RELEASE=%s\n" "$release" >> "$tmp_state"
    [[ -n "$commit" ]] && printf "TRANSFER_SOURCE_COMMIT=%s\n" "$commit" >> "$tmp_state"
    chmod 600 "$tmp_state"
    mv "$tmp_state" "$state_file"
  fi
  echo "Non-secret transfer settings imported."
  echo "No secrets or database data were imported."
}
case "${1:-export}" in
  export) shift; export_bundle "${1:-}" ;;
  import) shift; import_bundle "${1:-}" ;;
  *) die "Usage: transfer.sh export [bundle] | import <bundle>" ;;
esac
