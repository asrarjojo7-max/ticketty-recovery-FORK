#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

API="https://api.cloudflare.com/client/v4"
ENV_FILE=""; TOKEN_FILE=""
die(){ echo "ERROR: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "$1 مطلوب."; }
envv(){ grep "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
setenv(){ local k="$1" v="$2"; if grep -q "^$k=" "$ENV_FILE"; then sed -i "s#^$k=.*#$k=$v#" "$ENV_FILE"; else printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"; fi; }

cf(){
  local method="$1" path="$2" body="${3:-}"
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || die "Cloudflare API Token مطلوب."
  if [[ -n "$body" ]]; then
    curl -fsSL -X "$method" -H 'Content-Type: application/json' -H 'Accept: application/json' -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" --data "$body" "$API$path"
  else
    curl -fsSL -X "$method" -H 'Accept: application/json' -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$API$path"
  fi
}

create_api_tunnel(){
  local account zone host name secret response id token records record_id target body
  account="${CLOUDFLARE_ACCOUNT_ID:-}"; zone="${CLOUDFLARE_ZONE_ID:-}"; host="$(envv CLOUDFLARE_HOSTNAME)"
  name="${CLOUDFLARE_TUNNEL_NAME:-ticketty-production}"
  [[ -n "$account" && -n "$zone" && -n "$host" ]] || die "Account ID وZone ID وhostname مطلوبة."
  secret="$(openssl rand -base64 32 | tr -d '\n')"
  response="$(cf POST "/accounts/$account/cfd_tunnel" "$(jq -cn --arg n "$name" --arg s "$secret" '{name:$n,config_src:"cloudflare",tunnel_secret:$s}')")"
  printf '%s' "$response" | jq -e '.success == true' >/dev/null || die "إنشاء Tunnel فشل."
  id="$(printf '%s' "$response" | jq -r '.result.id')"
  token="$(cf GET "/accounts/$account/cfd_tunnel/$id/token" | jq -r '.result // empty')"
  [[ -n "$token" ]] || die "تعذر الحصول على Tunnel token."
  printf '%s\n' "$token" > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"

  body="$(jq -cn --arg h "$host" '{config:{ingress:[{hostname:$h,service:"http://web:3000"},{service:"http_status:404"}]}}')"
  cf PUT "/accounts/$account/cfd_tunnel/$id/configurations" "$body" | jq -e '.success == true' >/dev/null || die "ضبط ingress فشل."

  records="$(cf GET "/zones/$zone/dns_records?name=$host&type=CNAME")"
  record_id="$(printf '%s' "$records" | jq -r '.result[0].id // empty')"
  target="$id.cfargotunnel.com"
  body="$(jq -cn --arg h "$host" --arg t "$target" '{type:"CNAME",name:$h,content:$t,proxied:true}')"
  if [[ -n "$record_id" ]]; then
    cf PUT "/zones/$zone/dns_records/$record_id" "$body" | jq -e '.success == true' >/dev/null
  else
    cf POST "/zones/$zone/dns_records" "$body" | jq -e '.success == true' >/dev/null
  fi
  setenv CLOUDFLARE_TUNNEL_ID "$id"
  echo "Tunnel: $id"
  echo "Hostname: $host"
}

wizard(){
  need curl; need jq; need openssl
  [[ -n "$ENV_FILE" && -n "$TOKEN_FILE" ]] || die "--env و--token-file مطلوبة."
  [[ -s "$TOKEN_FILE" ]] && { echo "Tunnel token موجود مسبقًا."; return; }
  echo "Cloudflare"
  echo "  1) لدي Tunnel جاهز"
  echo "  2) إنشاء Tunnel + DNS تلقائيًا"
  local mode token
  read -r -p "اختر [1]: " mode; [[ -n "$mode" ]] || mode=1
  case "$mode" in
    1) read -r -s -p "Tunnel Token: " token; printf '\n'; [[ -n "$token" ]] || die "Token مطلوب."; printf '%s\n' "$token" > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE";;
    2)
      read -r -s -p "Cloudflare API Token: " token; printf '\n'; export CLOUDFLARE_API_TOKEN="$token"
      read -r -p "Cloudflare Account ID: " token; export CLOUDFLARE_ACCOUNT_ID="$token"
      read -r -p "Cloudflare Zone ID: " token; export CLOUDFLARE_ZONE_ID="$token"
      create_api_tunnel
      ;;
    *) die "خيار غير صالح." ;;
  esac
}

command="${1:-wizard}"
shift || true
while (($#)); do case "$1" in --env) ENV_FILE="$2"; shift 2;; --token-file) TOKEN_FILE="$2"; shift 2;; *) die "وسيط غير معروف: $1";; esac; done
case "$command" in
  wizard) wizard;;
  create) create_api_tunnel;;
  *) die "أمر غير معروف.";;
esac
