#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# One-command bootstrap for a fresh Linux VPS.
REPO="${TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"
ROOT="${TICKETTY_INSTALL_ROOT:-/srv/ticketty}"

[[ "$(id -u)" -eq 0 ]] || exec sudo -E bash "$0" "$@"
if [[ ! -t 0 && -r /dev/tty ]]; then exec </dev/tty; fi

. /etc/os-release
if ! command -v curl >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  [[ "$ID" == ubuntu || "$ID" == debian || "$ID_LIKE" == *debian* ]] || {
    echo "يحتاج هذا التثبيت curl وgit؛ ثبّتهما يدويًا على هذه التوزيعة." >&2
    exit 1
  }
  apt-get update
  apt-get install -y ca-certificates curl git
fi

mkdir -p "$(dirname "$ROOT")"
if [[ -d "$ROOT/.git" ]]; then
  echo "Ticketty موجود بالفعل في $ROOT"
  echo "تحديث أدوات الـbootstrap من المصدر..."
  git -C "$ROOT" fetch --force "$REPO" master >/dev/null
  git -C "$ROOT" show FETCH_HEAD:ops/deployment/ticketty > /usr/local/bin/ticketty
  git -C "$ROOT" show FETCH_HEAD:ops/deployment/bootstrap.sh > /usr/local/bin/ticketty-bootstrap
else
  [[ ! -e "$ROOT" ]] || { echo "المسار موجود لكنه ليس مستودع Git: $ROOT" >&2; exit 1; }
  git clone "$REPO" "$ROOT"
  install -m 0755 "$ROOT/ops/deployment/ticketty" /usr/local/bin/ticketty
  install -m 0755 "$ROOT/ops/deployment/bootstrap.sh" /usr/local/bin/ticketty-bootstrap
fi

chmod 0755 /usr/local/bin/ticketty /usr/local/bin/ticketty-bootstrap

echo
echo "Ticketty bootstrap جاهز."
exec /usr/local/bin/ticketty install