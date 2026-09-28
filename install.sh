#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# One-command bootstrap for a fresh Linux VPS.
# The deployment manager performs the actual idempotent install and resume logic.
REPO="${TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"
ROOT="${TICKETTY_INSTALL_ROOT:-/srv/ticketty}"

[[ "$(id -u)" -eq 0 ]] || exec sudo -E bash "$0" "$@"
if [[ -t 0 ]]; then :; elif [[ -r /dev/tty ]]; then exec </dev/tty; fi

install_bootstrap_dependencies(){
  local missing=0 x
  for x in curl tar; do command -v "$x" >/dev/null 2>&1 || missing=1; done
  [[ "$missing" -eq 0 ]] && return
  [[ -r /etc/os-release ]] || { echo "لا يمكن تحديد نظام التشغيل." >&2; exit 1; }
  . /etc/os-release
  [[ "$ID" == ubuntu || "$ID" == debian || "$ID_LIKE" == *debian* ]] || { echo "ثبّت curl وtar يدويًا ثم أعد المحاولة." >&2; exit 1; }
  apt-get update
  apt-get install -y ca-certificates curl tar
}

install_bootstrap_dependencies
mkdir -p "$(dirname "$ROOT")"

tmp="$(mktemp -d /tmp/ticketty-bootstrap.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
archive="$tmp/ticketty.tar.gz"
curl -fsSL --retry 3 --connect-timeout 10 "https://github.com/mogahedadamy/ticketty-recovery/archive/refs/heads/master.tar.gz" -o "$archive"
mkdir "$tmp/src"
tar -xzf "$archive" -C "$tmp/src" --strip-components=1

if [[ -d "$ROOT/.git" ]]; then
  echo "Ticketty موجود بالفعل في $ROOT"
else
  rm -rf "$ROOT"
  mkdir -p "$ROOT"
  cp -a "$tmp/src/." "$ROOT/"
fi

if ! command -v git >/dev/null 2>&1; then
  . /etc/os-release
  if [[ "$ID" == ubuntu || "$ID" == debian || "$ID_LIKE" == *debian* ]]; then
    apt-get update
    apt-get install -y git
  else
    echo "git مطلوب للتحديثات اللاحقة." >&2
    exit 1
  fi
fi

install -m 0755 "$ROOT/ops/deployment/ticketty" /usr/local/bin/ticketty
install -m 0755 "$ROOT/ops/deployment/bootstrap.sh" /usr/local/bin/ticketty-bootstrap

echo
echo "Ticketty bootstrap جاهز."
exec /usr/local/bin/ticketty install