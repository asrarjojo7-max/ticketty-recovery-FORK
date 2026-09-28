#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

STATE_DIR="${TICKETTY_DEPLOYMENT_STATE_DIR:-/var/lib/ticketty/deployment}"
ETC_ROOT="/etc/ticketty"
PROFILE_DIR="$STATE_DIR"

die(){ echo "ERROR: $*" >&2; exit 1; }
load_value(){
  local key="$1"
  if [[ -f "$PROFILE_DIR/profile.json" ]]; then
    jq -r --arg key "$key" '.[$key] // empty' "$PROFILE_DIR/profile.json"
  fi
}


set_state(){
  local key="$1" value="$2" tmp
  install -d -m 0700 "$STATE_DIR"
  tmp="$(mktemp "$STATE_DIR/state.XXXXXX")"
  [[ -f "$STATE_DIR/state.env" ]] && awk -F= -v k="$key" '$1!=k{print}' "$STATE_DIR/state.env" > "$tmp" || true
  printf "%s=%s\n" "$key" "$value" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$STATE_DIR/state.env"
}
export_profile(){
  local output="${1:-$PROFILE_DIR/ticketty-profile.json}"
  [[ -f "$ETC_ROOT/ticketty.env" ]] || die "ملف بيئة Ticketty غير موجود."
  install -d -m 0700 "$PROFILE_DIR"
  local repo root domain tunnel channel backup weekly monthly backend web proxy server
  repo="$(grep "^TICKETTY_GITHUB_REPOSITORY=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || true)"
  root="$(grep "^TICKETTY_INSTALL_ROOT=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || true)"
  [[ -n "$root" ]] || root="/srv/ticketty"
  domain="$(grep "^APP_ORIGIN=" "$ETC_ROOT/ticketty.env" | sed "s#^APP_ORIGIN=https://##" || true)"
  tunnel="$(grep "^CLOUDFLARE_TUNNEL_ID=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || true)"
  channel="$(grep "^TICKETTY_RELEASE_CHANNEL=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || echo stable)"
  backup="$(grep "^RCLONE_REMOTE=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || true)"
  weekly="$(grep "^RCLONE_WEEKLY_REMOTE=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || true)"
  monthly="$(grep "^RCLONE_MONTHLY_REMOTE=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || true)"
  backend="$(grep "^BACKEND_PORT=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || echo 3001)"
  web="$(grep "^WEB_PORT=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || echo 3000)"
  proxy="$(grep "^TRUST_PROXY_HOPS=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || echo 1)"
  server="$(grep "^SERVER_ID=" "$ETC_ROOT/ticketty.env" | cut -d= -f2- || hostname -s)"
  jq -n --arg repo "$repo" --arg root "$root" --arg domain "$domain" --arg tunnel "$tunnel" \
    --arg channel "$channel" --arg backup "$backup" --arg weekly "$weekly" --arg monthly "$monthly" \
    --arg server "$server" --arg backend "$backend" --arg web "$web" --arg proxy "$proxy" \
    '{schema_version:1,secrets_included:false,server_id:$server,repository:$repo,install_root:$root,domain:$domain,cloudflare_tunnel_id:$tunnel,release_channel:$channel,backup_remote:$backup,backup_weekly_remote:$weekly,backup_monthly_remote:$monthly,backend_port:($backend|tonumber),web_port:($web|tonumber),trust_proxy_hops:($proxy|tonumber)}' > "$output"
  chmod 600 "$output"
  echo "تم تصدير profile آمن: $output"
}

import_profile(){
  local input="$1"
  [[ -f "$input" ]] || die "ملف profile غير موجود."
  jq -e '.schema_version == 1 and .secrets_included == false' "$input" >/dev/null || die "profile غير صالح أو يحتوي على أسرار."
  install -d -m 0700 "$PROFILE_DIR"
  install -m 0600 "$input" "$PROFILE_DIR/profile.json"
  local value
  value="$(load_value install_root)"; [[ -n "$value" ]] && set_state PROJECT_DIR "$value"
  value="$(load_value repository)"; [[ -n "$value" ]] && set_state REPOSITORY "$value"
  value="$(load_value domain)"; [[ -n "$value" ]] && set_state APP_HOSTNAME "$value"
  # A new VPS must receive a new identity. The source server ID remains metadata only.
  value="$(load_value release_channel)"; [[ -n "$value" ]] && set_state RELEASE_CHANNEL "$value"
  value="$(load_value backup_remote)"; [[ -n "$value" ]] && set_state BACKUP_REMOTE "$value"
  value="$(load_value backup_weekly_remote)"; [[ -n "$value" ]] && set_state BACKUP_WEEKLY_REMOTE "$value"
  value="$(load_value backup_monthly_remote)"; [[ -n "$value" ]] && set_state BACKUP_MONTHLY_REMOTE "$value"
  value="$(load_value backend_port)"; [[ -n "$value" ]] && set_state BACKEND_PORT "$value"
  value="$(load_value web_port)"; [[ -n "$value" ]] && set_state WEB_PORT "$value"
  value="$(load_value trust_proxy_hops)"; [[ -n "$value" ]] && set_state TRUST_PROXY_HOPS "$value"
  value="$(load_value cloudflare_tunnel_id)"; [[ -n "$value" ]] && set_state CLOUDFLARE_TUNNEL_ID "$value"
  echo "تم استيراد profile. لم يتم استيراد أي سر."
}

command="${1:-export}"
case "$command" in
  export) export_profile "${2:-}" ;;
  import) [[ -n "${2:-}" ]] || die "ملف profile مطلوب."; import_profile "$2" ;;
  *) die "أمر profile غير معروف." ;;
esac