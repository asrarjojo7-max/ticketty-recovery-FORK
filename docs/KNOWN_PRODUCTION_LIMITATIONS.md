# Known Production Limitations and Accepted Risks

This register applies to the controlled-pilot release candidate reviewed on 2026-09-12. Acceptance here is not permission to ignore an issue; each item has an owner, mitigation, and target.

| ID | Severity | Issue / impact | Likelihood | Pilot mitigation | Owner | Reason accepted | Target |
|---|---|---|---|---|---|---|---|
| AR-001 | MEDIUM | Single-host PostgreSQL/web/API topology has no automatic host failover. A host failure causes outage until restore/redeploy. | Medium | Controlled customer count, daily off-host backup, tested restore, documented rollback, uptime alerting | Operations | HA orchestration is disproportionate before measured pilot demand | Reassess before general availability; 2026-10-31 |
| AR-002 | MEDIUM | Rate limiting is process-local and therefore not globally consistent across multiple API replicas. | Low during pilot | Run one backend replica; trusted edge-IP forwarding is verified; add shared store before horizontal scale | Backend/SRE | Pilot topology is intentionally single-instance | Before adding a second API replica |
| AR-003 | MEDIUM | Workers remain in the API process. Scaling API replicas also starts worker loops. | Low during pilot | Run one worker-enabled API replica; PostgreSQL lease claims and idempotent sweep prevent duplicate effects | Backend/SRE | Current measured load does not justify queue infrastructure | Before horizontal API scaling; 2026-10-31 |
| AR-004 | MEDIUM | Production CSP retains `script-src 'unsafe-inline'`; this weakens defense in depth if a future HTML injection appears. | Low-Medium | React escaping, no untrusted raw HTML sink found, strict origin/cookie controls, no `unsafe-eval` in production | Application Security | Next App Router nonce rollout makes all affected pages dynamic and needs a dedicated compatibility/performance cycle | 2026-10-15 |
| AR-006 | MEDIUM | Web whole-source unit coverage is 4.31% statements / 4.40% branches / 2.60% functions / 4.81% lines. Browser coverage is broad but not merged into the unit report. | Medium | CI freezes the measured floor; critical POS key logic is >96% covered; 55 browser scenarios cover principal workflows | Frontend/QA | Artificially high emergency thresholds would incentivize low-value tests | Raise by feature, first review 2026-10-15 |
| AR-007 | MEDIUM | No production-scale capacity claim or soak result exists. Local 10-client smoke results are encouraging only. | Medium | Controlled onboarding, observe p95/error/DB connections, load-shed via limits, stop enrollment on SLO breach | SRE/Performance | Production-like infrastructure and traffic model are external deployment inputs | Before expanding beyond controlled pilot |
| AR-008 | LOW | Firefox is not in the browser matrix. Chromium desktop/mobile and WebKit mobile are covered. | Low | Supported pilot browser policy names Chrome/Edge and mobile Safari; manual Firefox smoke before broad launch | Frontend/QA | Current customer device profile prioritizes Chromium and iOS WebKit | 2026-10-31 |
| AR-009 | LOW | The configured test Google Drive remote uses rclone's shared client ID, which is scheduled for retirement. | Medium | Create a company-owned OAuth client and production remote before enabling cron | Operations | Test proved the flow; production credential ownership is external | Before pilot deployment |
| AR-010 | LOW | Several services/components remain large and directly coupled to Prisma/UI concerns. | Medium | No rewrite; refactor only around measured defects with regression tests | Architecture | Broad refactor now would increase launch risk without correctness evidence | Ongoing quarterly review |

## Non-negotiable deployment conditions

1. Use reviewed immutable images, never the development servers.
2. Expose only the TLS-terminated web endpoint; keep PostgreSQL, API, and metrics private.
3. Inject separate admin/migration and runtime database secrets. The API must start as `ticketty_runtime`.
4. Configure a company-owned off-host backup remote and a separately scheduled backup watchdog.
5. Configure Prometheus/Alertmanager (or equivalent) and route critical alerts to an owned on-call channel.
6. Run the release's clean migration, invariant, restore, E2E, audit, and container gates before admitting passenger data.
7. Keep mandatory temporary-password enforcement enabled; never bypass the server-side `PASSWORD_CHANGE_REQUIRED` guard.

## Closed in final operations

- **AR-005 — VERIFIED 2026-09-12:** temporary-password state is persisted, normal APIs are blocked server-side, the dedicated change route is mandatory, successful rotation clears the state atomically, and the old session is invalidated. Backend unit/API E2E and web routing tests cover the lifecycle.
