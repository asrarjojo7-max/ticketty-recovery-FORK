# Ticketty Production Hardening Baseline

**Baseline date:** 2026-09-12

**Git revision:** `0ff626e` (`master`)
**Scope:** Exact working-tree snapshot at audit start, including pre-existing uncommitted work.

## Change-safety declaration

No source or configuration was changed before this baseline was established. At audit start the repository already contained **80 modified/staged paths and 23 untracked entries**. Those changes include active ticket-branding, boarding, seat-template, UI/mobile, and test work. They are treated as user-owned work and must not be reset or overwritten. This hardening effort will use targeted edits only and will not claim those pre-existing changes as its own.

## Architecture baseline

Ticketty is a two-process modular monolith:

- **Web/BFF:** Next.js 16 App Router + React 19, with the browser-facing JWT held in an HttpOnly cookie and forwarded by route handlers under `/api`.
- **API:** NestJS 11 modular monolith. Global request order is throttling, JWT authentication, permissions, subscription policy, then a tenant-RLS transaction interceptor.
- **Data:** Prisma 6 over PostgreSQL 16. Tenant data is protected by PostgreSQL RLS with transaction-local organization context and role switching.
- **Workers:** Accounting-outbox and subscription sweep timers run in the API process. Accounting event claims use PostgreSQL leases and `FOR UPDATE SKIP LOCKED`.
- **Cache/queue:** No Redis or external queue. Seat holds, idempotency, accounting events, and leases are PostgreSQL-backed. Rate limiting is process-local.
- **Deployment:** Single-host Docker Compose baseline: PostgreSQL, one-shot migration gate, backend, and Next standalone web. Public TLS/reverse proxy is external to the repository.
- **Operations:** Prometheus metrics, liveness/readiness, SQL invariant checks, backup/restore scripts, alert rules, and watchdog scripts exist.

The architecture remains suitable for a controlled pilot as a modular monolith. No microservice rewrite is justified. The main structural risks are direct cross-domain Prisma coupling, in-process workers, broad request-length RLS transactions, and several oversized services/components.

## Runtime observed at baseline

| Component | Observed state | Evidence |
|---|---|---|
| Web on `:3000` | **Development runtime** (`next dev`, `NODE_ENV=development`) | Process inspection and live CSP containing development-only `unsafe-eval` |
| Backend on `:4000` | Compiled `node dist/main`, but `NODE_ENV` was not present in the process environment and config therefore defaults to development | Process environment + `env.validation.ts` default |
| PostgreSQL | Local PostgreSQL on `localhost:5433`; 40 applied migrations | `prisma migrate status`, live catalog query |
| Docker Compose | Configuration valid when required secrets/origins are provided; Docker daemon available | `docker compose config --quiet` exit 0; Docker 29.8.0 |
| Worker | Current local process has no recorded successful accounting cycle | Readiness returned `secondsSinceLastSuccess: -1`; worker metric timestamp was `0` |

The live developer preview is **not** a production runtime and must not be used as production evidence. The repository does contain a production Next standalone command and production Dockerfiles; those paths require separate runtime verification after remediation.

## Command baseline

| Area | Command | Exit | Objective result |
|---|---|---:|---|
| Backend typecheck | `pnpm typecheck` | 0 | Passed |
| Backend lint | `pnpm lint:check` | 1 | **6 errors, 32 warnings**. Errors are in new seat-template/trip tests and the seat-race test. |
| Backend unit | `pnpm test --runInBand` | 0 | **30 suites, 186 tests passed** |
| Backend coverage | `pnpm test:cov --runInBand` | 0 | Statements 48.19%, branches 43.34%, functions 26.26%, lines 48.47%; no enforced thresholds |
| Backend build | `pnpm build` | 0 | Passed |
| Backend production audit | `pnpm audit --prod` | 1 | **3 High + 1 Low**, all through Multer 2.2.0; patched release 2.3.0 available |
| Backend E2E | `pnpm test:e2e --runInBand` | 0 | **17 suites, 169 tests passed** in 109.5s |
| Prisma validation | `pnpm exec prisma validate` | 0 | Passed |
| Migration status | `pnpm exec prisma migrate status` | 0 | **40 migrations**, database reported up to date |
| DB invariant umbrella | `pnpm test:db:invariants` | 0 | Passed |
| Refund integrity | `pnpm test:db:refund-integrity` | 0 | Passed |
| Tenant consistency | `pnpm test:db:tenant-consistency` | 0 | Passed |
| Settlement integrity | `pnpm test:db:settlement-integrity` | 0 | Passed |
| Accounting integrity | `pnpm test:db:accounting-integrity` | 0 | Passed |
| Trip overlap | `pnpm test:db:trip-overlap` | 0 | Passed |
| Web typecheck | `pnpm typecheck` | 0 | Passed |
| Web lint | `pnpm lint:check` | 0 | Passed |
| Web unit | `pnpm test` | 0 | **5 files, 24 tests passed** |
| Web coverage | `pnpm exec vitest run --coverage ...` | 1 | Coverage provider missing: `@vitest/coverage-v8` |
| Web build | `pnpm build` | 0 | Passed; warning about custom cache control on `/_next/static/:path*` |
| Web production audit | `pnpm audit --prod` | 1 | **2 Critical Next.js advisories + 1 High transitive Sharp advisory** |
| Browser E2E setup | `pnpm e2e:setup` | 0 | Test users/fixtures provisioned |
| Browser E2E | `pnpm e2e:web` | 0 | **52 tests passed** in 10.5m across desktop Chromium, mobile Chromium, mobile WebKit, and agent-mobile project |
| Compose config | production-like dummy required values + `docker compose config --quiet` | 0 | Passed |
| Backend container build | `docker build -f backend/Dockerfile ...` | 0 | Passed from a fresh image layer/install |
| Web container build | `docker build -f web/Dockerfile ...` | 1 | **Failed** during frozen install: pnpm blocked `unrs-resolver` build because the web package lacks an `allowBuilds` policy |
| Backup/restore drill | `ops/verify-restore.sh` to isolated scratch DB | 0 | **PASS, measured RTO 78s**; migrations, 69 ACL statements, SQL contracts, app bootstrap, RLS probe, and row-count comparison passed |
| Patch hygiene | `git diff --check` | 0 | Passed |

## Dependency findings

### Web

- `next@16.3.2`: two Critical advisories; patched at `>=16.3.3`. Registry reports current 16.x release `16.3.5`.
- Next resolves `sharp@0.35.3`, affected by a High libheif advisory; patched at `>=0.35.4`.
- The Windows-host RCE path is not reachable in the Linux Docker image, but the dependency remains launch-blocking because a safe patch is available and the AVIF image path is framework-exposed.

### Backend

- `@nestjs/platform-express@11.2.1` pins `multer@2.2.0`.
- Multer 2.2.0 has three High DoS advisories and one Low size-filter race. The upload path is reachable through authenticated organization-branding upload and buffers files before Sharp processing.
- `multer@2.3.0` is available; compatibility must be verified through a targeted override plus upload/unit/E2E/build checks.
- Direct backend Sharp is already `0.35.4`.

## Database baseline

- The configured development connection uses role `mojahed`.
- Live catalog evidence: `rolsuper=true`, `rolbypassrls=true`, `rolcreaterole=true`, `rolcreatedb=true`, and ownership of 37 public tables.
- The connection role is a member of `ticketty_app`, `ticketty_auth`, `ticketty_platform`, and `ticketty_accounting_worker`; application code uses `SET LOCAL ROLE`, but the process still possesses a superuser credential and can reset/bypass the boundary.
- RLS behavior without organization context passed (`ticketty_app` saw zero organization rows), but that does not mitigate credential compromise of the superuser session identity.
- `prisma migrate diff --from-url ... --to-schema-datamodel ... --exit-code` returned **2 (non-empty)**. Expected SQL-only differences include compound tenant constraints; confirmed unintended drift includes `Ticket.number` still carrying Prisma global `@unique` despite a migration replacing it with organization-scoped uniqueness. Subscription relation/default/index representation also differs from the migrated schema.

## HTTP/authentication baseline

Live requests against the current developer stack established:

- unauthenticated `/api/proxy/auth/me` → 401;
- cross-origin login and logout → 403;
- valid login → 200 and a host-only, HttpOnly, SameSite=Lax cookie;
- authenticated `/auth/me` → 200;
- logout deletes the browser cookie;
- invalid account login produces a generic 401 response.

Because the current web process is development HTTP, its cookie correctly lacked `Secure`, CSP included development-only `unsafe-eval`, and HSTS was absent. This is not production evidence. The local backend environment also issued a seven-day JWT, while production examples specify 15 minutes; production validation does not currently cap this value.

## Backup/recovery baseline

A real local backup and isolated restore was executed, not inferred:

- custom-format dump and SHA-256 created;
- restored into a fresh scratch database;
- migration state checked;
- 69 security ACL statements replayed;
- all SQL contracts passed;
- application boot/readiness passed;
- `ticketty_app` without tenant context saw zero rows;
- row counts matched for organizations, users, trips, bookings, tickets, payments, and accounting events;
- scratch database and temporary backup were removed;
- measured end-to-end RTO: **78 seconds**.

This proves local restorability. It does **not** prove encrypted off-host retention or restore on a separate host. An `rclone` remote is configured on this workstation, but no production destination/retention authorization has yet been established and no external upload is claimed.

## Verified assessment hypotheses

| Hypothesis | Baseline conclusion |
|---|---|
| Dependency vulnerabilities | **Confirmed**: Next Critical, transitive Sharp High, Multer High |
| Production uses `next dev` | **Partially disproven**: deploy definitions use standalone production; current live preview is dev and is not acceptable production evidence |
| CSP `unsafe-eval` | **Dev-only by configuration**; production response still requires live verification |
| Missing HSTS | **Configured for production only**; current dev response omits it as expected; production response requires live verification |
| Cookie security | Core attributes confirmed in dev; production `Secure`/expiry still requires production-runtime proof |
| Excessive DB privilege | **Confirmed**: current application connection identity is superuser/BYPASSRLS/table owner |
| Ticket-number race | **Confirmed by code**: company-wide maximum is protected only by a trip-scoped advisory lock; different trips can allocate the same next number |
| POS retry key weakness | **Confirmed**: `crypto.randomUUID()` is called inside each mutation invocation, so retry/reload does not preserve a logical-sale key |
| Worker-success ambiguity | **Confirmed**: readiness reports ready with `secondsSinceLastSuccess=-1`; queue metric is absent while the DB currently contains pending events |
| Backup/restore weakness | Local restore is proven; off-host backup and independent staleness monitoring remain unproven |
| Prisma/migration consistency | **Confirmed** non-empty diff; one clear ticket uniqueness mismatch plus SQL-only drift requiring explicit governance |
| Clean CI | Substantial pipeline exists, but current backend lint and dependency audits fail; CI installs Chromium only while configuration includes WebKit |
| Concurrency coverage | Same-seat contention exists and passes; different-trip ticket-number contention and concurrent same-key replay are absent |
| Coverage governance | **Confirmed**: no thresholds; web coverage provider is absent |
| Load capacity | **Confirmed unmeasured** |
| Large components/services | **Confirmed**: largest frontend component 1,063 lines; several backend services 500–690 lines |

## Additional findings discovered

1. Authenticated `tickets.write.own` users can call `markPrinted` on another agent's same-branch ticket because ownership filtering is missing.
2. `/api/proxy/metrics` publicly exposes the backend Prometheus payload (observed HTTP 200, about 106 KB).
3. Accounting queue observation calls the Prisma raw-query proxy without tenant/worker context, is rejected, catches the error, and leaves queue metrics absent/stale. Live DB had 40 PENDING and 40 FAILED events while the exported queue-depth series had no samples.
4. The generic BFF does not forward a trusted client IP, so backend IP-based rate limits collapse browser users behind the web process.
5. Password-change invalidation has a one-second JWT `iat` race.
6. Provisioned temporary owner passwords are labelled `mustChangePassword` in a response but no persisted enforcement exists.
7. The backup staleness check runs only after the same script records a fresh success, so it cannot detect that cron itself stopped.
8. CI's Playwright install command installs Chromium only, while the suite config includes a WebKit project.
9. E2E fixture setup creates a fresh bus before determining whether a fresh trip is needed, causing persistent fixture accumulation.

## Baseline launch decision

**NO-GO at baseline.** Critical dependency advisories, excessive runtime database privileges, ticket-number cross-trip concurrency risk, POS key persistence, failing lint/audit gates, and unverified production runtime/session behavior are launch blockers. Local restore and the existing broad test suites are meaningful strengths, but they do not offset these blockers.
