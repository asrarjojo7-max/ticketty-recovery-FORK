# Technical Debt Register

| ID | Severity | Area | Impact | Recommendation / current workaround |
|---|---|---|---|---|
| TD-001 | Medium | Tenant references | Composite tenant FKs now cover the core transactional graph with SQL tests; branch consistency and runtime RLS remain | Add branch-safe constraints and introduce verified transaction-bound RLS. |
| TD-002 | Medium | Refund concurrency | Shared trip locks, persisted cancellation idempotency, atomic DB ceilings, SQL contract tests, and a two-client refund contention test exist; full endpoint booking-vs-cancel contention remains | Add full HTTP/service cancellation contention and failure-recovery tests. |
| TD-003 | High | Trip lifecycle concurrency | Shared trip lock now serializes key paths, but state rules are not centralized and external writers are not covered | Centralize transition policy, add DB-assisted guards and concurrency tests. |
| TD-004 | Low | Agent authorization | Explicit `.own` permissions, fail-closed ownership scoping, and cross-agent PostgreSQL tests protect core resources | Complete the endpoint-by-permission matrix and add controller-level 403 tests. |
| TD-005 | Medium | Settlements | Immutable unique commission allocation and finalized-line protection now exist; broader reconciliation and accounting posting remain | Add settlement-to-ledger posting and reconciliation integration tests. |
| TD-006 | Medium | Accounting | Double-entry, policies, durable scheduled processing, requeue, reconciliation summary, and initial UI are active; detailed discrepancy resolution remains | Add source/event/journal discrepancy workflows, worker metrics, and policy operator UI. |
| TD-007 | High | Tests | Core PostgreSQL suites and a Web security-helper baseline exist, but backend coverage remains low and component/browser tests are absent | Add API authorization matrices, frontend component/Playwright suites, and coverage thresholds before release. |
| TD-008 | Resolved | Dependency | `deepmerge-ts` is pinned to patched 8.x through pnpm overrides; production audit is clean | Keep the override covered by CI until a compatible Prisma upgrade removes the transitive requirement. |
| TD-009 | Medium | Holds | Expired holds depend on seat-list cleanup | Atomic takeover and scheduled cleanup. Non-sellable seat types are now rejected server-side. |
| TD-010 | Medium | Reports | Gross revenue KPIs can include refunded amounts | Define financial metrics and aggregate net values consistently in SQL. |
| TD-011 | Medium | Operations | CI, container definitions, health probes, structured HTTP completion logs, and backup/restore scripts exist; hosted telemetry and restore evidence remain | Build images in a Docker-enabled environment, configure metrics/alerts, and complete a documented scratch restore drill. |
| TD-012 | Low | API scale | Operational and reference lists have validated page/limit bounds and agent totals use page-scoped database aggregates; some report internals still materialize bounded periods | Add cursor metadata and move remaining report calculations fully into database aggregation. |
| TD-013 | Low | Configuration | Backend config now fails fast, JWT algorithm/issuer/audience are explicit, and API examples agree; web still permits a local fallback | Add a centralized web runtime schema and require explicit production origins/URLs. |
| TD-014 | Medium | Git baseline | Repository has no commits; all files untracked | Establish reviewed initial baseline before collaborative release work. |
