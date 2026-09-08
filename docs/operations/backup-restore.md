# PostgreSQL Backup and Restore

## Backup

Use a PostgreSQL client compatible with the server major version:

```bash
DATABASE_URL='postgresql://...' ./ops/backup-postgres.sh
```

The script creates a custom-format dump atomically and writes a SHA-256 checksum under `backups/` (or `BACKUP_DIR`). Upload both files to encrypted off-site storage. A local Docker volume or local dump alone is not a disaster-recovery backup.

Recommended initial policy: daily backups, retention aligned with the data-retention policy, and monitored upload failures.

## Automated restore drill (Phase 7 — `ops/verify-restore.sh`)

The full drill is a single command. It fails fast at the first broken step and cleans up after itself:

```bash
DATABASE_URL='postgresql://...' BACKUP_DIR=/tmp/drill ./ops/verify-restore.sh
```

What it proves (each numbered step is a hard gate):

1. **Backup** — real `pg_dump` custom format + SHA-256 from the live database.
2. **Restore** — into a fresh scratch DB (never the original; in-place restore is refused).
3. **Migrations** — `prisma migrate status` on the restored DB reports up-to-date.
4. **Security ACL replay** — the drill's own discovery: `pg_restore --no-acl` (correct for cross-environment restores) strips *all* Phase 2 GRANT/REVOKE statements, leaving `ticketty_app` with zero table access — a security-dead system after a real disaster recovery. The script re-applies every GRANT/REVOKE statement (multi-line list grants, `ALTER DEFAULT PRIVILEGES`, REVOKEs) extracted from the migration files — the single source of truth — with a real SQL statement splitter (dollar-quoted `DO` blocks are tracked so grants inside `EXECUTE format(...)` role-membership blocks are not misparsed).
5. **Phase 2 umbrella invariants** — RLS, triggers, grants floors, CHECKs all present *on the restored DB*, not just in the original.
6. **Per-contract SQL suites** — refund, settlement, accounting, tenant-consistency, trip-overlap.
7. **App bootstrap** — NestJS boots against the restored DB and readiness reports `{"status":"ready","database":"up"}`.
8. **Live RLS probe** — as `ticketty_app` with no org context, `organizations` reads 0 rows (isolation alive after restore).
9. **Row-count spot check** — organizations/users/trips/bookings/tickets/payments/accounting_events match between source and restored.
10. **RTO report + cleanup** — total elapsed time; scratch DB and temp backup are removed.

Latest drill result: **PASS — RTO 16s** (backup → restore → migrate → grants → invariants → contracts → bootstrap → RLS → counts).

## Manual scratch restore (fallback)

Create an empty, isolated database that is never the production database:

```bash
RESTORE_DATABASE_URL='postgresql://.../ticketty_restore' \
  ./ops/restore-postgres.sh backups/ticketty-YYYYMMDDTHHMMSSZ.dump
```

Then, from `backend/`, deliberately apply migrations if restoring into a newer application release:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm test:db:refund-integrity
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm test:db:tenant-consistency
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm test:db:settlement-integrity
```

Record start/end time, backup timestamp, achieved RPO/RTO, row-count sanity checks, migration result, and operator approval. Run this drill at least quarterly.

## Safety

- The restore script refuses the current `DATABASE_URL` unless `ALLOW_IN_PLACE_RESTORE=yes` is explicitly set.
- Never use `--clean` against a live database.
- Pause writes and follow an incident-specific plan for any in-place disaster restore.
- Custom dumps do not include cluster roles/globals; provision the application role separately.
- A valid checksum is not proof of restorability; only a completed scratch restore is.
