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
