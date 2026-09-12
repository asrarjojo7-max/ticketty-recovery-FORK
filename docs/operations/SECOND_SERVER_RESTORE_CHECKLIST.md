# Ticketty Independent Second-Server Restore Checklist

**Current status: DEFERRED — no independent server is available.**

This procedure must be executed on a host that is independent of the source database host. A same-host scratch database is useful engineering evidence but does not satisfy this gate.

## Required software

- Linux host with sufficient encrypted storage
- PostgreSQL client/server 16.x (`psql`, `pg_dump`, `pg_restore`)
- Node.js 22 or newer (application minimum remains Node.js 20.9)
- pnpm 11.7.0
- rclone configured with the company-owned Google Drive identity
- Docker Engine and Compose v2 for the final application bootstrap
- Checked-out release commit matching the recovery manifest

## Inputs

1. Selected `.dump` archive from `Ticketty Production/01_Database_Backups/`.
2. Matching `.dump.sha256` file.
3. Release archive and source manifest from `05_Release_Archives/` and `06_Recovery_Manifests/`.
4. Fresh secrets supplied out-of-band; never recover secrets from source archives.
5. Empty PostgreSQL 16 target database and separate migration/runtime credentials.

## Procedure

```bash
rclone copyto \
  'gdrive:Ticketty Production/01_Database_Backups/Daily/<backup>.dump' \
  '/secure/restore/<backup>.dump'
rclone copyto \
  'gdrive:Ticketty Production/01_Database_Backups/Daily/<backup>.dump.sha256' \
  '/secure/restore/<backup>.dump.sha256'

cd /secure/restore
sha256sum --check '<backup>.dump.sha256'
pg_restore --list '<backup>.dump' >/dev/null

cd /srv/ticketty
DATABASE_URL='<source-admin-url>' \
VERIFY_BACKUP_FILE='/secure/restore/<backup>.dump' \
SCRATCH_DB_NAME='ticketty_restore_independent' \
./ops/verify-restore.sh
```

`VERIFY_BACKUP_FILE.sha256` must exist next to the archive. Do not set `ALLOW_IN_PLACE_RESTORE=yes`.

## Required post-restore evidence

- Host identifier proving it differs from the source host.
- Start/end UTC timestamps and achieved RTO.
- Backup timestamp and achieved RPO at the recovery point.
- SHA-256 pass and `pg_restore --list` pass.
- Prisma migration status and latest migration name.
- All SQL invariants/contracts pass.
- Runtime role is `ticketty_runtime`, NOSUPERUSER, NOBYPASSRLS, NOINHERIT, with no direct table grants.
- Application starts from the matching production image and readiness is 200.
- RLS no-context probe returns zero tenant rows.
- Source/restore row-count comparison passes for organizations, users, trips, bookings, tickets, payments, and accounting events.
- Operator records the result and retains evidence outside the restored host.

## Assumptions

- Scheduled backup RPO target: at most 24 hours.
- RTO is not approved until measured on the independent host.
- Local prior drills measured 16 seconds and are reference data only, not an independent-host guarantee.
