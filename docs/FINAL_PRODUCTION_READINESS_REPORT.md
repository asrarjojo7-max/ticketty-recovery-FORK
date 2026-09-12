# Final Production Readiness Report

**Assessment date:** 2026-09-12

**Target:** Ticketty controlled real-customer pilot
**Architecture decision:** Preserve the NestJS/Next.js/PostgreSQL modular monolith

# Executive Summary

The audited starting snapshot was a capable advanced MVP with strong database constraints, meaningful RLS work, broad API E2E tests, and a functional browser suite. It was nevertheless a **NO-GO** at baseline because production dependency audits failed, the API retained a superuser/BYPASSRLS database credential, ticket numbering could collide across simultaneous sales on different trips, the POS did not preserve a logical-sale idempotency key, and operational/CI evidence had material gaps.

The feasible P0 and P1 code blockers identified in this cycle have been remediated and verified. The final candidate has clean production dependency audits, a fail-closed least-privilege database runtime identity, cross-trip-safe ticket numbering, durable payload-bound POS retries, explicit worker-health states, protected metrics, an independently scheduled backup heartbeat monitor, reproducible clean migrations, enforced coverage floors, passing production builds/images, and expanded concurrency/security/browser tests.

The recommendation is **GO WITH CONDITIONS for a tightly controlled pilot**, not unrestricted public SaaS availability. The remaining conditions are deployment/environment controls: company-owned backup credentials and schedules, independent hosted monitoring/on-call routing, a different-host restore drill, a single worker-enabled API replica, and mandatory operator-enforced rotation of bootstrap tenant passwords until technical enforcement is delivered.

# Architecture Assessment

Ticketty remains an appropriate modular monolith:

- Next.js 16 App Router serves the UI and BFF.
- NestJS 11 hosts domain modules, policy guards, workers, and HTTP APIs.
- Prisma 6 and PostgreSQL 16 provide persistence, transactional boundaries, constraints, advisory locks, RLS, and the accounting outbox.
- No service split is justified by current load evidence.

The architecture is strong enough for a controlled pilot. Direct Prisma coupling and large orchestration services remain maintainability debt, but a broad refactor would add more release risk than value now. ADRs in `docs/engineering/DECISIONS.md` record the ticket-number, database-identity, and idempotency decisions.

# Security Assessment

## Dependency security

- Next.js was upgraded from 16.3.2 to **16.3.4**, closing two Critical advisories.
- Its resolved Sharp dependency is now **0.35.4**, closing the High libheif advisory.
- Multer is pinned to **2.3.0** through pnpm overrides because Nest 11.2.1 still pins vulnerable 2.2.0.
- Final backend and web `pnpm audit --prod` both report **no known vulnerabilities**.

## HTTP and browser boundary

An actual production build/container response was verified with CSP, HSTS, `nosniff`, frame denial, referrer policy, permissions policy, and cross-origin opener policy. `unsafe-eval` is absent from production. `script-src 'unsafe-inline'` remains an explicitly accepted defense-in-depth risk; no unescaped attacker-controlled HTML sink was found.

The public catch-all BFF now rejects internal metrics and backend health paths. External-style `/api/proxy/metrics` requests return 404 while the private backend endpoint remains scrapeable.

Brand image uploads retain file-size, pixel-count, magic-byte, decode, and normalized-WebP controls and now have an endpoint-specific limit of six requests/minute. A live test returned 400 for six malformed authenticated uploads and 429 for the seventh.

# Authentication & Authorization

- Production JWT lifetime is capped at one hour; the deployment default and verified runtime lifetime are 15 minutes.
- Production public origins must use HTTPS, except explicit loopback needed for local production verification/CI.
- The BFF session cookie was observed with `Secure`, `HttpOnly`, `SameSite=Lax`, host-only scope, and `Max-Age=900` when configured with an HTTPS origin.
- Missing/invalid sessions return 401; untrusted mutation origins return 403; logout expires the cookie.
- JWTs now carry the exact millisecond password-credential timestamp. The guard requires exact equality, removing the same-second race and intentionally invalidating pre-upgrade tokens.
- Authorization permissions and active user/organization state continue to be re-read from PostgreSQL on every protected request.
- The ticket-print endpoint now applies tenant, branch, and agent ownership atomically and returns only a minimal acknowledgement. Cross-agent tests prove the other agent's ticket remains unchanged and no PII is returned.
- Client IP propagation now trusts only Cloudflare's validated `CF-Connecting-IP` at the BFF and replaces browser-supplied XFF. A live two-client test produced `401×5,429` for client A while client B still received 401; changing only spoofed XFF values did not evade the sixth-request 429.

Final-operations update: first-login password rotation is now persisted and enforced server-side; AR-005 is closed with unit/API/browser coverage.

# Multi-Tenancy / RLS

RLS remains transaction-bound and fail closed. Runtime role provisioning creates `ticketty_runtime` as LOGIN, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`, without direct table grants or object ownership, and grants only membership in the audited NOLOGIN roles.

Live evidence:

- direct table SELECT privilege: false;
- without tenant context under `ticketty_app`: 0 organizations visible;
- with tenant A context: tenant A visible;
- tenant B remains invisible;
- production API started and authenticated successfully under this credential;
- startup under the admin/superuser credential failed closed.

The migration/admin URL is now isolated to the one-shot migration job and is not passed to the API container.

# Database

- Final migration count: **44**.
- A fresh empty database accepted every migration in order, the runtime role was provisioned, all database invariants passed, and the production application booted using the restricted login.
- The stale global Prisma uniqueness marker on `Ticket.number` was removed; organization-scoped uniqueness remains the source of truth.
- Subscription history is modelled as one-to-many, a validated organization FK was added, and 150 impossible orphan rows in the long-lived test database were audit-recorded and removed by migration.
- `SystemEvent` and representable subscription defaults/index names were brought into the Prisma model.
- Remaining Prisma diff output consists of intentional SQL-only compound tenant constraints/indexes that Prisma cannot safely model; SQL invariant tests are the enforcement source of truth.

# Booking & Ticketing

- Same-seat contention: one of eight simultaneous buyers succeeded; seven received business conflicts; exactly one booking, ticket, payment, and accounting event resulted.
- Cross-trip ticket-number contention: two simultaneous sales for different trips in the same organization both succeeded and produced two distinct persisted ticket numbers.
- Ticket-number allocation now uses a transaction advisory lock scoped to organization and calendar year, in addition to the unique database index.
- Booking rollback, expired holds, cancellations, refund ceilings, trip lifecycle, and boarding double-use remain covered by API/database tests.

# POS & Idempotency

- The browser now stores a random idempotency key by canonical payload fingerprint in session storage for 24 hours and removes it only after definitive success.
- Passenger payload data itself is not stored.
- The backend binds the key to a canonical request hash and durable booking resource in `idempotency_records`.
- Concurrent duplicates return the same booking with one payment; a reused key with different content returns 409; failed transactions roll back their processing record; completed records remain replayable after lease expiry.
- A real Playwright response-loss test let the server commit, aborted the browser response, retried from the UI, observed the same key twice, and recovered the original successful result.

# Accounting

The transactional outbox, unique source/event constraints, leased claim, bounded retries, failed-event requeue, balanced posting, reversal, and closed-period controls remain intact.

Queue-depth observation now executes through a narrow `SECURITY DEFINER` aggregate exposed only to the accounting-worker role. A live worker reported all PENDING/FAILED/POSTED gauges and a finite last-success timestamp. Health distinguishes `disabled`, `never_succeeded`, `failing`, `stale`, and `healthy`; an enabled worker without success reports `degraded`, never a misleading healthy `-1` state.

# Background Workers

For the pilot, exactly one backend replica must enable workers. PostgreSQL leases protect accounting claims and the subscription sweep is idempotent. Coupling workers to API processes remains accepted until horizontal scaling is justified; enabling workers indiscriminately on every future API replica is prohibited by the runbook.

# Backups & Disaster Recovery

Two real restore paths were verified:

1. Current development database → local custom dump/checksum → isolated scratch restore → migrations/ACL replay/all SQL contracts/application bootstrap/RLS/row-count match: **PASS, RTO 16s on final run**.
2. Synthetic clean database → Google Drive rclone destination → local source deleted → external artifact downloaded → checksum/archive validation → isolated full restore and all gates: **PASS, RTO 16s**.

Checksums are now portable because they contain the dump basename rather than an absolute path. The restore drill can consume a supplied downloaded artifact and now cleans scratch state on failure. Production backup refuses to report success without an off-host destination.

A separate `backup-watchdog.sh` detects a missing/stale success heartbeat. Simulations produced exit 1 for missing/stale state, exit 0 for fresh state, and delivered the HIGH alert to an independent local HTTP receiver.

The permanent production remote and different-host restore remain deployment conditions. The test Google Drive remote's shared rclone client ID must be replaced with a company-owned client ID.

# Monitoring & Observability

`promtool` validated all **13** alert rules. Coverage includes application scrape loss, worker staleness/failures, accounting event failures/backlog, subscription sweep health, elevated 5xx, authentication-failure surge, event-loop lag, and memory pressure. Database and queue failures are also checked independently by the watchdog.

Metrics stay private behind the BFF block. The dedicated web health endpoint exposes only backend up/down and coarse worker state.

# Testing

Final evidence:

- Backend unit: **32 suites / 202 tests passed**.
- Backend API/integration E2E: **17 suites / 173 tests passed**.
- Web unit: **7 files / 31 tests passed**.
- Browser E2E: **55 tests passed** against production builds, including desktop Chromium, mobile Chromium, mobile WebKit, POS sale/print/boarding/double-board, response-loss replay, permission denial, and invalid session.
- PostgreSQL: umbrella plus refund, tenant, settlement, accounting, and overlap contracts passed.
- Coverage: backend and web non-regression thresholds are enforced in CI. The final web run reported 4.31% statements, 4.40% branches, 2.60% functions, and 4.81% lines; the low web unit baseline remains explicit as risk AR-006 rather than being disguised by reporting only imported modules.

# CI/CD

CI now performs frozen installs, Prisma generation, lint, type checks, coverage-enforced unit tests, builds, production audits, migrations, runtime-role provisioning, backend E2E, SQL contracts, browser E2E, and both container builds. Chromium and WebKit are both installed because both are configured.

Local CI-equivalent commands passed. Both release images build successfully, run as the non-root `node` user, and have production commands (`node dist/main.js`, `node server.js`). No hosted GitHub Actions execution was available in this local review.

# Performance

A dependency-free load harness was added at `ops/load-smoke.mjs`. At 100 requests per route and concurrency 10 against the production API, all requests succeeded:

- liveness p95 181.21ms;
- trip list p95 157.17ms;
- dashboard p95 332.63ms;
- sampled peak RSS 157,980 KiB;
- seven DB connections after the run.

Three organization/time indexes were added for exact dashboard query shapes and were selected in forced-index `EXPLAIN ANALYZE` checks with 0.047–1.494ms local execution. No company/user capacity claim is made. See `docs/operations/performance-baseline-2026-09-12.md`.

# Code Quality

Backend lint improved from 6 errors/32 warnings to zero findings. The deprecated wildcard middleware route was updated. A dead Prisma auth method referencing a nonexistent database function was removed. E2E fixture setup no longer creates an unused bus on every run (verified 7 → 7 → 7 across repeated setup).

Large services/components remain, but this cycle intentionally avoided cosmetic rewrites. New boundaries were introduced only where correctness required them: ticket allocation lock, idempotency state, runtime DB identity, worker metrics function, and operational scripts.

# Remaining Risks

The complete accepted-risk register is `docs/KNOWN_PRODUCTION_LIMITATIONS.md`. No unresolved Critical or High application-code finding is known after this cycle. Remaining material risks are deployment-specific or explicitly constrained for a controlled pilot:

- single-host/no automatic failover;
- process-local throttling and in-process workers require one API replica;
- low web unit coverage despite broad browser coverage;
- nonce-based removal of CSP `unsafe-inline` is deferred;
- external alert delivery awaits a company-approved receiver secret;
- no production-scale capacity claim;
- payment-provider integrations remain disabled; sales are CASH-only by design.

# Accepted Risks

See `docs/KNOWN_PRODUCTION_LIMITATIONS.md` for impact, likelihood, owner, mitigation, rationale, and target date for each accepted item.

# Production Deployment Requirements

1. Deploy only reviewed immutable release images; never expose `next dev` or Nest watch mode.
2. Terminate TLS at the trusted edge and expose only the web service.
3. Use separate secrets for migration/admin and `ticketty_runtime`; confirm the startup identity check passes.
4. Use a company-owned rclone/OAuth identity and permanent off-host destination.
5. Install the backup and backup-watchdog as separate schedules and test the real alert channel.
6. Deploy Prometheus/Alertmanager or an equivalent independent monitor and verify alert routing.
7. Run one worker-enabled backend replica during pilot.
8. Keep mandatory server-side bootstrap-password rotation enabled for every newly provisioned tenant and user.
9. Keep digital payment methods disabled until provider verification/reconciliation is implemented.
10. Re-run clean migration, database contracts, dependency audits, production browser E2E, restore drill, and smoke load against the release tag.

# Pilot Recommendation

Proceed only as a managed, low-volume controlled pilot with the deployment requirements above enforced and an operator available to respond to alerts/reconciliation issues. Do not represent the measured local load as capacity and do not open unrestricted self-service onboarding yet.

# Final Scorecard

Qualitative ratings are used instead of fabricated percentages.

| Domain | Before | After | Evidence |
|---|---:|---:|---|
| Security | Blocked | Pilot-ready with conditions | Clean audits; production headers; private metrics; upload throttle |
| Authentication | Partial | Verified for pilot | 15m token/cookie, strict origin, exact credential version, invalid-session tests |
| Multi-tenancy | Strong design / privileged credential | Verified for pilot | Restricted login, startup assertion, RLS positive/negative probes |
| Database | Drift present | Reproducible with documented SQL-only extensions | 44 clean migrations, invariants, app bootstrap |
| Booking | Same-seat evidence only | Verified | 1-of-8 same-seat result, rollback checks, cross-trip successful sales |
| POS | Unsafe retry identity | Verified | Canonical persisted key, API concurrency and Playwright response-loss tests |
| Accounting | Durable but weak health signal | Verified for pilot | Queue function, live metrics, explicit worker state, 173 API E2E total |
| Reliability | Partial | Controlled-pilot ready | Health semantics, graceful shutdown, release containers, watchdogs |
| Backup/Recovery | Local evidence only | Verified mechanism; deployment condition remains | Local and off-host round trip restores, checksums, RTO 16s |
| Monitoring | Config-only and publicly exposed metrics | Mechanism verified; deployment condition remains | Public block, 13 promtool-valid rules, webhook simulation |
| Testing | Broad but gates incomplete | Strong pilot gate | 196 unit, 173 backend E2E, 29 web unit, 55 browser E2E |
| CI/CD | Failing lint/audits/container path | Locally verified deterministic pipeline | Frozen installs, coverage, DB role, both browser engines, both images |
| Performance | Unmeasured | Initial measured baseline | 0% errors at concurrency 10; p50/p95/p99 recorded; query plans captured |
| Maintainability | High coupling/hotspots | Improved selectively | ADRs and focused boundaries; broad rewrite intentionally deferred |
| Overall Launch Readiness | NO-GO | Controlled-pilot candidate | P0/P1 code blockers closed; external conditions listed below |

# Final Go / No-Go Decision

## GO WITH CONDITIONS

1. Configure and test a **company-owned** off-host backup remote; do not rely on rclone's retiring shared Google client ID.
2. Perform and record one restore on a **different host/environment** before admitting real passenger or financial data.
3. Deploy independent monitoring and an owned on-call notification channel; verify delivery from the production host.
4. Run exactly one worker-enabled API replica until distributed rate limiting and worker topology are deliberately introduced.
5. Retain the verified persisted first-login enforcement and investigate any `PASSWORD_CHANGE_REQUIRED` bypass attempt.
6. Keep the product in controlled-pilot scope, CASH-only, with bounded onboarding; re-run production-like load tests before any general SaaS capacity claim.

# Final Operations Execution Addendum — 2026-09-12

## VERIFIED

- The official connected Google Drive remote now contains the complete `Ticketty Production/` hierarchy with separate Daily, Weekly, Monthly, source, configuration, operations, release, and recovery-manifest areas.
- A current production-format database archive was generated atomically, uploaded, size-checked remotely, downloaded into a fresh temporary directory, SHA-256 verified, and parsed with `pg_restore --list`. Evidence: `ticketty-20260912T214808Z.dump`, 1,554,368 bytes, SHA-256 `2189e2c0396c7b45af6899a7f4b5662d2d7db1532dc1a3febfe6f7d7753a6cd6`, 461 TOC entries, 45 migrations through `20260914140000_mandatory_temporary_password`.
- Independent systemd backup and freshness-watchdog timers are enabled and active. The backup service completed successfully through systemd and emitted node-exporter textfile metrics.
- Prometheus and Alertmanager configurations are installed with private loopback listeners. PostgreSQL, host, backup, application, and worker metrics are wired. `promtool` and `amtool` passed; all five scrape targets were up; all 26 rules loaded.
- A controlled alert was accepted by the persistent Alertmanager and forwarded to the local journald evidence sink. This proves rule-to-Alertmanager-to-webhook routing, but is not represented as external notification evidence.
- Temporary-password rotation is now persisted and enforced by a global backend guard. Provisioned owners and administration-created users cannot access normal APIs or dashboard routes until changing the password. Rotation clears the flag atomically and invalidates the old JWT.
- The controlled-pilot payment mode is explicitly `CASH`; backend startup validation and booking DTO validation both reject non-cash enablement/use.
- The production application now runs as systemd-managed compiled Nest and Next standalone services on loopback. No Ticketty `next dev` or Nest watch process owns the production ports. Public HTTPS readiness, secure cookies, security headers, authenticated data routes, and private metrics blocking were verified.
- The backend service is the only worker-enabled application process. The Compose topology uses a fixed singleton backend container name to prevent accidental scale-out during the pilot.

## ACCEPTED RISK / PILOT CONDITIONS

- Single-host topology, in-process workers, process-local throttling, low frontend unit coverage, current CSP `unsafe-inline`, and no production-scale capacity claim remain governed by `KNOWN_PRODUCTION_LIMITATIONS.md`.
- Exactly one backend instance may remain worker-enabled.
- The pilot remains CASH-only and bounded; no digital-payment provider is enabled.
- The connected Drive remote currently uses rclone's shared Google client ID. Transfers work, but it must be replaced with a company-owned OAuth client ID before its announced retirement.

## DEFERRED

- **Independent restore on a second server: DEFERRED — no independent server currently available.** No second-host restore success is claimed. The exact future procedure and evidence requirements are in `operations/SECOND_SERVER_RESTORE_CHECKLIST.md`.
- **Real external alert delivery: DEFERRED/BLOCKED by missing approved receiver credential.** No webhook, SMTP, Telegram, or equivalent company-approved secret was present. The configuration consumes `/etc/ticketty/alertmanager-webhook-url` without committing it. A real controlled alert must be observed in the owned external channel when that secret is supplied.

## OPERATIONAL REQUIREMENTS

- Monitor all Prometheus targets, active alerts, backup heartbeat/age, database connections/deadlocks, worker success/failures/backlog, 5xx rate, latency, memory, CPU, disk, and filesystem state.
- Review systemd and container restart state after every release and keep all monitoring/application listeners private behind the HTTPS edge.
- Preserve the daily schedule and independent hourly watchdog. Do not enable retention deletion until the policy is approved.
- Re-run production gates from the immutable release commit and record any deviation.

## NEXT GATE BEFORE PUBLIC SAAS

1. Supply and verify a company-approved external alert receiver.
2. Perform and record the independent restore on a different server.
3. Replace rclone's shared Google client ID with a company-owned OAuth client ID.
4. Reassess capacity, HA, shared rate limiting, worker leadership, CSP nonces, and frontend unit coverage.

## FINAL CTO DECISION

**GO WITH CONDITIONS — CONTROLLED PILOT ONLY.** The code, current production runtime, off-site backup mechanism, and private monitoring pipeline are operationally verified. The pilot must remain actively supervised and bounded while external alert delivery and the independent second-server restore remain explicitly deferred. This is not approval for unrestricted public SaaS launch.
