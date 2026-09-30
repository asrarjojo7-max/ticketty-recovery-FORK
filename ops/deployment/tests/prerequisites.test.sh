#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TICKETTY="$ROOT/ticketty"

packages_block="$(awk '/^packages\(\)/,/^resources\(\)/ {if ($0 !~ /^resources\(\)/) print}' "$TICKETTY")"

grep -Fq 'docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin' <<<"$packages_block"
grep -Fq 'https://download.docker.com/linux/$docker_os/gpg' <<<"$packages_block"
grep -Fq 'docker_os=ubuntu' <<<"$packages_block"
grep -Fq 'docker_os=debian' <<<"$packages_block"
grep -Fq 'docker info >/dev/null 2>&1' <<<"$packages_block"
grep -Fq 'docker compose version >/dev/null 2>&1' <<<"$packages_block"
grep -Fq 'docker run --rm hello-world' <<<"$packages_block"
grep -Fq 'gnupg' <<<"$packages_block"
! grep -Fq 'apt-get install -y cloudflared' <<<"$packages_block"
! grep -Fq 'https://pkg.cloudflare.com/cloudflared' <<<"$packages_block"
grep -Fq "dpkg-query -W -f='\${Status}\\n' docker.io" <<<"$packages_block"
! grep -Fq 'apt-get install -y ca-certificates git curl openssl jq util-linux docker.io docker-compose-v2' <<<"$packages_block"

echo "deployment prerequisites tests: PASS (official Docker packages and runtime smoke test required)"
