#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER="$ROOT/cloudflare.sh"

grep -Fq 'need curl; need jq; need openssl; need cloudflared' "$HELPER"
grep -Fq 'Sign in with your browser and configure automatically' "$HELPER"
grep -Fq 'cloudflared tunnel login' "$HELPER"
grep -Fq 'cloudflared tunnel --origincert "$cert" create' "$HELPER"
grep -Fq 'cloudflared tunnel --origincert "$cert" route dns' "$HELPER"
grep -Fq 'credentials-file: /etc/cloudflared/$id.json' "$HELPER"
grep -Fq 'service: http://web:3000' "$HELPER"
grep -Fq 'rm -f "$cert"' "$HELPER"
! grep -Fq 'read -r -s -p "Cloudflare API Token' "$HELPER"

echo "cloudflare setup tests: PASS (browser authorization; no API token for automatic setup)"
