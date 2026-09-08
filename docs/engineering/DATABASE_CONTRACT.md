# Database Contract

## Active schema

Source of truth: `backend/prisma/schema.prisma` plus 20 applied migrations under `backend/prisma/migrations/`.

The active schema provides PostgreSQL foreign keys, tenant columns on most business entities, useful indexes, decimal money columns, booking/payment idempotency keys, and unique trip seat labels.

## Known active-schema gaps

- Composite foreign keys enforce matching `organizationId` across the core transaction graph, while triggers enforce branch/organization consistency.
- Active migrations enable RLS on tenant-owned and inherited-scope tables. Tenant operations run with transaction-local `app.organization_id` under `ticketty_app`; authentication uses narrowly granted security-definer functions under `ticketty_auth`.
- Missing CHECK constraints for positive amounts, cancellation percentage bounds, refund bounds, commission percentage bounds, and valid periods.
- A generic persisted idempotency record enforces tenant+endpoint+key uniqueness and request hashing for booking/trip cancellation.
- PostgreSQL enforces positive payment/refund amounts, refunded-amount bounds, refund tenant/booking consistency, and atomic cumulative refund updates through a payment-row-locking trigger.
- Settlement lines uniquely allocate commissions and are immutable after finalization; settlement-to-journal posting and reconciliation remain missing.
- Active accounting tables now cover accounts, fiscal periods, journals, entries, and lines with balance, period, immutability, reversal, tenant, and RLS constraints. Application posting policies and reconciliation remain pending.
- Trip bus/driver overlap is not database-assisted.

## Candidate v1

`backend/prisma/v1/` contains a separately validated candidate contract with stronger constraints, RLS, accounting, and invariant smoke tests. It is **not active** and must not be described as runtime behavior. Adoption requires an additive migration/backfill/switch plan and decisions in `docs/database-domain-v1/open-decisions.md`.

## Migration policy

Use `add → backfill → dual-read/write where needed → validate → switch → remove`. Every change requires migration SQL review, data compatibility analysis, rollback/roll-forward notes, and validation against a disposable PostgreSQL instance before deployment.

## Machine-enforced invariants (TD-016 — Phase 2)

`backend/test/sql/database-invariants.sql` converts every invariant below from
"developer remembers" into "build/deploy fails". It runs in CI (before the
individual integrity suites), in deploy (the compose `migrate` service runs
`migrate deploy && test:db:invariants` — the deployment itself fails), in dev
(`prestart:dev` hook), and in the Phase 7 restore drill (the same checks run
against the restored backup).

| # | Invariant | Why it matters | Check |
|---|---|---|---|
| 1 | ≥ 25 composite org-scoped FKs (current: 30) | A `migrate dev`/`db push` silently drops tenant-composite FKs outside schema.prisma (the original TD-016 incident) — cross-tenant rows become insertable | catalog count via `pg_get_constraintdef ~ 'organizationId.*,'` |
| 2 | Every owner table keeps ≥ 1 composite org FK | per-table regression floor (trips, bookings, tickets, payments, refunds, commissions, expenses, expense_adjustments, journal_entries, journal_entry_lines, accounting_policies, manifests, settlements, agents) | catalog per-table count |
| 3 | ≥ 15 org-scoped unique composite indexes (current: 19) | org-local codes, license numbers, fiscal period numbering | `pg_indexes` |
| 4 | Idempotency uniques by name: bookings/payments idempotencyKey, idempotency_records, journal entryNumber + sourceType/sourceId, accounting_events eventType/sourceId | Double-booking and double-posting are only prevented by these — nothing else catches them | named-index existence |
| 5 | RLS enabled + ≥ 1 policy on all 33 tenant tables | a dropped policy = table readable cross-tenant | `pg_class.relrowsecurity` + `pg_policy` count |
| 6 | **Behavioral RLS probe**: `ticketty_app` with no org context reads **zero** rows from `organizations` | proves RLS actually enforces (enablement + policy + context function together), not just catalog flags | live query under `SET LOCAL ROLE` |
| 7 | Critical triggers exist by name: `journal_entries_posting_guard`, `journal_entry_lines_immutability_guard`, `refund_integrity_before_insert`, `audit_logs_immutable_guard`, `settlements_prevent_final_mutation`, `settlement_lines_prevent_final_mutation` | balanced-entry, POSTED immutability, cumulative refund bounds, audit immutability, settlement finality are trigger-enforced; dropping one removes the last line of defense | `pg_trigger` |
| 8 | No app role holds DELETE/UPDATE/TRUNCATE on `audit_logs` | audit immutability at the privilege level, not only by trigger | `information_schema.table_privileges` |
| 9 | No role other than the DB owner holds any table privilege on `subscriptions` | subscription access is exclusively through narrowly granted SECURITY DEFINER functions | `information_schema.table_privileges` |
| 10 | No SECURITY DEFINER function in `ticketty_security` executable by PUBLIC | found live during Phase 2: `platform_renew_subscription` was PUBLIC-executable and an accounting-worker role reached business logic (renew-without-payment); fixed in migration `20260910000000_revoke_public_platform_fns`, this check prevents recurrence | `aclexplode` over `proacl` |
| 11 | App roles are not superuser/createdb/createrole | privilege-escalation floor | `pg_roles` |
| 12 | CHECKs: payments `amount > 0`, `refundedAmount ∈ [0, amount]`, journal lines debit-XOR-credit, trips scheduling exclusion | money sanity at the storage layer | `pg_constraint` defs |

Any failure raises `INVARIANT FAIL [...]` and exits non-zero. The check is
self-rollback (read-only + `SET LOCAL ROLE` probes inside `DO` blocks).

### Post-merge hardening (verification round 1)

Two defects were found while **proving** the umbrella suite actually bites,
and fixed in this session (they would have made several checks no-ops):

1. **Catalog blindness after the behavioral probe (invariant 6)** — the
   `SET LOCAL ROLE ticketty_app` inside the `DO` block was never followed by
   `RESET ROLE`, so every later section (including the grants invariants
   8–10) ran as `ticketty_app`. `information_schema` hides rows a role
   cannot see, so the grant checks observed **zero** rows and passed
   vacuously. Reproduced: isolated 4.2 fired (`ticketty_platform` held
   SELECT/INSERT/UPDATE on `subscriptions`) while the full file passed.
   Fix: `RESET ROLE` at the end of section 2.2 — checks 8–10 now see the
   real catalog.
2. **Legacy unused table grants (invariant 9)** — once check 9 became live
   it failed against the live database. Investigation proved the grants were
   dead weight: every platform read/write goes through SECURITY DEFINER
   functions running with **owner** privileges (demonstrated on a scratch
   database with the grants revoked: provisioning, set/renew subscription,
   list tenants, health, tenant report — all reached their business logic;
   no access denials). Migration
   `20260910010000_revoke_unused_subscriptions_table_grants` removes them.
   `subscriptions` now has zero application-role table grants, matching the
   documented contract. The full e2e suite (54 tests, including the
   platform provisioning/subscription lifecycle) passes after the revoke.
