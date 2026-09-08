#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-restore.sh — Phase 7: Backup/Restore Drill (Engineering Contract §13)
#
# التمرين القابل للتكرار: يثبت أن النسخ الاحتياطي قابل للاستعادة فعلياً
# وليس فقط "السكربتات تعمل". خطواته (كلها تفشل فورًا عند أول خطأ):
#   1) Backup فعلي من DATABASE_URL (pg_dump custom format + SHA-256).
#   2) إنشاء scratch DB نظيفة والاستعادة إليها (منع الاستعادة فوق
#      الأصل مدمج في restore-postgres.sh).
#   3) prisma migrate status على المستعادة → up to date (توافق
#      الـ migrations مع الهجرة الأمامية).
#   4) مظلة invariants المرحلة 2 (database-invariants.sql) تمر على
#      المستعادة — RLS + القيود + الـ triggers + المنح موجودة
#      فعلياً بعد الاستعادة، ليس فقط في الأصل.
#   5) فحوص SQL contracts الفردية (refund/settlement/accounting/
#      tenant-consistency/trip-overlap).
#   6) Application bootstrap ضد المستعادة: readiness → 200 (nest
#      app يقلع ويجري ping).
#   7) RLS probe حي: بدور ticketty_app بلا سياق org → صفر صفوف من
#      organizations (العزل حي بعد الاستعادة).
#   8) Data spot-check: عدد صفوف جداول مختارة متطابق بين الأصل
#      والمستعادة.
#   9) تقرير RTO (زمن كامل التمرين) + تنظيف جذري (scratch DB +
#      ملف النسخة المؤقت المحلي).
#
# الاستخدام:
#   DATABASE_URL=postgresql://user:pass@host:port/ticketty?schema=public \
#   BACKUP_DIR=/tmp/drill ./ops/verify-restore.sh
#
# ملاحظات:
#   - يتطلب psql + pg_dump + pg_restore + node (Prisma CLI عبر npx).
#   - SCRATCH_DB (افتراضي ticketty_restore_drill) يجب ألا يوجد —
#     السكربت يرفض الكتابة فوق قاعدة موجودة (السلامة أولاً).
#   - النتيجة النهائية سطر واحد: VERIFY-RESTORE PASS/FAIL + RTO.
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

ops_dir="$(cd "$(dirname "$0")" && pwd)"
backend_dir="$(cd "$ops_dir/../backend" && pwd)"
cd "$backend_dir"

START_TS=$(date +%s)

fail() {
  echo "VERIFY-RESTORE FAIL: $1" >&2
  exit 1
}

log() { printf '[verify-restore %ss] %s\n' "$(( $(date +%s) - START_TS ))" "$1"; }

# ── 0) المدخلات ──────────────────────────────────────────────────────────────
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/../backups}"
SCRATCH_DB_NAME="${SCRATCH_DB_NAME:-ticketty_restore_drill}"
mkdir -p "$BACKUP_DIR"

postgres_url_node() {
  POSTGRES_URL_INPUT="$1" node -e "const u=new URL(process.env.POSTGRES_URL_INPUT);u.searchParams.delete('schema');process.stdout.write(u.toString())"
}

SRC_URL="$(postgres_url_node "$DATABASE_URL")"
# نفس المضيف/المنفذ/المستخدم لكن قاعدة scratch (فصل الوجهة عن المصدر).
SCRATCH_DATABASE_URL="postgresql://$(node -e "
const u=new URL(process.env.SRC_URL);u.pathname=process.env.SCRATCH_DB_NAME;
process.stdout.write(u.username+':'+u.password+'@'+u.host+':'+u.port+u.pathname);
" SRC_URL="$SRC_URL" SCRATCH_DB_NAME="$SCRATCH_DB_NAME" 2>/dev/null || echo "")"

# fallback أبسط وأكثر قابلية للقراءة (bash):
ADMIN_DB=postgres
psql_admin() { PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5433}" -U "${PGUSER:-$(node -e "const u=new URL(process.env.SRC_URL);process.stdout.write(u.username)" SRC_URL="$SRC_URL" 2>/dev/null || echo mojahed)}" "$@"; }

log "0) inputs: scratch=$SCRATCH_DB_NAME backup_dir=$BACKUP_DIR"

# ── 1) Backup فعلي ───────────────────────────────────────────────────────────
log "1) backup (pg_dump custom + sha256)"
BACKUP_FILE=$(bash "$ops_dir/backup-postgres.sh" 2>/dev/null | grep -o '[^ ]*\.dump' | tail -1)
[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || fail "backup did not produce a file (checked $BACKUP_DIR)"
log "   backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ── 2) Scratch نظيفة + استعادة ───────────────────────────────────────────────
log "2) create scratch DB + restore"
if psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname='$SCRATCH_DB_NAME'" | grep -q 1; then
  fail "scratch DB '$SCRATCH_DB_NAME' already exists — refusing to overwrite (drop it manually first)"
fi
psql_admin -d "$ADMIN_DB" -c "CREATE DATABASE \"$SCRATCH_DB_NAME\"" >/dev/null
RESTORE_DATABASE_URL="$SCRATCH_DATABASE_URL" \
  ALLOW_IN_PLACE_RESTORE=no \
  bash "$ops_dir/restore-postgres.sh" "$BACKUP_FILE" >/dev/null || fail "restore failed"

# ── 3) migrations متوافقة ─────────────────────────────────────────────────────
log "3) prisma migrate status on restored DB"
MIG_OUT=$(DATABASE_URL="$SCRATCH_DATABASE_URL" npx prisma migrate status 2>&1) || { echo "$MIG_OUT" | tail -5; fail "migrate status errored"; }
echo "$MIG_OUT" | grep -q "up to date" || { echo "$MIG_OUT" | tail -5; fail "restored DB is NOT up to date with migrations"; }

# ── 4) مظلة invariants المرحلة 2 ─────────────────────────────────────────────
log "4) database-invariants.sql (RLS/triggers/grants/CHECKs) on restored"
DATABASE_URL="$SCRATCH_DATABASE_URL" npx prisma db execute --schema prisma/schema.prisma \
  --file test/sql/database-invariants.sql >/dev/null 2>&1 || fail "Phase 2 umbrella invariants FAILED on restored DB (RLS/triggers/grants missing?)"

# ── 5) فحوص الفردية ────────────────────────────────────────────────────────────
for suite in refund-integrity settlement-integrity accounting-integrity tenant-consistency trip-overlap; do
  log "5) contract: $suite"
  DATABASE_URL="$SCRATCH_DATABASE_URL" npx prisma db execute --schema prisma/schema.prisma \
    --file "test/sql/$suite.sql" >/dev/null 2>&1 || fail "SQL contract '$suite' FAILED on restored DB"
done

# ── 6) Application bootstrap ضد المستعادة ────────────────────────────────────
log "6) app bootstrap + readiness against restored DB"
READINESS=$(DATABASE_URL="$SCRATCH_DATABASE_URL" node -e "
require('dotenv').config({ override: false });
(async () => {
  const { Test } = require('@nestjs/testing');
  const { AppModule } = require('./dist/app.module');
  const { configureApp } = require('./dist/bootstrap/configure-app');
  const app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  configureApp(app);
  await app.init();
  const { HealthService } = require('./dist/health/health.service');
  const svc = app.get(HealthService);
  const r = await svc.readiness();
  console.log(JSON.stringify(r));
  await app.close();
  process.exit(r.status === 'ready' ? 0 : 5);
})().catch(e => { console.error(e.message); process.exit(6); });
" 2>&1 | tail -1) || fail "app bootstrap/readiness against restored DB failed (got: $READINESS)"
echo "$READINESS" | grep -q '"status":"ready"' || fail "readiness payload not ready: $READINESS"
log "   readiness: $READINESS"

# ── 7) RLS probe حي (العزل بعد الاستعادة) ────────────────────────────────────
log "7) live RLS probe: ticketty_app w/o org context → 0 rows"
RLS_ROWS=$(psql_admin -d "$SCRATCH_DB_NAME" -tAc "SET ROLE ticketty_app; SELECT count(*) FROM organizations;" 2>/dev/null)
[[ "$RLS_ROWS" == "0" ]] || fail "RLS probe failed: ticketty_app read $RLS_ROWS org rows without context (cross-tenant leak after restore!)"
log "   RLS: 0 rows visible (isolation alive)"

# ── 8) Data spot-check: عدد الصفوف متطابق ───────────────────────────────────
log "8) row-count spot-check (source vs restored)"
for table in organizations users trips bookings tickets payments accounting_events; do
  SRC_COUNT=$(psql_admin -d "$(node -e "const u=new URL(process.env.SRC_URL);process.stdout.write(u.pathname.slice(1))" SRC_URL="$SRC_URL" 2>/dev/null || echo ticketty)" -tAc "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ERR)
  RST_COUNT=$(psql_admin -d "$SCRATCH_DB_NAME" -tAc "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ERR)
  [[ "$SRC_COUNT" == "$RST_COUNT" ]] || fail "row mismatch on $table: source=$SRC_COUNT restored=$RST_COUNT"
  log "   $table: $SRC_COUNT ✓"
done

# ── 9) RTO + تنظيف ────────────────────────────────────────────────────────────
END_TS=$(date +%s)
RTO=$(( END_TS - START_TS ))
psql_admin -d "$ADMIN_DB" -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB_NAME\"" >/dev/null
rm -f "$BACKUP_FILE" "$BACKUP_FILE.sha256"
log "9) cleanup: scratch dropped, temp backup removed"
echo ""
echo "VERIFY-RESTORE PASS — RTO: ${RTO}s (backup→restore→migrate→invariants→bootstrap→RLS→counts)"
