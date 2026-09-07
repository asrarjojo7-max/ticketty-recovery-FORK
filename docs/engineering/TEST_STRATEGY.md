# Test Strategy

## Current evidence

- Backend: 25 Jest suites / 96 tests after the current hardening cycle, including login lockout, pagination, grant ceilings, error mapping, guard behavior, trip overlap rejection, and a metadata gate requiring explicit permissions on every business route.
- Backend E2E: 5 suites / 19 tests covering production-equivalent app bootstrap, stable error envelopes, health, refund contention, booking-vs-trip cancellation, cross-agent isolation, runtime RLS, and the accounting lifecycle/reversal/event posting.
- PostgreSQL contract scripts cover refund, tenant, settlement, accounting, and bus/driver trip-overlap integrity (5 scripts, 20+ contract cases) and pass against the migrated local database. The tenant contract caught real drift on 2026-09-07 (composite tenant FKs missing while migration records said applied) — repaired via `backend/prisma/repair/20260907_reapply_tenant_consistency.sql` (idempotent; verified by the same contract).
- Frontend: 3 Vitest suites / 10 tests cover server environment, origin, request-ID, JWT-expiry helpers, and permission-aware navigation; lint, strict TypeScript, and production build pass.
- Browser E2E (Playwright, `MASTER_PLAN.md` Phase 9): 6 golden-path tests across 5 specs — login→dashboard for OWNER, dashboard denial + hidden admin navigation for AGENT, POS full sale through the ticket dialog (Idempotency-Key checkout), bookings server-side search, trips tabs, and direct-URL fleet denial for AGENT. Sessions are provisioned once per role via `auth.setup.ts` storageState (respects the 5/min login throttle); fixtures are provisioned by `web/scripts/e2e-setup.mjs` (dedicated e2e users + a guaranteed future OPEN trip). CI runs them in the `web-e2e` job with a Postgres service, migrated schema, seeded demo data, and both servers.
- All 28 runtime migrations pass; candidate database v1 remains a separate, inactive contract. Note: composite tenant-consistency FKs live outside `schema.prisma` (Prisma cannot model composite FKs on these relations) — `prisma migrate status` does not verify their presence; the SQL contract is the authoritative check.
- GitHub CI now enforces backend/web quality, database integration contracts (including trip-overlap), browser golden paths (`web-e2e`), dependency audits, and container builds.

## Test pyramid

1. Unit tests for domain transition policies, calculations, authorization scopes, and error mapping.
2. PostgreSQL integration tests for constraints, transaction boundaries, idempotency, RLS/tenant isolation, and concurrency.
3. API E2E tests using production-equivalent guards, pipes, prefix, and database.
4. Web component/integration tests for forms and failure states.
5. Playwright golden-path E2E for each principal role.
6. Load/soak tests for seat contention, reporting, and operational traffic.

## Mandatory critical scenarios

- Tenant A cannot read/write Tenant B; branch A cannot mutate branch B; agents see only own resources unless explicitly granted all scope.
- Concurrent booking cannot sell one seat twice.
- Expired holds are atomically reclaimable.
- Repeated payment/refund/settlement commands do not duplicate money.
- Booking cannot commit against cancelled/departed/manifest-locked trips.
- Cancelled/refunded tickets cannot board; duplicate scans follow policy.
- Locked manifests cannot mutate.
- Posted entries are balanced and immutable; closed periods reject posting.
- Bus/driver schedule overlap is rejected.

## Quality gates

Required per change: format/lint, strict typecheck, unit tests, relevant integration/E2E, build, Prisma validate/migration validation, and production dependency audit. Coverage is evidence, not a substitute for invariant scenarios.
