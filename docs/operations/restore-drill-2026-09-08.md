# Restore Drill — 2026-09-08 (Phase 7 exec evidence)

**Drill:** `ops/verify-restore.sh` (automated, repeatable, FAIL-fast)
**Result:** ✅ **PASS**
**RTO (measured, end-to-end): 16 seconds** — backup → restore → migrate status → security-ACL replay → Phase 2 umbrella invariants → 5 per-contract SQL suites → app bootstrap/readiness → live RLS probe → row-count spot-check → cleanup.

## Environment

| Item | Value |
|---|---|
| Source DB | `postgresql://…@localhost:5433/ticketty` (live dev database with real e2e data: 20 orgs, 24 users, 32 trips, 61 bookings, 61 payments, 50 accounting events) |
| Scratch DB | `ticketty_restore_drill` (created fresh, dropped after) |
| Backup | `pg_dump --format=custom --no-owner --no-acl` + SHA-256 (336 KB) |
| Restore | `pg_restore --single-transaction --exit-on-error --no-owner --no-acl` |

## Gates passed (all hard-gated — first failure aborts)

1. **Backup** produced a real dump + checksum from the live DB.
2. **Restore** into a fresh scratch DB (in-place restore refused by design).
3. **`prisma migrate status`** on the restored DB: *up to date*.
4. **Security ACL replay (66 statements)** — see discovery below.
5. **Phase 2 umbrella invariants** (`test/sql/database-invariants.sql`) green **on the restored DB**: RLS on tenant tables, 17 triggers, grant floors, CHECKs, composite FKs, behavioral probe (`ticketty_app` reads zero rows without org context).
6. **Per-contract SQL suites** green on the restored DB: refund-integrity, settlement-integrity, accounting-integrity, tenant-consistency, trip-overlap.
7. **Application bootstrap**: NestJS app boots against the restored DB; readiness = `{"status":"ready","database":"up","accountingWorker":{"secondsSinceLastSuccess":-1,"consecutiveFailures":0}}`.
8. **Live RLS probe**: as `ticketty_app` with no org context → **0 rows** from `organizations` (tenant isolation alive after restore).
9. **Row-count spot-check** — source vs restored, all ✓: organizations 20, users 24, trips 32, bookings 61, tickets 62, payments 61, accounting_events 50.
10. **Cleanup**: scratch DB dropped, temp backup file removed.

## Critical discovery (why this drill exists)

`pg_restore --no-acl` — the correct flag for cross-environment restores — strips **every** GRANT/REVOKE statement. After a bare restore, `ticketty_app` had **zero table privileges**: the system would boot into a security-dead state (every business query → `permission denied`) after a real disaster recovery.

Additional finding while fixing it: the initial replay extractor only caught 38 of 71 statements — it missed multi-line list grants (`GRANT … ON "organizations", "branches", … TO ticketty_app`) and every REVOKE, and misparsed grants embedded in `EXECUTE format(…)` inside dollar-quoted `DO` blocks. The final extractor is a real SQL statement splitter (tracks `$$` dollar-quoting and single-quote escapes) that pulls the full GRANT/REVOKE surface from the migration files — the single source of truth, identical to what `prisma migrate deploy` grants a fresh environment.

**Operational rule (now encoded in the script):** any `--no-acl` restore must be followed by explicit security-ACL replay from the migrations *before* the restored database is trusted. The drill proves the replay by running the Phase 2 invariants against the restored DB afterward.

## RPO note

RPO is determined by the backup schedule (see `docs/operations/backup-restore.md`: daily recommended, encrypted off-site upload); this drill proves **restorability**, which is the part that was previously asserted but never demonstrated end-to-end.

## Reproduce

```bash
DATABASE_URL='postgresql://…/ticketty?schema=public' \
BACKUP_DIR=/tmp/drill \
./ops/verify-restore.sh
```

Expected tail: `VERIFY-RESTORE PASS — RTO: …s (backup→restore→migrate→invariants→bootstrap→RLS→counts)`

Quarterly re-run cadence per `docs/operations/backup-restore.md`.
