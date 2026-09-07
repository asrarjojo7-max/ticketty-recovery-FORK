# Next Automatic Actions

Prioritized by security risk, data integrity, dependency order, business criticality, and production readiness.

## Current task

1. **Accounting discrepancy workflows and policy UI**
   - Scheduled leased processing, failed-event visibility/requeue, and reconciliation summaries are active.
   - Add detailed source-vs-event-vs-journal discrepancy records, operator resolution actions, and worker metrics.
   - Add policy-management UI and accounting audit events.

## Next tasks

2. **Accounting reconciliation and reporting consistency**
   - Post settlement, sale, refund, and expense business events through explicit accounting policies.
   - Reconcile subledgers to journal balances and unify gross/net/refund reporting definitions.
3. **Financial reporting consistency**
   - Define gross/net/refund metrics and remove refunded revenue from operational KPIs.
4. **Operational proof and observability**
   - Run the new container stack in a Docker-enabled staging environment.
   - Complete and record a scratch backup/restore drill.
   - Add hosted metrics, tracing/error tracking, alert ownership, and SLOs.

## Completed in current milestone

- **UI/UX migration (MASTER_PLAN.md phases 0–9) complete and Definition of Done verified with evidence (2026-09-07)**: oklch token DNA on every screen (including the login page), Cairo/Mada typography, component library (PageHeader/StatusBadge/KpiCard/charts/skeletons/EmptyState), dashboard with server-side aggregation, single-screen POS with Idempotency-Key checkout, server-paginated tables with toasts, PageHeader contract on all screens, bus/driver overlap guard (DB+app), Playwright golden paths (8/8 local + CI `web-e2e`), tenant-FK drift discovered by the SQL contract and repaired (`prisma/repair/20260907_reapply_tenant_consistency.sql`).
- Fixed latent login bug: `recordSuccessfulLogin` called a void SQL function via `$queryRaw` (P2010 on every login) — now `$executeRaw`.
- Fail-closed organization scoping at login/JWT/tickets.
- Transactional application validation for known cross-tenant writable foreign IDs.
- Server-side rejection of DRIVER/DISABLED/BLOCKED seat sales and blocked initialization for non-sellable trip seats.
- Shared per-trip transaction locking and terminal manifest-lock validation.
- Settlement service reversal filtering, overlap protection, serialization, and settled-state immutability.
- Branch-safe booking idempotency replay.
- Persisted cancellation idempotency, atomic refund DB enforcement, SQL contract coverage, and real two-client refund/booking-vs-trip cancellation tests.
- Composite tenant foreign keys plus SQL tenant-consistency contract tests.
- External-agent ownership scoping, explicit `.own` permissions, role migration, and cross-agent integration coverage.
- SettlementLine allocation and finalized-line database protection.
- Transaction-bound runtime RLS, non-owner runtime/auth roles, fail-closed context enforcement, and RLS integration tests.
- Public liveness and database-backed readiness endpoints, plus web liveness/readiness routes.
- Backend regression baseline: 22 suites / 85 unit tests and 4 suites / 17 E2E tests passing.
- CI quality gates, production container definitions, one-shot migrations, and Compose health orchestration.
- Fail-fast runtime configuration, explicit JWT verification policy, request correlation, and structured HTTP completion logs.
- Patched dependency audit, executable database backup/restore scripts, and operator runbooks.

## Blocked / deferred

- **Payment provider (MASTER_PLAN.md Phase 10): postponed by owner decision on 2026-09-07** ("سأنفذها في المستقبل وليس الآن"). Requires design-first in `docs/engineering/` (Provider interface, signed webhook, idempotent provider events, PENDING→COMPLETED lifecycle) and the License Perimeter decision (REG-005 in `docs/compliance/regulatory-register.md`).
- POS discount UI: gated on a server-side discount policy that does not exist yet (client money math is forbidden by the golden rules).
- Revenue recognition, taxes, cancellation policy versioning, agent collection model, fiscal calendar, and legal document numbering require business/finance sign-off recorded in `docs/database-domain-v1/open-decisions.md`. Engineering continues on non-dependent safety work.
