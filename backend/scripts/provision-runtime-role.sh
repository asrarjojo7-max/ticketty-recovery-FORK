#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must be the migration/admin PostgreSQL URL}"
: "${RUNTIME_DATABASE_PASSWORD:?RUNTIME_DATABASE_PASSWORD is required}"

if (( ${#RUNTIME_DATABASE_PASSWORD} < 32 )); then
  echo "RUNTIME_DATABASE_PASSWORD must be at least 32 characters" >&2
  exit 2
fi
if [[ "$RUNTIME_DATABASE_PASSWORD" == replace-with-* || "$RUNTIME_DATABASE_PASSWORD" == "change-me" ]]; then
  echo "RUNTIME_DATABASE_PASSWORD must not be a placeholder" >&2
  exit 2
fi

# The login role owns no objects and inherits no privileges. Application code
# must explicitly SET LOCAL ROLE to one of the four audited NOLOGIN roles.
# psql's :'name' quoting safely turns the secret into a SQL string literal.
psql "${DATABASE_URL%%\?*}" -X --set=ON_ERROR_STOP=1 \
  --set=runtime_password="$RUNTIME_DATABASE_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE ticketty_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketty_runtime')
\gexec

SELECT format(
  'ALTER ROLE ticketty_runtime WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'runtime_password'
)
\gexec

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ticketty_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ticketty_runtime;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ticketty_runtime;
GRANT ticketty_app, ticketty_auth, ticketty_platform, ticketty_accounting_worker TO ticketty_runtime;
ALTER ROLE ticketty_runtime SET statement_timeout = '30s';
ALTER ROLE ticketty_runtime SET idle_in_transaction_session_timeout = '35s';
SQL

echo "Runtime database role provisioned with least-privilege role memberships."
