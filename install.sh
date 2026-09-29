#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# One-command bootstrap for a fresh Linux VPS.
REPO="${TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"
ROOT="${TICKETTY_INSTALL_ROOT:-/srv/ticketty}"

printf '\n========================================\n'
printf ' Ticketty Production Installer\n'
printf '========================================\n'
printf 'Bootstrap started.\n'
printf 'Install root: %s\n' "$ROOT"
printf 'Repository:   %s\n\n' "$REPO"

[[ "$(id -u)" -eq 0 ]] || exec sudo -E bash "$0" "$@"
if [[ ! -t 0 && -r /dev/tty ]]; then exec </dev/tty; fi

export GIT_TERMINAL_PROMPT=0
export GIT_HTTP_LOW_SPEED_LIMIT="${GIT_HTTP_LOW_SPEED_LIMIT:-1000}"
export GIT_HTTP_LOW_SPEED_TIME="${GIT_HTTP_LOW_SPEED_TIME:-30}"

. /etc/os-release
printf '[1/4] Checking bootstrap requirements...\n'
if ! command -v curl >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  [[ "$ID" == ubuntu || "$ID" == debian || "$ID_LIKE" == *debian* ]] || {
    echo "يحتاج هذا التثبيت curl وgit؛ ثبّتهما يدويًا على هذه التوزيعة." >&2
    exit 1
  }
  printf 'Installing missing bootstrap packages...\n'
  apt-get update
  apt-get install -y ca-certificates curl git
  printf 'Bootstrap packages ready.\n'
fi

printf '[2/4] Preparing Ticketty source...\n'
mkdir -p "$(dirname "$ROOT")"
if [[ -d "$ROOT/.git" ]]; then
  echo "Ticketty موجود بالفعل في $ROOT"
  echo "تحديث أدوات الـbootstrap من المصدر..."
  printf 'Fetching deployment control scripts from GitHub...\n'
  git -C "$ROOT" fetch --force "$REPO" master
  git -C "$ROOT" show FETCH_HEAD:ops/deployment/ticketty > /usr/local/bin/ticketty
  git -C "$ROOT" show FETCH_HEAD:ops/deployment/bootstrap.sh > /usr/local/bin/ticketty-bootstrap
  printf 'Deployment control scripts refreshed.\n'
else
  [[ ! -e "$ROOT" ]] || { echo "المسار موجود لكنه ليس مستودع Git: $ROOT" >&2; exit 1; }
  printf 'Cloning Ticketty source...\n'
  git clone "$REPO" "$ROOT"
  install -m 0755 "$ROOT/ops/deployment/ticketty" /usr/local/bin/ticketty
  install -m 0755 "$ROOT/ops/deployment/bootstrap.sh" /usr/local/bin/ticketty-bootstrap
  printf 'Ticketty source ready.\n'
fi

printf '[3/4] Preparing deployment manager...\n'
chmod 0755 /usr/local/bin/ticketty /usr/local/bin/ticketty-bootstrap
printf 'Deployment manager ready.\n'

printf '[4/4] Starting Ticketty installer wizard...\n'
exec /usr/local/bin/ticketty install