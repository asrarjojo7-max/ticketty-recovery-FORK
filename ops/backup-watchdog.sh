#!/usr/bin/env bash
# Independent backup freshness monitor. Schedule this separately from the
# backup job so it can detect that the backup scheduler itself stopped.
set -Eeuo pipefail
umask 077

BACKUP_STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/ticketty/backup-state}"
BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-/var/log/ticketty}"
STALE_HOURS="${BACKUP_STALE_HOURS:-25}"
WEBHOOK_URL="${BACKUP_WEBHOOK_URL:-${WATCHDOG_WEBHOOK_URL:-}}"
STATE_OK="$BACKUP_STATE_DIR/last-success"
NOW_EPOCH="$(date -u +%s)"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$BACKUP_STATE_DIR" "$BACKUP_LOG_DIR"

notify() {
  local message="$1"
  if [[ -z "$WEBHOOK_URL" ]]; then
    return 0
  fi
  curl -fsS --max-time 10 \
    -H "Title: [HIGH] Ticketty backup stale" \
    -H "Tags: warning,floppy_disk" \
    --data-urlencode "$message" \
    "$WEBHOOK_URL" >/dev/null
}

last_success="$(head -n 1 "$STATE_OK" 2>/dev/null || true)"
if [[ ! "$last_success" =~ ^[0-9]+$ ]]; then
  message="No valid successful-backup heartbeat exists on ${HOSTNAME:-unknown-host}."
  printf '%s,BACKUP_STALE,missing\n' "$NOW_ISO" >>"$BACKUP_LOG_DIR/backup-watchdog.csv"
  notify "$message" || echo "[$NOW_ISO] backup alert delivery failed" >&2
  echo "[$NOW_ISO] BACKUP_STALE: $message" >&2
  exit 1
fi

age_seconds=$(( NOW_EPOCH - last_success ))
limit_seconds=$(( STALE_HOURS * 3600 ))
if (( age_seconds > limit_seconds )); then
  age_hours=$(( age_seconds / 3600 ))
  message="Last successful Ticketty backup is ${age_hours}h old; limit is ${STALE_HOURS}h."
  printf '%s,BACKUP_STALE,%s\n' "$NOW_ISO" "$age_seconds" >>"$BACKUP_LOG_DIR/backup-watchdog.csv"
  notify "$message" || echo "[$NOW_ISO] backup alert delivery failed" >&2
  echo "[$NOW_ISO] BACKUP_STALE: $message" >&2
  exit 1
fi

printf '%s,HEALTHY,%s\n' "$NOW_ISO" "$age_seconds" >>"$BACKUP_LOG_DIR/backup-watchdog.csv"
echo "[$NOW_ISO] HEALTHY: last successful backup ${age_seconds}s ago"
