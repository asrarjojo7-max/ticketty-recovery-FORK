#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

API="https://api.cloudflare.com/client/v4"
ENV_FILE=""
TOKEN_FILE=""

die(){ echo "ERROR: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "$1 is required."; }
envv(){ grep "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
setenv(){ local k="$1" v="$2"; if grep -q "^$k=" "$ENV_FILE"; then sed -i "s#^$k=.*#$k=$v#" "$ENV_FILE"; else printf "%s=%s\n" "$k" "$v" >> "$ENV_FILE"; fi; }

cf(){
  local method="$1" path="$2" body="${3:-}"
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || die "Cloudflare API Token is required for this operation."
  local args=(-fsSL -X "$method" -H "Accept: application/json" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
  if [[ -n "$body" ]]; then args+=(-H "Content-Type: application/json" --data "$body"); fi
  curl "${args[@]}" "$API$path"
}

validate_hostname(){
  local host="$1"
  [[ "$host" =~ ^([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$ ]] || die "Invalid hostname format: $host"
}

configure_tunnel(){
  local account="$1" zone="$2" id="$3" host="$4"
  validate_hostname "$host"
  local tunnel
  tunnel="$(cf GET "/accounts/$account/cfd_tunnel/$id")"
  printf "%s" "$tunnel" | jq -e ".success == true" >/dev/null || die "Unable to read Tunnel status."
  local status name
  status="$(printf "%s" "$tunnel" | jq -r ".result.status // unknown")"
  name="$(printf "%s" "$tunnel" | jq -r ".result.name // unknown")"
  printf "Tunnel: %s (%s) - Status: %s\n" "$id" "$name" "$status"

  local body
  body="$(jq -cn --arg h "$host" "{config:{ingress:[{hostname:\$h,service:\"http://web:3000\"},{service:\"http_status:404\"}]}}")"
  cf PUT "/accounts/$account/cfd_tunnel/$id/configurations" "$body" | jq -e ".success == true" >/dev/null || die "Tunnel route configuration failed."

  local records record_id target dns_body
  records="$(cf GET "/zones/$zone/dns_records?name=$host&type=CNAME")"
  record_id="$(printf "%s" "$records" | jq -r ".result[0].id // empty")"
  target="$id.cfargotunnel.com"
  dns_body="$(jq -cn --arg h "$host" --arg t "$target" '{type:"CNAME",name:$h,content:$t,proxied:true}')"

  if [[ -n "$record_id" ]]; then
    cf PUT "/zones/$zone/dns_records/$record_id" "$dns_body" | jq -e ".success == true" >/dev/null || die "DNS record update failed."
  else
    cf POST "/zones/$zone/dns_records" "$dns_body" | jq -e ".success == true" >/dev/null || die "DNS record creation failed."
  fi

  setenv CLOUDFLARE_TUNNEL_ID "$id"
  setenv CLOUDFLARE_HOSTNAME "$host"
  echo "Cloudflare Tunnel and DNS are ready."
}

create_api_tunnel(){
  local account zone host name secret response id token
  account="${CLOUDFLARE_ACCOUNT_ID:-}"
  zone="${CLOUDFLARE_ZONE_ID:-}"
  host="$(envv CLOUDFLARE_HOSTNAME)"
  name="${CLOUDFLARE_TUNNEL_NAME:-ticketty-production}"
  [[ -n "$account" && -n "$zone" && -n "$host" ]] || die "Account ID, Zone ID, and hostname are required."

  local existing_id
  existing_id="$(envv CLOUDFLARE_TUNNEL_ID)"
  if [[ -n "$existing_id" ]]; then
    id="$existing_id"
    echo "Resuming existing Tunnel: $id"
    if [[ ! -s "$TOKEN_FILE" ]]; then
      token="$(cf GET "/accounts/$account/cfd_tunnel/$id/token" | jq -r ".result // empty")"
      [[ -n "$token" ]] || die "Unable to restore Tunnel token."
      printf "%s\n" "$token" > "$TOKEN_FILE"
      chmod 600 "$TOKEN_FILE"
    fi
    configure_tunnel "$account" "$zone" "$id" "$host"
    return
  fi

  secret="$(openssl rand -base64 32 | tr -d "\n")"
  response="$(cf POST "/accounts/$account/cfd_tunnel" "$(jq -cn --arg n "$name" --arg s "$secret" '{name:$n,config_src:"cloudflare",tunnel_secret:$s}')")"
  printf "%s" "$response" | jq -e ".success == true" >/dev/null || die "Tunnel creation failed."
  id="$(printf "%s" "$response" | jq -r ".result.id")"
  [[ "$id" != "null" && -n "$id" ]] || die "Tunnel ID was not returned."
  setenv CLOUDFLARE_TUNNEL_ID "$id"
  token="$(cf GET "/accounts/$account/cfd_tunnel/$id/token" | jq -r ".result // empty")"
  [[ -n "$token" ]] || die "Unable to obtain Tunnel token after creation."
  printf "%s\n" "$token" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"

  # Finish configuration separately so a network failure can be resumed safely.
  configure_tunnel "$account" "$zone" "$id" "$host"
}

wizard(){
  need curl; need jq; need openssl
  [[ -n "$ENV_FILE" && -n "$TOKEN_FILE" ]] || die "--env and --token-file are required."
  if [[ -s "$TOKEN_FILE" ]]; then
    echo "A Tunnel token is already stored."
    local account zone id host
    account="${CLOUDFLARE_ACCOUNT_ID:-}"
    zone="${CLOUDFLARE_ZONE_ID:-}"
    id="$(envv CLOUDFLARE_TUNNEL_ID)"
    host="$(envv CLOUDFLARE_HOSTNAME)"
    if [[ -n "$account" && -n "$zone" && -n "$id" && -n "$host" ]]; then
      configure_tunnel "$account" "$zone" "$id" "$host"
    else
      echo "The existing Cloudflare Tunnel configuration will be used as-is."
    fi
    return
  fi

  echo
  echo "Cloudflare - choose a connection method:"
  echo "  1) I already have a Tunnel"
  echo "  2) Create a Tunnel + configure the domain automatically"
  read -r -p "Choose [1]: " mode
  mode="${mode:-1}"

  case "$mode" in
    1)
      local token
      read -r -s -p "Cloudflare Tunnel Token: " token; printf "\n"
      [[ -n "$token" ]] || die "Tunnel Token is required."
      printf "%s\n" "$token" > "$TOKEN_FILE"
      chmod 600 "$TOKEN_FILE"
      ;;
    2)
      local api_token
      read -r -s -p "Cloudflare API Token: " api_token; printf "\n"
      [[ -n "$api_token" ]] || die "API Token is required."
      export CLOUDFLARE_API_TOKEN="$api_token"
      read -r -p "Cloudflare Account ID: " CLOUDFLARE_ACCOUNT_ID
      read -r -p "Cloudflare Zone ID: " CLOUDFLARE_ZONE_ID
      [[ -n "$CLOUDFLARE_ACCOUNT_ID" && -n "$CLOUDFLARE_ZONE_ID" ]] || die "Account ID and Zone ID are required."
      create_api_tunnel
      unset CLOUDFLARE_API_TOKEN
      ;;
    *) die "Invalid option." ;;
  esac
}

command="${1:-wizard}"
shift || true
while (($#)); do
  case "$1" in
    --env) ENV_FILE="$2"; shift 2 ;;
    --token-file) TOKEN_FILE="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

case "$command" in
  wizard) wizard ;;
  create) create_api_tunnel ;;
  *) die "Unknown command: $command" ;;
esac