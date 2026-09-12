#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 2
fi

postgres_url="$(POSTGRES_URL_INPUT="$DATABASE_URL" node -e "const u=new URL(process.env.POSTGRES_URL_INPUT);u.searchParams.delete('schema');process.stdout.write(u.toString())")"
backup_dir="${BACKUP_DIR:-$(pwd)/backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_file="$backup_dir/ticketty-$timestamp.dump"
tmp_file="$final_file.tmp"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

pg_dump "$postgres_url" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file "$tmp_file"

mv "$tmp_file" "$final_file"
(
  cd "$backup_dir"
  sha256sum "$(basename "$final_file")" > "$(basename "$final_file").sha256"
)
trap - EXIT

printf 'Backup created: %s\nChecksum: %s\n' "$final_file" "$final_file.sha256"
