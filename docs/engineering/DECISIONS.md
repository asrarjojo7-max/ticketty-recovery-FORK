# Engineering Decisions

## ADR-001 — Preserve and harden the modular monolith

**Context:** A functional NestJS/Next.js vertical slice exists, but production controls are incomplete.
**Options:** rewrite; split microservices; incremental hardening.
**Decision:** Incrementally harden the current modular monolith.
**Reason:** Lowest migration risk and fastest path to verified correctness.
**Consequences:** Domain boundaries are extracted only where critical invariants or testability justify them.

## ADR-002 — Fail-closed tenant scope

**Context:** Nullable organization IDs can remove Prisma filters when converted to `undefined`.
**Decision:** Tenant runtime services call `requireOrgId`/`tenantScope`; platform administration, if introduced, uses a separate explicit path and policy.
**Consequences:** Misconfigured tenant users receive Forbidden rather than cross-tenant data. Ticket queries were migrated in this cycle.

## ADR-003 — Database-assisted integrity

**Context:** Application-only validation cannot protect concurrent writers or alternate code paths.
**Decision:** Enforce critical invariants in both application transactions and PostgreSQL constraints/locks; evaluate controlled adoption of the validated `prisma/v1` candidate through additive migrations.
**Consequences:** Schema work requires real PostgreSQL integration tests and rollout planning.

## ADR-004 — No production accounting claim without double entry

**Context:** The active runtime has payments/refunds/expenses but no journal/ledger/fiscal periods.
**Decision:** Treat current finance views as operational reporting, not an authoritative accounting ledger.
**Consequences:** Production financial readiness remains blocked until accounting policy decisions and balanced posting/reversal workflows are implemented.

## ADR-005 — Shared per-trip transaction serialization

**Context:** Booking, cancellation, trip cancellation, and manifest departure previously read mutable trip state independently and could interleave.
**Decision:** Every critical write for a trip acquires the same PostgreSQL transaction-scoped advisory lock before reading mutable state.
**Reason:** Provides an immediately deployable correctness boundary across existing services while a deeper state-machine and database contract are developed.
**Consequences:** Writes for one trip serialize and may reduce hot-trip throughput; lock wait latency must be measured. Persisted idempotency, database refund ceilings, and real concurrency tests are still required.

## ADR-006 — Organization/year ticket-number serialization

**Context:** Ticket numbers are sequential per organization and year. A per-trip lock cannot protect two simultaneous sales on different trips.
**Decision:** Acquire a PostgreSQL transaction advisory lock keyed by the ticket-number namespace plus organization/year before reading the current maximum. Keep the database unique index on `(organizationId, number)` as the final invariant.
**Reason:** This is multi-instance safe, rollback-safe, and avoids a new counter table while preserving the established human-readable numbering contract.
**Consequences:** Ticket allocation serializes briefly per organization, not globally. Monitor lock wait under high-volume sales; replace with an atomic counter table only if measured contention warrants it.

## ADR-007 — Separate migration and runtime database identities

**Context:** `SET LOCAL ROLE` protected normal paths, but the API process held the schema-owner/superuser credential and could reset or bypass RLS.
**Decision:** The migration job alone receives `MIGRATION_DATABASE_URL`. It provisions/rotates a fixed `ticketty_runtime` LOGIN role with `NOINHERIT`, no direct object grants, and membership only in audited NOLOGIN roles. The backend receives only `RUNTIME_DATABASE_URL` and refuses production startup under any other identity.
**Consequences:** Deployments require two independently managed secrets. Restore and migration runbooks must provision the runtime login before starting the API.

## ADR-008 — Persist logical POS retries until definitive success

**Context:** Generating an idempotency key inside the mutation function creates a new key after response loss.
**Decision:** The browser stores a random key by canonical payload fingerprint in session storage for 24 hours and removes it only after a successful response. The backend binds the key to a canonical request hash and durable booking resource in the existing idempotency table. Completed operations remain replayable after the processing lease expires.
**Consequences:** Timeouts and page reloads replay the same sale. A key reused with different content is rejected with 409. No passenger payload is stored in browser storage.
