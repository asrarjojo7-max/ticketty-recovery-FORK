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

# اشتقاق كل أجزاء الاتصال من DATABASE_URL مرة واحدة (node موثوق).
DB_PARTS="$(POSTGRES_URL_INPUT="$DATABASE_URL" node -e "
const u=new URL(process.env.POSTGRES_URL_INPUT);
console.log([u.username,u.password,u.hostname,u.port,u.pathname.slice(1)].join(' '));
")"
read -r DB_USER DB_PASS DB_HOST DB_PORT DB_NAME <<<"$DB_PARTS"
export PGPASSWORD="$DB_PASS"

# للـ psql: قاعدة الأصل (كل الأوامر الإدارية على المضيف نفسه).
psql_admin() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$@"; }

# URL scratch (نفس المضيف/المنفذ/المستخدم — قاعدة مختلفة).
SCRATCH_DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$SCRATCH_DB_NAME?schema=public"

log "0) inputs: host=$DB_HOST:$DB_PORT db=$DB_NAME scratch=$SCRATCH_DB_NAME"

# ── 1) Backup فعلي ───────────────────────────────────────────────────────────
log "1) backup (pg_dump custom + sha256)"
BACKUP_FILE=$(bash "$ops_dir/backup-postgres.sh" 2>/dev/null | grep -o '[^ ]*\.dump' | tail -1)
[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || fail "backup did not produce a file (checked $BACKUP_DIR)"
log "   backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ── 2) Scratch نظيفة + استعادة ───────────────────────────────────────────────
log "2) create scratch DB + restore"
if psql_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$SCRATCH_DB_NAME'" | grep -q 1; then
  fail "scratch DB '$SCRATCH_DB_NAME' already exists — refusing to overwrite (drop it manually first)"
fi
psql_admin -d postgres -c "CREATE DATABASE \"$SCRATCH_DB_NAME\"" >/dev/null
RESTORE_DATABASE_URL="$SCRATCH_DATABASE_URL" \
  ALLOW_IN_PLACE_RESTORE=no \
  bash "$ops_dir/restore-postgres.sh" "$BACKUP_FILE" >/dev/null || fail "restore failed"

# ── 3) migrations متوافقة ─────────────────────────────────────────────────────
log "3) prisma migrate status on restored DB"
MIG_OUT=$(DATABASE_URL="$SCRATCH_DATABASE_URL" npx prisma migrate status 2>&1) || { echo "$MIG_OUT" | tail -5; fail "migrate status errored"; }
echo "$MIG_OUT" | grep -q "up to date" || { echo "$MIG_OUT" | tail -5; fail "restored DB is NOT up to date with migrations"; }

# ── 3.5) إعادة تشغيل المنح من ملفات الهجرة (اكتشاف المرحلة 7) ───────────────
# السكربتات تستعمل pg_restore --no-acl (صحيح للنقل بين بيئات) لكن ذلك
# يُسقط كل المنح — القاعدة المستعادة تعمل بلا أدوار التطبيق إطلاقاً
# (أول من اكتشفه: فشل الفحص السلوكي permission denied على الجداول).
# الإصلاح: إعادة تشغيل كل عبارات GRANT من ملفات الهجرة نفسها (مصدر
# الحقيقة الوحيد للنشر) — نفس المنح التي تنشئها بيئة نظيفة migrate
# deploy. المنح ليست جزءاً من البنية المنطقية بل ACL على الخادم —
# استعادتها تحتاج خطوة صريحة بعد أي --no-acl restore.
# ملاحظة أساسية: الجمل قد تكون متعددة الأسطر (قوائم الجداول تستمر
# في أسطر تالية) وقد تكون REVOKE (سحب المنح الأمني من PUBLIC).
# المستخرِج أدناه يستخلص العبارات كاملة مهما بلغ طولها.
log "3.5) re-apply ALL GRANT/REVOKE from migration files (restored ACLs are empty by --no-acl)"
GRANTS_FILE="$(mktemp /tmp/verify-restore-grants.XXXXXX.sql)"
trap 'rm -f "$GRANTS_FILE"' EXIT
# تقسيم عبارات حقيقي: تتبع dollar-quoting (DO $$..$$) وسلاسل
# single-quoted حتى لا تُلتقط جمل GRANT وهمية داخل EXECUTE format()
# (منح عضوية الأدوار داخل DO blocks) ولا تُبتور بادئة
# "ALTER DEFAULT PRIVILEGES" قبل GRANT داخلها.
python3 - >> "$GRANTS_FILE" <<'PY'
import glob, re

def statements(sql):
    # strip line comments first (comment-safe detection)
    sql = re.sub(r'--[^\n]*', '', sql)
    out, buf, i, n = [], [], 0, len(sql)
    in_squote = in_dollar = False
    dollar_tag = ''
    while i < n:
        c = sql[i]
        if in_dollar:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag); i += len(dollar_tag)
                in_dollar = False; dollar_tag = ''
            else:
                buf.append(c); i += 1
        elif in_squote:
            buf.append(c)
            if c == "'":
                if i + 1 < n and sql[i+1] == "'":
                    buf.append("'"); i += 2; continue
                in_squote = False
            i += 1
        else:
            if c == '$':
                m = re.match(r'\$[^$]*\$', sql[i:])
                if m:
                    dollar_tag = m.group(0); in_dollar = True
                    buf.append(dollar_tag); i += len(dollar_tag); continue
                buf.append(c); i += 1
            elif c == "'":
                in_squote = True; buf.append(c); i += 1
            elif c == ';':
                out.append(''.join(buf).strip()); buf = []; i += 1
            else:
                buf.append(c); i += 1
    tail = ''.join(buf).strip()
    if tail:
        out.append(tail)
    return out

for f in sorted(glob.glob('prisma/migrations/*/migration.sql')):
    for stmt in statements(open(f, encoding='utf-8').read()):
        head = stmt.split(None, 1)[0].upper() if stmt.split() else ''
        if head in ('GRANT', 'REVOKE'):
            print(stmt + ';')
        elif head == 'ALTER' and re.match(r'(?is)ALTER\s+(DEFAULT\s+PRIVILEGES|LARGE\s+OBJECT)', stmt) \
                and re.search(r'(?i)\bGRANT\b|\bREVOKE\b', stmt):
            # ALTER DEFAULT PRIVILEGES ... GRANT/REVOKE — يُحفظ كاملاً
            print(stmt + ';')
        # DO $$ blocks وغيرها تُتجاهل — منح الأدوار المؤقتة للـ
        # migrating user داخلها غير لازمة للاستعادة (superuser أصلاً).
PY
GRANT_COUNT=$(grep -c "^GRANT\|^REVOKE\|^ALTER" "$GRANTS_FILE")
[[ "$GRANT_COUNT" -gt 0 ]] || fail "no GRANT/REVOKE statements found in migrations (unexpected — the schema grants roles its access)"
psql_admin -d "$SCRATCH_DB_NAME" -v ON_ERROR_STOP=1 -f "$GRANTS_FILE" >/dev/null 2>&1 \
  || fail "GRANT/REVOKE replay failed on restored DB"
log "   replayed $GRANT_COUNT grant statements"

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
RLS_ROWS=$(psql_admin -d "$SCRATCH_DB_NAME" -tA -c "SET ROLE ticketty_app" -c "SELECT count(*) FROM organizations" 2>/dev/null | tail -1)
[[ "$RLS_ROWS" == "0" ]] || fail "RLS probe failed: ticketty_app read $RLS_ROWS org rows without context (cross-tenant leak after restore!)"
log "   RLS: 0 rows visible (isolation alive)"

# ── 8) Data spot-check: عدد الصفوف متطابق ───────────────────────────────────
log "8) row-count spot-check (source vs restored)"
for table in organizations users trips bookings tickets payments accounting_events; do
  SRC_COUNT=$(psql_admin -d "$DB_NAME" -tAc "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ERR)
  RST_COUNT=$(psql_admin -d "$SCRATCH_DB_NAME" -tAc "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ERR)
  [[ "$SRC_COUNT" == "$RST_COUNT" ]] || fail "row mismatch on $table: source=$SRC_COUNT restored=$RST_COUNT"
  log "   $table: $SRC_COUNT ✓"
done

# ── 9) RTO + تنظيف ────────────────────────────────────────────────────────────
END_TS=$(date +%s)
RTO=$(( END_TS - START_TS ))
psql_admin -d postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB_NAME\"" >/dev/null
rm -f "$BACKUP_FILE" "$BACKUP_FILE.sha256"
log "9) cleanup: scratch dropped, temp backup removed"
echo ""
echo "VERIFY-RESTORE PASS — RTO: ${RTO}s (backup→restore→migrate→invariants→bootstrap→RLS→counts)"
