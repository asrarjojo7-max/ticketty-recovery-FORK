# Ticketty Project State

_Last verified: 2026-09-01T11:41:21+02:00_

## Executive status

- Overall weighted completion: **83% (production-candidate foundation, not production-ready)**.
- Production readiness: **89% — still NO-GO for real passenger or financial data until reconciliation, browser tests, and production-like operational release gates close**.
- Strategy: preserve the working vertical slice and harden it incrementally; do not rewrite from scratch.
- Repository branch: `master`; repository currently has no commits and all project files are untracked.

## Current architecture

- `backend/`: NestJS 11 modular monolith, Prisma 6, PostgreSQL.
- `web/`: Next.js 16 App Router, React 19, TypeScript, Tailwind, TanStack Query, Arabic RTL.
- Authentication: JWT at backend; Web BFF keeps the credential in an HttpOnly cookie.
- Domain code is module-oriented but mostly controller/service/Prisma rather than the target application/domain/infrastructure layering.

## Implemented domains

Organizations/branches, users/roles, customers, routes, buses/seat templates, drivers, trips/trip seats, bookings, payments/refunds, tickets/boarding, manifests, agents/commissions, expenses/adjustments, settlements, reports, and audit logging have partial implementations.

The active database contains Chart of Accounts, Fiscal Periods, Journals, Journal Entries/Lines, balanced posting guards, closed-period rejection, immutability, reversals, and RLS. Permissioned application APIs now support account, journal, period, draft-entry, posting, listing, and period-close workflows; business-event policies and reconciliation remain to be implemented. Outbox/workers, robust offline sync, provider payment integration, and server-side documents remain absent.

## Current critical risks

1. Runtime RLS is transaction-bound and verified with a non-owner, non-BYPASSRLS role; deployment must preserve the tested `ticketty_app`/`ticketty_auth` separation and must not connect HTTP workloads as table owner.
2. Core booking/cancellation/manifest races are serialized and covered by real two-client tests; broader hot-trip load and failure-recovery evidence remains missing.
3. Refunds use persisted command idempotency, payment-row locking, cumulative database ceilings, and contention tests; provider-level refund integration/reconciliation remains missing.
4. External-agent ownership is enforced and the AGENT role now uses explicit `.own` permissions across booking, ticket, payment, agent, and settlement operations; broader endpoint authorization matrices remain.
5. Settlement service excludes reversals, rejects overlap, serializes generation, allocates each commission once, and freezes finalized records/lines; journal posting and reconciliation remain missing.
6. Double-entry foundations, APIs, reversal, policies, durable enqueueing, leased worker, requeue operations, reconciliation summary, and initial UI are active; detailed discrepancy workflows and policy-management UI remain missing.
7. Backend security/concurrency coverage is materially improved, but frontend browser, authorization-matrix, load, and failure-recovery coverage remain incomplete.
8. CI, container definitions, health probes, request-correlation logs, and backup/restore tooling exist; a local scratch restore drill passed, while hosted metrics/alerts and a production-like restore drill remain missing.

## Changes in this cycle

- Closed the organization-less tenant fail-open path at login, JWT request revalidation, and ticket queries.
- Added unit regression coverage for organization-less login and ticket list, ID, and QR tenant/branch scoping.
- Created the persistent engineering memory under `docs/engineering/`.
- Added transactional tenant/branch validation for Bus→SeatTemplate, Expense→Trip/Bus, and Agent→User writes.
- Enforced server-side seat eligibility: only REGULAR/VIP seats can be held or booked; newly materialized non-sellable trip seats start BLOCKED.
- Added regression tests for the protected relation and seat paths.
- Added one shared PostgreSQL transaction lock across booking creation, booking cancellation, trip cancellation, and manifest locking; branch-scoped idempotency replay was also closed.
- Hardened manifest locking against repeat and terminal-trip transitions.
- Hardened settlements against reversed commissions, invalid/overlapping periods, concurrent generation, regeneration after settlement, and repeated finalization.
- Added and locally applied a persisted idempotency-record schema with endpoint/key uniqueness, request hashes, status, response metadata, resource linkage, and expiry.
- Added reusable validated idempotency primitives and wired them into booking/trip cancellation endpoints.
- Cancellation retries now validate endpoint/key/request hash, return the persisted resource safely, and avoid duplicate refund/audit execution.
- Added PostgreSQL refund-integrity checks and a trigger that locks the payment, validates tenant/booking ownership, rejects cumulative over-refunds, and atomically maintains payment refund totals/status.
- Added a rollback-safe SQL contract test proving valid updates and rejection of excessive/cross-tenant refunds.
- Added a real two-Prisma-client PostgreSQL contention test proving one of two cumulative over-refunds is rejected.
- Expired idempotency keys are transactionally replaced under an operation-scoped advisory lock.
- Added a real service-level race test between booking and trip cancellation; it exposed that Prisma cannot deserialize PostgreSQL advisory-lock `void` results, so all lock calls were corrected from `$queryRaw` to `$executeRaw` and the race now passes.
- Added composite tenant-consistency foreign keys and a rollback-safe database contract test.
- Added fail-closed external-agent ownership scoping across bookings, tickets, payments, agent data, commissions, and settlements.
- Added a real PostgreSQL cross-agent integration test proving one external agent cannot list or directly retrieve another agent's operational/financial records.
- Replaced implicit role-name ownership detection with explicit `.own` permission semantics and migrated existing AGENT role permissions.
- Expanded tenant-consistent composite foreign keys across the core transactional graph and extended the SQL tenant contract.
- Added database settlement invariants for unique periods, date ordering, nonnegative/balanced totals, and immutable finalized records.
- Fixed a trigger bug discovered by E2E cleanup: BEFORE DELETE must return OLD rather than NEW.
- Added migration preflight validation and runtime triggers enforcing branch-to-organization consistency for users, customers, routes, buses, drivers, trips, bookings, payments, agents, expenses, and audit logs.
- Added immutable SettlementLine allocation: each commission can belong to only one settlement, tenant consistency is enforced, and lines cannot change after finalization.
- Added transaction-bound PostgreSQL RLS using a non-owner runtime role, AsyncLocalStorage transaction routing, authentication-only security-definer functions, and fail-closed tests for absent/cross-tenant context.
- Activated and verified RLS in the local runtime, including accounting tables; tenant operations outside explicit context now fail closed.
- Verified all RLS-enabled tables, child-table policies, role ownership/BYPASSRLS properties, cross-tenant write rejection, nested service transactions, and interceptor context propagation.
- Fixed the authentication response regression and adapted integration fixtures to use owner setup plus tenant-scoped service execution.
- Added active double-entry database foundations: accounts, fiscal periods, journals, entries/lines, posting balance enforcement, closed-period checks, posted immutability, reversal linkage, tenant constraints, and RLS.
- Added a rollback-safe accounting SQL contract covering balanced posting, unbalanced rejection, closed-period rejection, and posted-line immutability.
- Added permissioned accounting APIs/services for accounts, journals, fiscal periods, balanced draft entries, posting, paginated listing, and safe period closure.
- Added idempotent journal reversal with automatically swapped lines, open-period enforcement, posted reversal validation, original-entry state transition, and database contract coverage.
- Added a full accounting lifecycle E2E test under runtime RLS covering account/period/journal setup, balanced entry creation, posting, reversal, and reversed-state verification.
- Added permission-aware frontend navigation with exact, domain-wildcard, global, and `.own` permission coverage.
- Added an initial permission-aware accounting UI for accounts, journals, fiscal periods, entry visibility, and posting.
- Added configurable tenant accounting policies for payments, refunds, approved expenses, and agent settlements, plus idempotent source-to-journal posting.
- Added E2E proof that an approved expense posts exactly once through its configured policy under runtime RLS.
- Added durable AccountingEvent records and atomic enqueueing from payment creation, refund completion, expense approval, and agent settlement; processing updates each event with its posted journal entry.
- Added leased `FOR UPDATE SKIP LOCKED` event claiming, bounded retries/backoff, stale-lock recovery, failed-event visibility, and a guarded process-next endpoint.
- Added an optional scheduled accounting worker using a dedicated non-BYPASSRLS claim role; each claimed event is processed inside its tenant RLS context and failures are released with backoff.
- Added failed-event requeue and reconciliation APIs reporting operational subledgers, event states, and posted account debit/credit balances.
- Added frontend permission-filtered navigation so users no longer see modules they cannot access.
- Added public liveness and database-backed readiness endpoints with safe failure responses and unit/E2E coverage.
- Added CI gates for backend/web quality, PostgreSQL E2E and SQL contracts, dependency audits, and image builds.
- Added fail-fast environment validation and explicit JWT algorithm, issuer, and audience enforcement.
- Added request correlation and structured HTTP completion logging.
- Added reproducible backend/web container definitions, a one-shot migration Compose stack, web health routes, and graceful shutdown.
- Added executable PostgreSQL backup/restore tooling and operator runbooks.
- Resolved the known High `deepmerge-ts` advisory with a tested pnpm override.
- Centralized validated web server configuration and removed inconsistent API defaults.
- Hardened BFF mutation origin checks, upstream timeouts, proxy response handling, JWT-aligned cookie expiry, and request-ID propagation.
- Established the first Web test baseline with 2 suites / 7 security and configuration helper tests.
- Added bounded trusted-proxy configuration and restricted report queries to validated date-only ranges of at most 366 days.
- Added validated bounded pagination to all top-level operational and reference lists and replaced agent lifetime relation loading with page-scoped database aggregates.
- Added CSP, HSTS in production, and cross-domain policy response headers to the Web application.
- Added automated permission metadata coverage for every business endpoint and enforced role-assignment grant ceilings.
- Added a stable sanitized API error envelope with request IDs and safe Prisma mappings.
- Added persistent failed-login counting and a 15-minute database-backed account lockout after five failures.
- Fixed backup/restore handling for Prisma-style `?schema=` URLs and completed an isolated PostgreSQL restore drill with all database integrity contracts passing.

## Last validated commands

- `backend: pnpm test --runInBand` — passed: 24 suites, 91 tests.
- `backend: pnpm test:e2e --runInBand` — passed: 5 suites, 19 tests, including runtime RLS, accounting lifecycle/reversal/event posting, health/bootstrap, refund contention, booking-cancel versus trip-cancel, and cross-agent isolation.
- Backend refund, tenant-consistency, and settlement SQL contract scripts — passed.
- `backend: pnpm lint:check`, `pnpm typecheck`, `pnpm build`, and `pnpm exec prisma validate` — passed.
- `backend: pnpm exec prisma migrate status` — 27 migrations; local database is up to date.
- Accounting SQL contract — passed.
- Local runtime: backend readiness returned HTTP 200 on port 4000; frontend and web readiness returned HTTP 200 on port 3000.
- `backend: pnpm audit --prod` — no known vulnerabilities after the patched transitive override.
- `web: pnpm lint:check`, `pnpm typecheck`, `pnpm test`, and prior production build — passed; current unit baseline is 3 suites / 10 tests and permission-aware accounting/navigation integration compiles.
- `web: pnpm audit --prod` — no known vulnerabilities.
- Standalone Web production server was started on port 3100 and its liveness endpoint, CSP, HSTS, frame, and content-type headers were verified.
- `docker compose config` — passed. Image builds were not executable locally because the Docker daemon is unavailable; CI includes both image builds.

## Blockers

No environment blocker for continued development. Production release remains blocked by the critical risks above and by unresolved finance/business policies recorded in `docs/database-domain-v1/open-decisions.md`.

## Next actions

See `NEXT_ACTIONS.md`. Immediate focus is background accounting-event processing, subledger reconciliation, browser E2E, and production-like operational verification.
