# PostgreSQL Backup and Restore

## Backup

Use a PostgreSQL client compatible with the server major version:

```bash
DATABASE_URL='postgresql://...' ./ops/backup-postgres.sh
```

The script creates a custom-format dump atomically and writes a SHA-256 checksum under `backups/` (or `BACKUP_DIR`). Upload both files to encrypted off-site storage. A local Docker volume or local dump alone is not a disaster-recovery backup.

Recommended initial policy: daily backups, retention aligned with the data-retention policy, and monitored upload failures.

## Automated restore drill (Phase 7 — `ops/verify-restore.sh`)

The full drill is a single command. It fails fast at the first broken step and cleans up after itself:

```bash
DATABASE_URL='postgresql://...' BACKUP_DIR=/tmp/drill ./ops/verify-restore.sh
```

What it proves (each numbered step is a hard gate):

1. **Backup** — real `pg_dump` custom format + SHA-256 from the live database.
2. **Restore** — into a fresh scratch DB (never the original; in-place restore is refused).
3. **Migrations** — `prisma migrate status` on the restored DB reports up-to-date.
4. **Security ACL replay** — the drill's own discovery: `pg_restore --no-acl` (correct for cross-environment restores) strips *all* Phase 2 GRANT/REVOKE statements, leaving `ticketty_app` with zero table access — a security-dead system after a real disaster recovery. The script re-applies every GRANT/REVOKE statement (multi-line list grants, `ALTER DEFAULT PRIVILEGES`, REVOKEs) extracted from the migration files — the single source of truth — with a real SQL statement splitter (dollar-quoted `DO` blocks are tracked so grants inside `EXECUTE format(...)` role-membership blocks are not misparsed).
5. **Phase 2 umbrella invariants** — RLS, triggers, grants floors, CHECKs all present *on the restored DB*, not just in the original.
6. **Per-contract SQL suites** — refund, settlement, accounting, tenant-consistency, trip-overlap.
7. **App bootstrap** — NestJS boots against the restored DB and readiness reports `{"status":"ready","database":"up"}`.
8. **Live RLS probe** — as `ticketty_app` with no org context, `organizations` reads 0 rows (isolation alive after restore).
9. **Row-count spot check** — organizations/users/trips/bookings/tickets/payments/accounting_events match between source and restored.
10. **RTO report + cleanup** — total elapsed time; scratch DB and temp backup are removed.

Latest drill result: **PASS — RTO 16s** (backup → restore → migrate → grants → invariants → contracts → bootstrap → RLS → counts).

## Manual scratch restore (fallback)

Create an empty, isolated database that is never the production database:

```bash
RESTORE_DATABASE_URL='postgresql://.../ticketty_restore' \
  ./ops/restore-postgres.sh backups/ticketty-YYYYMMDDTHHMMSSZ.dump
```

Then, from `backend/`, deliberately apply migrations if restoring into a newer application release:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm test:db:refund-integrity
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm test:db:tenant-consistency
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm test:db:settlement-integrity
```

Record start/end time, backup timestamp, achieved RPO/RTO, row-count sanity checks, migration result, and operator approval. Run this drill at least quarterly.

## Safety

- The restore script refuses the current `DATABASE_URL` unless `ALLOW_IN_PLACE_RESTORE=yes` is explicitly set.
- Never use `--clean` against a live database.
- Pause writes and follow an incident-specific plan for any in-place disaster restore.
- Custom dumps do not include cluster roles/globals; provision the application role separately.
- A valid checksum is not proof of restorability; only a completed scratch restore is.

---

## النسخ الإنتاجي الليلي — `ops/backup-nightly.sh` (Go-Live Gate: P-1)

`backup-postgres.sh` أعلاه يبقى العملية الأساسية (atomic + sha256).
`backup-nightly.sh` **يلفّه** ويضيف طبقة الإنتاج كاملة:

| المتطلب | التنفيذ |
|---|---|
| جدولة تلقائية | `ticketty-backup.timer` عبر systemd؛ cron أدناه مرجع للتثبيت اليدوي فقط |
| نسخة خارج الخادم | `RCLONE_REMOTE` (B2/S3/Google/…) + **تحقق حجم طرف-للطرف بعد الرفع** |
| retention | `BACKUP_RETENTION_DAYS` — معطّل افتراضيًا (`0`) حتى اعتماد سياسة الحذف؛ عند قيمة موجبة يطبق على Daily محليًا وخارجيًا |
| فشل مرئي | exit 1 (يفشل cron التوثيقي) + سجل CSV + **إنذار HIGH عبر نفس قناة الـ watchdog** |
| سلامة النسخة | `pg_restore --list` فوريًا + `sha256sum --check` بعد الكتابة |
| فشل الـ cron نفسه | `backup-watchdog.sh` في جدول مستقل: لا نجاح خلال 25 ساعة → exit 1 + إنذار |
| الاستعادة | نفس `restore-postgres.sh` + التمرين الربعي `verify-restore.sh` |

### التثبيت اليدوي (cron على الخادم)

مسار `ticketty install` الرسمي يثبت `ticketty-backup.service` و`ticketty-backup.timer` و`ticketty-backup-watchdog.timer`، ويجري نسخة أولية قبل إعلان الجاهزية. استخدم cron التالي فقط عند التشغيل اليدوي خارج Installer:

```cron
30 2 * * * cd /srv/ticketty && set -a; . /etc/ticketty/backup.env; set +a; \
  ./ops/backup-nightly.sh >> /var/log/ticketty/backup.log 2>&1

# Independent heartbeat monitor. This must be a separate scheduler entry;
# otherwise a stopped backup cron could also stop its own monitor.
17 * * * * cd /srv/ticketty && set -a; . /etc/ticketty/backup.env; set +a; \
  ./ops/backup-watchdog.sh >> /var/log/ticketty/backup-watchdog.log 2>&1
```

`/etc/ticketty/backup.env` (وضع 600):
```
DATABASE_URL=postgresql://ticketty:…@postgres:5432/ticketty
RCLONE_REMOTE=b2:ticketty-backups        # إلزامي للإنتاج
BACKUP_WEBHOOK_URL=https://ntfy.sh/<topic>
```

(تكوين rclone مرة واحدة: `rclone config` — B2/S3/GDrive.)

### RPO / RTO — محسوبان من الجدول الفعلي (لا ادعاء)

- **RPO = 24 ساعة** (توقيت cron اليومي 02:30 — أسوأ خسارة بيانات
  مقبولة عند الكوارث = عمليات اليوم الواحد). لتقليله: أضف سطر cron
  ثانيًا (كل 6 ساعات → RPO 6 ساعات) — نفس السكربت idempotent.
- **RTO = 16 ثانية** (مُقاس في تمرين 2026-09-08: نسخة → استعادة →
  migrations → grants → invariants → bootstrap → RLS probe → counts).
  التمرين الربعي التالي يجب أن يستعمل نسخة من الوجهة الخارجية.

### الإثبات المُنفّذ (2026-09-09 — حيًا)

| السيناريو | النتيجة |
|---|---|
| تشغيل كامل بوجهة rclone | `BACKUP OK … uploaded` + تحقق الحجم طرف-للطرف |
| استعادة من **نسخة الوجهة الخارجية** إلى scratch | نجحت — 67 منظمة/73 حدثًا (قابلية الاسترداد خارجيًا مثبتة) |
| قاعدة مقطوعة + webhook | exit 1 + سجل FAILED + **إنذار HIGH وصل فعليًا** (تحقق ntfy poll) |
| بلا RCLONE_REMOTE | تحذير صريح + إنذار WARNING (لا نشر prod هكذا) |

### تحقق دورة hardening — 2026-09-12

- نُشرت نسخة من قاعدة اصطناعية نظيفة إلى Google Drive عبر `rclone`،
  ثم حُذفت النسخة المحلية، ونُزّلت النسخة الخارجية من جديد.
- نجح SHA-256 و`pg_restore --list`، ثم نجحت استعادة كاملة إلى قاعدة
  scratch مستقلة، و42 migration، و71 عبارة ACL، وكل SQL contracts،
  وRLS probe، وapplication bootstrap، ومقارنة أعداد الصفوف. RTO: 16s.
- حُذف مجلد التحقق الخارجي بعد الاختبار. لا يُعد ذلك دليلاً على تشغيل
  جدول production المستمر؛ يجب ضبط المسار الدائم وسياسة الاحتفاظ في الخادم.
- تحذير تشغيلي: remote الاختبار يستخدم Google Drive client id المشترك
  لـ rclone والمقرر إيقافه في 2026؛ أنشئ client id مملوكًا للشركة قبل pilot.
- الاستعادة على خادم فعلي مختلف ما زالت شرط نشر؛ الاختبار استخدم قاعدة
  مستقلة على نفس خادم PostgreSQL المحلي.

### التنفيذ التشغيلي النهائي — 2026-09-12

- الوجهة الرسمية الموصولة: `gdrive:Ticketty Production/01_Database_Backups/`.
- أُنشئت طبقات `Daily/Weekly/Monthly`، ونسخة baseline موجودة في الطبقات الثلاث.
- النسخ اليومي والـwatchdog مثبتان كـsystemd timers مستقلين على الخادم الحالي؛ تشغيل الخدمة اليدوي نجح ورفع نسخة خارجية.
- `backup-nightly.sh` يكتب مقاييس textfile لـnode-exporter: آخر نجاح ونتيجة آخر محاولة.
- حذف retention **معطل افتراضياً** (`BACKUP_RETENTION_DAYS=0`) حتى اعتماد السياسة؛ لا تُحذف نسخة صالحة تلقائياً قبل ذلك.
- النسخ الأسبوعي يعمل يوم الأحد عند ضبط `RCLONE_WEEKLY_REMOTE`، والشهري في اليوم الأول عند ضبط `RCLONE_MONTHLY_REMOTE`.
- الدليل التفصيلي للنسخة الحالية موجود في `database-backup-manifest-2026-09-12.txt` و`PRODUCTION_OPERATIONS_EVIDENCE_2026-09-12.md`.
- **Independent restore on second server = DEFERRED** لعدم وجود خادم ثانٍ. لا يُعاد تصنيفها VERIFIED قبل تنفيذ `SECOND_SERVER_RESTORE_CHECKLIST.md` على مضيف مستقل.
