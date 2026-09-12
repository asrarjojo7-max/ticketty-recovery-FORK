#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to archive a dirty working tree; commit and verify first." >&2
  exit 2
fi

output_dir="${1:-$repo_root/release-archives}"
timestamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
commit="$(git rev-parse HEAD)"
short="$(git rev-parse --short=12 HEAD)"
branch="$(git branch --show-current)"
release="ticketty-production-release-${timestamp}-${short}"
mkdir -p "$output_dir"

archive="$output_dir/$release.tar.gz"
git archive --format=tar.gz --prefix="$release/" --output="$archive" HEAD
sha256sum "$archive" >"$archive.sha256"
tar -tzf "$archive" >/dev/null

for item in \
  "backend:backend" \
  "web:web" \
  "database:backend/prisma/schema.prisma" \
  "migrations:backend/prisma/migrations" \
  "shared:.github compose.yaml .env.production.example docs ops"; do
  name="${item%%:*}"
  paths="${item#*:}"
  # shellcheck disable=SC2086 -- the reviewed path list is intentionally split.
  git archive --format=tar.gz --prefix="$release/" \
    --output="$output_dir/$release-$name.tar.gz" HEAD $paths
  sha256sum "$output_dir/$release-$name.tar.gz" \
    >"$output_dir/$release-$name.tar.gz.sha256"
  tar -tzf "$output_dir/$release-$name.tar.gz" >/dev/null
done

latest_migration="$(basename "$(printf '%s\n' backend/prisma/migrations/*/migration.sql | sort | tail -1 | xargs dirname)")"
required_env="$(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.production.example | paste -sd, -)"
manifest="$output_dir/$release-manifest.txt"
cat >"$manifest" <<EOF
Ticketty Production Source Archive

Git commit: $commit
Branch: $branch
Archive timestamp UTC: $timestamp
Backend version: $(node -p "require('./backend/package.json').version")
Web version: $(node -p "require('./web/package.json').version")
Database schema: backend/prisma/schema.prisma
Latest migration: $latest_migration
Node runtime: $(node --version)
Package manager: $(pnpm --version)
Important runtime dependencies: Next.js 16, React 19, NestJS 11, Prisma 6, PostgreSQL 16
Required environment variable names: $required_env
Required external services: PostgreSQL 16, HTTPS edge/Cloudflare tunnel, Google Drive via rclone, Prometheus, Alertmanager
Backend build command: cd backend && pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build
Web build command: cd web && pnpm install --frozen-lockfile && pnpm build
Database migration command: cd backend && pnpm exec prisma migrate deploy && pnpm db:provision-runtime && pnpm db:provision-monitoring && pnpm test:db:invariants
Production start: systemd templates under ops/systemd or compose.yaml
Backup procedure: docs/operations/backup-restore.md
Recovery procedure: docs/operations/SECOND_SERVER_RESTORE_CHECKLIST.md
Secrets included: NO; git archive includes tracked files only and .env files are ignored except placeholder examples.
EOF
sha256sum "$manifest" >"$manifest.sha256"

printf 'RELEASE_ARCHIVE=%s\nMANIFEST=%s\nCOMMIT=%s\n' "$archive" "$manifest" "$commit"
