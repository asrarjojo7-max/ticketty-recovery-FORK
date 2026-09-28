#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" -eq 0 ]] || { echo "استخدم sudo/root." >&2; exit 1; }

repo="\x24{TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"
root="\x24{TICKETTY_INSTALL_ROOT:-/srv/ticketty}"

read -r -p "مستودع Ticketty [$repo]: " v
[[ -n "$v" ]] && repo="$v"
read -r -p "مسار التثبيت [$root]: " v
[[ -n "$v" ]] && root="$v"

mkdir -p "$(dirname "$root")"
if [[ -d "$root/.git" ]]; then
  echo "المستودع موجود: $root"
else
  git clone "$repo" "$root"
fi

install -m 0755 "$root/ops/deployment/ticketty" /usr/local/bin/ticketty
install -m 0755 "$root/ops/deployment/bootstrap.sh" /usr/local/bin/ticketty-bootstrap

echo
echo "جاهز."
echo "شغّل: sudo ticketty install"
