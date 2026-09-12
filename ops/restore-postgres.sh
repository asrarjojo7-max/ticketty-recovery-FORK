#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: RESTORE_DATABASE_URL=postgresql://... $0 BACKUP.dump" >&2
  exit 2
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "RESTORE_DATABASE_URL is required" >&2
  exit 2
fi
if [[ -n "${DATABASE_URL:-}" && "$RESTORE_DATABASE_URL" == "$DATABASE_URL" && "${ALLOW_IN_PLACE_RESTORE:-no}" != "yes" ]]; then
  echo "Refusing to restore over DATABASE_URL. Use a scratch database or set ALLOW_IN_PLACE_RESTORE=yes explicitly." >&2
  exit 2
fi

postgres_url="$(POSTGRES_URL_INPUT="$RESTORE_DATABASE_URL" node -e "const u=new URL(process.env.POSTGRES_URL_INPUT);u.searchParams.delete('schema');process.stdout.write(u.toString())")"
backup_file="$1"
if [[ ! -f "$backup_file" ]]; then
  echo "Backup not found: $backup_file" >&2
  exit 2
fi
if [[ -f "$backup_file.sha256" ]]; then
  (
    cd "$(dirname "$backup_file")"
    sha256sum --check "$(basename "$backup_file").sha256"
  )
fi

pg_restore --list "$backup_file" >/dev/null
pg_restore \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-acl \
  --dbname "$postgres_url" \
  "$backup_file"

printf 'Restore completed into the configured scratch database. Run migrations and integrity smoke tests before approval.\n'
