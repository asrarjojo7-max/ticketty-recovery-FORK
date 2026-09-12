# Ticketty Final Production Operations Evidence — 2026-09-12

## Scope and evidence standard

This record distinguishes implementation evidence from external deployment conditions. It contains no credential values. A checksum/archive read proves transfer integrity; it does **not** prove an independent restore.

## Official external backup destination

- Operator-declared company account: `erpemail902@gmail.com`.
- Connected rclone remote used by the server: `gdrive:`.
- Root: `Ticketty Production/`.
- Verified folders: database `Daily/Weekly/Monthly`, source `Backend/Web/Database/Migrations/Shared`, production configuration, operations `Runbooks/Recovery/Monitoring`, release archives, and recovery manifests.
- Operational warning: the connected remote currently uses rclone's shared Google client ID. It authenticated and transferred successfully, but a company-owned OAuth client ID is still required before the shared client is retired.

## Database backup evidence

Latest scheduled, off-site backup verified in this cycle:

| Field | Evidence |
|---|---|
| UTC timestamp | `2026-09-12T21:48:08Z` |
| Archive | `ticketty-20260912T214808Z.dump` (PostgreSQL custom compressed format) |
| Remote path | `Ticketty Production/01_Database_Backups/Daily/` |
| Size | `1,554,368` bytes |
| SHA-256 | `2189e2c0396c7b45af6899a7f4b5662d2d7db1532dc1a3febfe6f7d7753a6cd6` |
| Archive TOC | 461 entries |
| Source PostgreSQL | 16.15, database `ticketty` |
| Migration count | 45 applied |
| Latest migration | `20260914140000_mandatory_temporary_password` |

Verification performed:

1. Atomic `pg_dump --format=custom --no-owner --no-acl` completed.
2. Local SHA-256 verification passed.
3. `pg_restore --list` passed.
4. Archive and checksum uploaded to Google Drive.
5. Remote byte size matched the local archive.
6. Both objects were downloaded into a fresh temporary directory.
7. Downloaded SHA-256 verification passed.
8. Downloaded archive passed `pg_restore --list` with 461 TOC entries.

The same verified baseline archive was copied to the initial Weekly and Monthly tiers. No valid backup was deleted. Automatic retention deletion remains disabled (`BACKUP_RETENTION_DAYS=0`) until policy approval.

## Persistent schedule

System units installed on the current server:

- `ticketty-backup.timer`: enabled and active; daily at 02:30 with persistent catch-up and randomized delay.
- `ticketty-backup-watchdog.timer`: enabled and active; independent hourly freshness check.
- `/etc/ticketty/backup.env`: root-owned mode `0600`.
- Local backup/state/Prometheus textfile paths are outside the source checkout.
- A manual systemd execution completed successfully and uploaded the archive above; the independent watchdog then reported a fresh heartbeat.

## Restore classification

**Independent restore on a second server: DEFERRED — no independent server currently available.**

No second-server success is claimed. The repository provides `ops/restore-postgres.sh` and `ops/verify-restore.sh`, including checksum verification, clean target enforcement, migration status, ACL replay, database invariant suites, application bootstrap, RLS probe, row-count comparison, cleanup, and measured RTO output. The future operator must download the selected Drive archive and checksum, run the drill on a different host, and preserve its output before admitting real passenger or financial data.

## Monitoring and alerting evidence

- Prometheus configuration validated with Prometheus `v3.5.0`/`promtool`.
- Alert rules validated: 4 groups, 26 rules.
- Alertmanager configuration validated with Alertmanager `v0.28.1`/`amtool`.
- Dedicated `ticketty_monitor` PostgreSQL login provisioned as NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE with `pg_monitor` membership.
- Live validation scrapes were all up: Ticketty backend, Ticketty web probe, Prometheus, PostgreSQL exporter, and node exporter.
- Backup textfile metrics were collected with `ticketty_backup_last_result=1`.
- A controlled alert was accepted by Alertmanager and forwarded to a local evidence receiver; notification counters recorded successful webhook delivery.

**Real external alert delivery: BLOCKED.** No approved external webhook/SMTP/Telegram credential was present in the shell, application process, or `/etc/ticketty`. The committed Alertmanager configuration therefore reads the receiver URL from a non-versioned secret file and fails closed when that file is absent. A local receiver is evidence of routing only, not evidence of external delivery.

## Application controls

- Temporary credentials are persisted in `users.mustChangePassword`.
- Platform-provisioned owners and administration-created users are marked pending.
- A global backend guard blocks ordinary API access using `PASSWORD_CHANGE_REQUIRED`.
- Only session inspection and password remediation are exempt.
- Successful rotation clears the flag atomically and invalidates the old JWT credential version.
- The web login and dashboard layout route pending users to `/change-password`; direct API access remains blocked server-side.
- The pilot payment mode is explicitly `CASH`; booking DTO validation continues to reject every digital method.
- Compose fixes the worker-enabled backend to a named singleton container. Horizontal worker scaling remains unsupported for the pilot.

## Production runtime evidence

- `ticketty-backend.service` and `ticketty-web.service` are enabled and active.
- Backend runs compiled `dist/main.js`; web runs Next standalone. No Ticketty `next dev` or Nest watch process owns ports 3000/4000.
- Both listeners are loopback-only (`127.0.0.1:3000` and `127.0.0.1:4000`); Cloudflare remains the HTTPS edge.
- Public readiness returned 200.
- Public login returned a host-only cookie with `Secure`, `HttpOnly`, `SameSite=Lax`, and `Max-Age=900`.
- Public authenticated `auth/me`, trips, bookings, dashboard report, and buses requests returned 200.
- Public metrics proxy returned 404.
- Production response contained CSP, HSTS, nosniff, frame denial, referrer policy, and permissions policy; CSP omitted development-only `unsafe-eval`.
- `ticketty-monitoring.service` and the local evidence sink are enabled and active. Prometheus, Alertmanager, postgres-exporter, node-exporter, and blackbox-exporter listen only on loopback.

## Git, test, and archive evidence

- Consolidated engineering release commit: `5836b27430d3089fe678d2e98f911fd9c30ad77e` (`release: prepare Ticketty controlled pilot`).
- Backend final gates: lint/typecheck/build/audit passed; 32 unit suites/202 tests passed; 17 API E2E suites/173 tests passed; all six SQL contract commands and Prisma migration validation/status passed.
- Web final gates: lint/typecheck/build/audit passed; 7 unit files/31 tests passed; 55 Playwright tests passed against the public HTTPS production runtime across desktop Chromium, mobile Chromium, and mobile WebKit.
- Backend and web production container images built successfully and declare the non-root `node` user.
- `ops/create-release-archive.sh` refuses a dirty tree and generated a full Git archive plus Backend/Web/Database/Migrations/Shared archives, each with SHA-256 and tar integrity checks. The final archive commit/hash is recorded in the Drive recovery manifest and the execution report rather than recursively embedding a commit SHA in its own commit.
