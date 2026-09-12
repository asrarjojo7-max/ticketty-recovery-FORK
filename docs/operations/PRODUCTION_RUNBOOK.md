# Ticketty Controlled-Pilot Operations Runbook

## Release gate

Do not deploy unless all commands below pass on the release commit:

```bash
(cd backend && pnpm install --frozen-lockfile && pnpm exec prisma generate \
  && pnpm lint:check && pnpm typecheck && pnpm test:cov --runInBand \
  && pnpm build && pnpm audit --prod)
(cd web && pnpm install --frozen-lockfile && pnpm lint:check \
  && pnpm typecheck && pnpm test:cov && pnpm build && pnpm audit --prod)
```

Against an isolated PostgreSQL instance also run all API E2E/SQL suites, browser E2E, a clean migration/bootstrap test, both container builds, and `promtool check rules ops/alert-rules.yml`.

## Deployment

1. Create two independent database secrets and the JWT secret in the deployment secret manager.
2. Set `MIGRATION_DATABASE_URL` to the admin identity and `RUNTIME_DATABASE_URL` to `ticketty_runtime`.
3. Set public `WEB_ORIGIN`/`APP_ORIGIN` to the exact HTTPS origin.
4. Confirm Cloudflare Tunnel is the sole public path to web; API/PostgreSQL remain loopback/internal.
5. Run `docker compose run --rm migrate`. This deploys migrations, provisions/rotates the runtime role, and executes database invariants.
6. Run `docker compose up -d` and inspect `docker compose ps`.
7. Require web liveness/readiness, backend liveness/readiness, and an authenticated smoke transaction.
8. Verify `/api/proxy/metrics` is 404 externally and `/api/metrics` is scrapeable only from the monitoring network.

The current single-host pilot uses the equivalent systemd units in `ops/systemd/`: compiled Nest and Next standalone, both bound to loopback behind Cloudflare. Install immutable build artifacts under `/srv/ticketty`, copy the safe unit templates to `/etc/systemd/system`, keep environment files root-owned outside Git, and enable `ticketty-backend.service` plus `ticketty-web.service`. Never point these units at a development server.

## Worker operation

For the single-instance pilot, exactly one backend has `ACCOUNTING_WORKER_ENABLED=true`. The Compose backend has the fixed name `ticketty-backend-singleton-worker`, intentionally preventing accidental `--scale backend=N` while in-process workers are enabled. Readiness must report `accountingWorker.state=healthy`; `never_succeeded`, `failing`, or `stale` is degraded and requires investigation. Compare queue labels in internal metrics with direct DB counts when reconciling. Do not add a second worker-enabled replica without an explicit distributed leader/coordinator design.

## Temporary credentials

Every platform-provisioned owner and administration-created user starts with `mustChangePassword=true`. Login is allowed only to establish the remediation session. The global backend guard denies all normal APIs with `PASSWORD_CHANGE_REQUIRED`; only `/auth/me` and `/auth/change-password` are exempt. After successful rotation the old JWT is invalid. Operators must never clear this database flag manually.

## Controlled-pilot payment mode

`PILOT_PAYMENT_MODE=CASH` is mandatory and production configuration validation rejects any other value. Booking DTO validation independently allows only `PaymentMethod.CASH`. Do not enable or simulate card, bank, mobile-money, or provider flows during the controlled pilot.

## Backup and recovery

- Schedule `ops/backup-nightly.sh` daily with the official `gdrive:Ticketty Production/01_Database_Backups/Daily` destination.
- Configure the Weekly and Monthly remotes. The script promotes Sunday/day-1 backups without deleting existing copies.
- Keep `BACKUP_RETENTION_DAYS=0` until deletion retention is formally approved.
- Schedule `ops/backup-watchdog.sh` independently every hour.
- Keep both schedules outside the application container lifecycle. Reference systemd units are in `ops/systemd/`.
- Test notification delivery after configuration and quarterly.
- Run `ops/verify-restore.sh` quarterly using a backup downloaded from the off-host destination and record RPO/RTO and row counts.
- Independent second-server restore is **DEFERRED** until a separate host exists; follow `SECOND_SERVER_RESTORE_CHECKLIST.md` and never substitute a same-host test for this gate.

## Monitoring

1. Provision the dedicated PostgreSQL monitor with `pnpm db:provision-monitoring` using an out-of-band 32+ character password.
2. Put the company-approved receiver URL in `/etc/ticketty/alertmanager-webhook-url` (owner `root:nogroup`, mode `0640` for the non-root container); never commit it.
3. Start Prometheus, Alertmanager, postgres-exporter, node-exporter, and blackbox-exporter from `compose.yaml`.
4. Confirm ports 9090/9093 bind only to loopback and `/api/proxy/metrics` remains 404 externally.
5. Require all five scrape targets to be up and fire a controlled alert through the real receiver before admitting production traffic.
6. Until an approved receiver secret is supplied, external alert delivery is **BLOCKED**, even if local routing tests pass.

## Release and source archives

After all release gates pass and the tree is committed, run `ops/create-release-archive.sh /secure/output`. The script refuses a dirty tree, uses `git archive` so ignored secrets/dependencies/build outputs cannot enter the archive, creates full and category archives, validates each tarball, emits SHA-256 files, and writes a recovery manifest without secret values. Upload the resulting files to the corresponding `Ticketty Production/02_Application_Source/`, `05_Release_Archives/`, and `06_Recovery_Manifests/` folders.

## Incident triage

1. Stop or drain public traffic for suspected integrity/security failures.
2. Preserve application, edge, database, watchdog, and backup logs with request IDs.
3. For financial inconsistency, stop the accounting worker but retain the API only if further sales are explicitly authorized.
4. Never edit posted journal entries or audit records directly; use reversal/requeue workflows.
5. Before a database repair, create and verify a backup.
6. Use forward migrations. Do not run `prisma db push` against shared/production data.

## Rollback

Redeploy the previous immutable application images. Database migrations are forward-only; use a reviewed compensating migration rather than destructive schema rollback. Run liveness, readiness, authentication, tenant-isolation, and a no-value smoke flow before reopening traffic.

## Pilot SLO signals

Escalate immediately for application scrape loss, database unavailability, accounting worker staleness, stale pending accounting events, failed accounting events, backup heartbeat expiry, repeated backup failure, sustained 5xx rate above 5%, or resource-pressure alerts. The local performance baseline is not a production capacity guarantee.
