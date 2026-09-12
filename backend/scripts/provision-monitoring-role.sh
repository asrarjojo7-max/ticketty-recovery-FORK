#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${MIGRATION_DATABASE_URL:-${DATABASE_URL:?DATABASE_URL must be the PostgreSQL admin URL}}"
: "${MONITORING_DATABASE_PASSWORD:?MONITORING_DATABASE_PASSWORD is required}"
admin_url="${MIGRATION_DATABASE_URL:-$DATABASE_URL}"

if (( ${#MONITORING_DATABASE_PASSWORD} < 32 )); then
  echo "MONITORING_DATABASE_PASSWORD must be at least 32 characters" >&2
  exit 2
fi
if [[ "$MONITORING_DATABASE_PASSWORD" == replace-with-* || "$MONITORING_DATABASE_PASSWORD" == "change-me" ]]; then
  echo "MONITORING_DATABASE_PASSWORD must not be a placeholder" >&2
  exit 2
fi

psql "${admin_url%%\?*}" -X --set=ON_ERROR_STOP=1 \
  --set=monitor_password="$MONITORING_DATABASE_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE ticketty_monitor LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'monitor_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketty_monitor')
\gexec

SELECT format(
  'ALTER ROLE ticketty_monitor WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'monitor_password'
)
\gexec

GRANT pg_monitor TO ticketty_monitor;
SELECT format('GRANT CONNECT ON DATABASE %I TO ticketty_monitor', current_database())
\gexec
ALTER ROLE ticketty_monitor SET statement_timeout = '10s';
SQL

echo "Dedicated ticketty_monitor role provisioned without application-table privileges."
