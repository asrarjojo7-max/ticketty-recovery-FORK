# Engineering Changelog

## 2026-09-01 — Runtime RLS activation

### Added

- Transaction-bound tenant database context routed through AsyncLocalStorage and Prisma interactive transactions.
- Non-owner `ticketty_app` runtime role with RLS policies for tenant-owned and inherited-scope tables.
- Narrow `ticketty_auth` security-definer functions for login, JWT revalidation, lockout counters, and successful-login updates.
- Global tenant RLS interceptor and fail-closed protection for tenant delegates outside explicit context.
- Runtime RLS integration coverage for role properties, tenant reads, child-table inheritance, cross-tenant writes, missing context, nested transactions, and interceptor propagation.
- Active double-entry accounting schema with accounts, fiscal periods, journals, journal entries/lines, reversal links, tenant RLS, and database posting guards.
- Accounting SQL contract covering balanced posting, unbalanced rejection, closed-period rejection, and posted-line immutability.
- Permissioned accounting module for accounts, fiscal periods, journals, balanced draft entries, posting, paginated listing, safe period closure, and idempotent reversal.
- Journal reversal database transition permits only a posted reversal pair and preserves all original financial fields.
- Added an accounting lifecycle E2E test under runtime RLS covering setup, balanced posting, reversal, and final state.
- Added an initial permission-aware accounting UI for accounts, journals, fiscal periods, entry listing, and posting.
- Added configurable accounting policies for payment, refund, expense, and agent-settlement sources with idempotent source-to-journal posting.
- Added E2E proof that an approved expense posts exactly once under runtime RLS.
- Added durable AccountingEvent enqueueing from payment creation, refund completion, expense approval, and agent settlement.
- Added event queue listing and guarded processing that links posted JournalEntry records back to their source event.
- Added leased event claiming with `FOR UPDATE SKIP LOCKED`, bounded retries, backoff, and stale-lock recovery.
- Added an optional scheduled accounting worker using a dedicated non-BYPASSRLS claim role and tenant-scoped processing.
- Added worker configuration to local/production environment examples and Compose.
- Added failed-event requeue and reconciliation APIs covering subledger counts, accounting-event states, and posted account balances.
- Added E2E assertions for posted-event linkage and reconciliation visibility.
- Added permission-filtered frontend navigation with exact, wildcard, global, and `.own` semantics.

### Fixed

- Authentication response mapping after replacing Prisma relation objects with typed authentication records.
- RLS-aware E2E fixtures use owner setup/cleanup and tenant-scoped service execution.
- Corrected tenant-context test regressions and verified accounting models are included in the RLS table set.

### Validation

- Backend: 23 suites / 88 unit tests and 5 suites / 18 E2E tests passed.
- Backend build, lint, Prisma validation, 23 migrations, all SQL integrity contracts, and production dependency audit passed.
- Web typecheck, lint, 3 suites / 10 tests, production dependency audit, localhost, and readiness passed.

## 2026-08-27 — Release-engineering baseline

### Added

- GitHub Actions quality gates for backend lint/typecheck/unit/build/audit, PostgreSQL migrations/E2E/SQL contracts, web lint/typecheck/build/audit, and container builds.
- Typed fail-fast backend environment validation with tests, minimum non-placeholder JWT secret strength, explicit HS256, issuer, and audience enforcement.
- Shared production-equivalent Nest application configuration used by runtime and E2E tests.
- Sanitized request-correlation IDs and structured HTTP completion logs without credentials or bodies.
- Multi-stage backend/web Dockerfiles, standalone Next.js output, and a Compose stack with PostgreSQL health, one-shot migrations, service health checks, and non-root application users.
- Web liveness and backend-dependent readiness routes.
- Centralized validated server-only web environment configuration and startup validation.
- Web unit-test baseline for environment, CSRF origin, request-ID, and JWT-expiry helpers.
- Strict BFF mutation-origin enforcement, upstream timeouts, path validation, content-type preservation, and sanitized unavailable responses.
- Request-ID propagation through login and authenticated proxy calls, with response correlation.
- Explicit bounded reverse-proxy trust configuration so forwarded client IPs are not trusted accidentally.
- Validated date-only report ranges with reversed-range rejection and a 366-day maximum to prevent unbounded report scans.
- Added backward-compatible `page`/`limit` bounds (50 default, 200 maximum) and stable ordering to high-volume operational lists.
- Replaced per-agent lifetime commission/settlement materialization with page-scoped database aggregation.
- Added permission-guard behavior tests and a metadata gate proving every business route declares explicit permissions.
- Extended bounded pagination to routes, drivers, buses, seat templates, branches, roles, and users so no top-level resource list remains unbounded.
- Added a restrictive baseline Content Security Policy, HSTS in production, and cross-domain policy headers to the web application.
- Added a global sanitized API error envelope with stable codes, request correlation, and safe Prisma conflict/reference/not-found mappings.
- Added a permission grant ceiling for custom role creation and role assignment, preventing delegated administrators from escalating beyond their own permissions.
- Added persistent failed-login counters, timed account lockout, automatic reset on successful authentication, and database constraints.
- Fixed backup/restore scripts to accept Prisma PostgreSQL URLs containing `schema` parameters.
- Completed an isolated PostgreSQL backup/restore drill with checksum verification, migration verification, and all SQL integrity contracts passing.
- Executable PostgreSQL backup/restore scripts and deployment/restore runbooks.

### Changed

- Standardized the local API port on `3001` across backend documentation, web environment examples, server authentication, and proxy defaults.
- Enabled graceful backend shutdown and explicit container network binding.
- Pinned vulnerable transitive `deepmerge-ts` to patched 8.x; backend production audit is now clean.
- E2E bootstrap now exercises the deployed `/api` prefix, Helmet header, and request-ID propagation.

### Validation

- Backend: 21 suites / 83 unit tests and 3 suites / 9 E2E tests passed.
- All refund, tenant-consistency, and settlement SQL contracts passed.
- Backend lint, typecheck, build, Prisma validation, and production dependency audit passed.
- Web lint, typecheck, 2 suites / 7 unit tests, production build (16 routes), standalone output check, and production dependency audit passed.
- Compose configuration rendered successfully.
- Container image execution remains unverified locally because no Docker daemon is available; CI now builds both images.

## 2026-08-26 — Autonomous engineering bootstrap

### Added

- Persistent engineering state, architecture, domain, database, API, security, testing, decisions, debt, progress, next-actions, and changelog documents.
- Tenant-isolation regression tests for organization-less login and ticket queries.
- Transactional tenant/branch reference validation and tests for buses, expenses, and agents.
- Server-side sellable-seat enforcement and guarded hold tests.
- Shared per-trip PostgreSQL transaction lock used by booking, cancellation, trip cancellation, and manifest lock.
- Transaction-lock regression test and hardened manifest terminal-state checks.
- Persisted idempotency-record schema, migration, reusable validation/hash primitives, and regression tests.
- Required Idempotency-Key on booking/trip cancellation, persisted completion/resource linkage, rejected payload-mismatched key reuse, and added safe replay behavior.
- Frontend cancellation clients now generate idempotency keys.
- Added and applied refund-integrity migration with payment/refund CHECK constraints and an atomic payment-row-locking trigger.
- Added rollback-safe PostgreSQL contract test `test:db:refund-integrity`.
- Added real two-client PostgreSQL refund contention and booking-cancel versus trip-cancel E2E tests.
- Fixed all advisory lock calls to use `$executeRaw`; the concurrency test exposed that `$queryRaw` cannot deserialize PostgreSQL's void lock result.
- Added advisory serialization and transactional replacement for expired idempotency records.
- Added composite tenant foreign keys for Bus→SeatTemplate, Agent→User, and Expense→Trip/Bus with SQL contract verification.
- Added external-agent ownership resolution and applied it to bookings, tickets, payments, agent/commission data, and settlement reads.
- Added a real PostgreSQL cross-agent isolation E2E test covering all those read projections and direct-ID denial.
- Migrated the AGENT role to explicit `.own` permissions and updated controllers to accept scoped permissions without weakening backend ownership checks.
- Expanded composite tenant foreign keys across trips, bookings, payments, refunds, tickets, manifests, commissions, adjustments, and settlements.
- Added settlement period/arithmetic/immutability database constraints and SQL contract tests.
- Corrected the settlement DELETE trigger after E2E cleanup exposed an incorrect `RETURN NEW` behavior.
- Added branch/organization consistency preflight and triggers across all branch-owned tables, plus a cross-tenant branch SQL assertion.
- Added SettlementLine with unique commission allocation, composite tenant constraints, finalized-line immutability, and transactional generation.
- Added public liveness and database-backed readiness endpoints with safe failure handling and automated tests.
- Settlement generation now excludes reversed commissions, rejects inverted/overlapping periods, serializes per agent, and prevents changes after finalization.

### Security

- Rejected organization-less tenant users during login and JWT request revalidation.
- Changed ticket list, ID, and QR lookups to fail closed while preserving branch scoping.
- Prevented cross-tenant Bus→SeatTemplate, Expense→Trip/Bus, and Agent→User writes.
- Prevented holding or booking DRIVER, DISABLED, and BLOCKED seat types.
- Closed branch-scoped booking idempotency replay disclosure.
- Serialized known refund/departure race paths per trip and rejected repeat/terminal manifest locking.

### Validation

- Backend tests: 10 suites / 24 tests passed.
- Backend E2E baseline: 1 suite / 1 test passed.
- Backend build, lint, Prisma validation, and migration status passed; 8 migrations are applied locally.
- Frontend lint and TypeScript checks passed.
- Frontend production dependency audit found no known vulnerability.
- Backend production dependency audit found one High advisory through Prisma tooling (`deepmerge-ts`); unresolved and registered as debt.

### Known limitations

This milestone establishes an honest baseline and closes one tenant escape. It does not make Ticketty production-ready; critical transaction, tenant-reference, accounting, and operational gaps remain.
