#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" -eq 0 ]] || { echo "ERROR: Run as sudo/root." >&2; exit 1; }

repo="${TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"
root="${TICKETTY_INSTALL_ROOT:-/srv/ticketty}"

read -r -p "Ticketty repository [$repo]: " v
[[ -n "$v" ]] && repo="$v"
read -r -p "Install root [$root]: " v
[[ -n "$v" ]] && root="$v"

mkdir -p "$(dirname "$root")"
if [[ -d "$root/.git" ]]; then
  echo "Repository already present: $root"
else
  git clone "$repo" "$root"
fi

install -m 0755 "$root/ops/deployment/ticketty" /usr/local/bin/ticketty
install -m 0755 "$root/ops/deployment/bootstrap.sh" /usr/local/bin/ticketty-bootstrap

echo
echo "Ready."
echo "Run: sudo ticketty install"
