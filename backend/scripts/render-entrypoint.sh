#!/usr/bin/env sh
set -eu

: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"
: "${RUNTIME_DATABASE_PASSWORD:?RUNTIME_DATABASE_PASSWORD is required}"
: "${INITIAL_ADMIN_EMAIL:?INITIAL_ADMIN_EMAIL is required}"
: "${INITIAL_ADMIN_PASSWORD:?INITIAL_ADMIN_PASSWORD is required}"

# The application itself must never use Render's administrator connection.
# Bootstrap with it, then replace DATABASE_URL with the restricted role before
# starting Nest. All operations are idempotent, so a Render restart is safe.
export DATABASE_URL="$MIGRATION_DATABASE_URL"

pnpm exec prisma migrate deploy
pnpm db:provision-runtime
node scripts/seed-render.mjs

export DATABASE_URL="$(node -e '
const url = new URL(process.env.MIGRATION_DATABASE_URL);
url.username = "ticketty_runtime";
url.password = process.env.RUNTIME_DATABASE_PASSWORD;
process.stdout.write(url.toString());
')"
# Bootstrap secrets are no longer needed once the runtime DATABASE_URL is built.
# Do not expose the initial admin password to the long-lived Nest process.
unset MIGRATION_DATABASE_URL RUNTIME_DATABASE_PASSWORD INITIAL_ADMIN_PASSWORD

exec node dist/main.js
