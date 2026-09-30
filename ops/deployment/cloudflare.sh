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
ensure_cloudflared(){
  command -v cloudflared >/dev/null 2>&1 && return 0
  [[ -r /etc/os-release ]] || die "Unable to determine the operating system for cloudflared installation."
  . /etc/os-release
  [[ "$ID" == ubuntu || "$ID" == debian ]] || die "Automatic cloudflared installation supports Ubuntu and Debian only."
  command -v apt-get >/dev/null 2>&1 || die "apt-get is required to install cloudflared."
  install -m 0755 -d /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  chmod a+r /usr/share/keyrings/cloudflare-main.gpg
  printf 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main\n' > /etc/apt/sources.list.d/cloudflared.list
  apt-get update
  apt-get install -y cloudflared
  command -v cloudflared >/dev/null 2>&1 || die "cloudflared installation failed."
}

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
    echo "A Cloudflare Tunnel token is already stored."
    return
  fi

  echo
  echo "Cloudflare setup"
  echo "  1) Sign in with your browser and configure automatically"
  echo "  2) Use an existing Tunnel token"
  echo "  3) Configure later"
  local mode
  read -r -p "Choose [1]: " mode
  mode="${mode:-1}"

  case "$mode" in
    1)
      ensure_cloudflared
      local host name login_home cert create_output id config_dir
      host="$(envv CLOUDFLARE_HOSTNAME)"
      [[ -n "$host" && "$host" != PLACEHOLDER ]] || die "A domain is required before Cloudflare setup."
      config_dir="$(dirname "$TOKEN_FILE")/../cloudflared"
      config_dir="$(readlink -m "$config_dir")"
      install -d -m 0750 -o root -g 65532 "$config_dir"
      login_home="$(mktemp -d /tmp/ticketty-cloudflared-login.XXXXXX)"
      chmod 0700 "$login_home"

      printf "\n  Step 1/3: Authorize Cloudflare in your browser.\n"
      printf "  A login URL will appear below. Open it, sign in, and select: %s\n\n" "$host"
      HOME="$login_home" cloudflared tunnel login
      cert="$login_home/.cloudflared/cert.pem"
      [[ -s "$cert" ]] || { rm -rf "$login_home"; die "Cloudflare authorization did not produce a certificate."; }

      printf "\n  Step 2/3: Creating the Ticketty Tunnel...\n"
      name="ticketty-$(hostname -s | tr -cd "A-Za-z0-9-" | cut -c1-24)"
      create_output="$(HOME="$login_home" cloudflared tunnel --origincert "$cert" create --credentials-file "$config_dir/tunnel.json" "$name" 2>&1)" || { printf "%s\n" "$create_output" >&2; rm -rf "$login_home"; die "Unable to create Cloudflare Tunnel."; }
      printf "%s\n" "$create_output"
      id="$(printf "%s\n" "$create_output" | sed -nE "s/.*with id ([0-9a-f-]{36}).*/\1/p" | tail -1)"
      [[ -n "$id" ]] || { rm -rf "$login_home"; die "Cloudflare did not return a Tunnel ID."; }

      printf "\n  Step 3/3: Creating DNS route...\n"
      HOME="$login_home" cloudflared tunnel --origincert "$cert" route dns "$id" "$host" || { rm -rf "$login_home"; die "Unable to create the Cloudflare DNS route."; }
      mv "$config_dir/tunnel.json" "$config_dir/$id.json"
      chmod 0640 "$config_dir/$id.json"
      chown root:65532 "$config_dir/$id.json"
      cat > "$config_dir/config.yml" <<EOF
tunnel: $id
credentials-file: /etc/cloudflared/$id.json
ingress:
  - hostname: $host
    service: http://web:3000
  - service: http_status:404
EOF
      chmod 0644 "$config_dir/config.yml"
      rm -f "$cert"
      rm -rf "$login_home"
      setenv CLOUDFLARE_TUNNEL_ID "$id"
      setenv CLOUDFLARE_CONFIG_DIR "$config_dir"
      setenv CLOUDFLARE_HOSTNAME "$host"
      echo "Cloudflare Tunnel and DNS are configured."
      ;;
    2)
      local token
      read -r -s -p "Cloudflare Tunnel Token: " token
      printf "\n"
      [[ -n "$token" ]] || die "Tunnel Token is required."
      printf "%s\n" "$token" > "$TOKEN_FILE"
      chmod 600 "$TOKEN_FILE"
      echo "Cloudflare Tunnel token saved."
      ;;
    3)
      setenv CLOUDFLARE_STATUS DEFERRED
      echo "Cloudflare configuration deferred."
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
