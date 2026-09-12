#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-nightly.sh — P-1: النسخ الاحتياطي الإنتاجي اليومي الموثوق
# (PILOT GO-LIVE GATE: إغلاق الشرط P-1 من FINAL_PRE_PILOT_AUDIT.md)
#
# يلفّ backup-postgres.sh الموجود (لا يستبدله — نفس atomic dump + sha256)
# ويضيف كل ما تنقصه عملية الإنتاج:
#
#   1. retention          — حذف تلقائي للنسخ الأقدم من RETENTION_DAYS
#                          محليًا وعلى الوجهة الخارجية (rclone).
#   2. off-site           — رفع فوري عبر rclone إلى أي وجهة سحابية
#                          (Backblaze B2/S3/Any S3/Google Drive/…).
#                          الوجهة خارج الخادم إلزامية: نسخة داخل نفس
#                          الـ VPS ليست نسخة استرداد كوارث.
#   3. failure visibility — النتيجة تُسجَّل (سجل حالة) + الفشل يُخطر
#                          عبر نفس قناة الإنذار (ntfy webhook) + exit
#                          code غير صفر يفشل cron التوثيقي (علم -q).
#   4. self-verify        — بعد كل نسخة: pg_restore --list يثبت أن
#                          الأرشيف قابل للاسترداد فعلاً (سلامة هيكلية)،
#                          والتحقق الكامل يبقى في verify-restore.sh
#                          (التمرين الربعي) — راجع docs/operations/
#                          backup-restore.md.
#   5. heartbeat           — يكتب آخر نجاح. يراقبه سكربت مستقل بجدول
#                          منفصل: backup-watchdog.sh. لا يمكن لعملية
#                          النسخ أن تكون مراقب نفسها إذا توقف cron.
#
# الجدولة (cron على الخادم — 02:30 بعد منتصف الليل وقت الخادم):
#   30 2 * * * cd /srv/ticketty && set -a; . /etc/ticketty/backup.env; \
#     set +a; ./ops/backup-nightly.sh >> /var/log/ticketty/backup.log 2>&1
#
# متغيرات البيئة:
#   DATABASE_URL        (إلزامي)
#   RCLONE_REMOTE       وجهة Daily خارجية (إلزامية)
#   RCLONE_WEEKLY_REMOTE    وجهة أسبوعية اختيارية (نسخة كل أحد)
#   RCLONE_MONTHLY_REMOTE   وجهة شهرية اختيارية (نسخة يوم 01)
#   BACKUP_RETENTION_DAYS   (افتراضي 0 = بلا حذف حتى اعتماد السياسة)
#   WEBHOOK_URL              قناة الإنذار (نفس الـ watchdog) — اختياري
#   BACKUP_DIR               (افتراضي /var/lib/ticketty/backups)
#   BACKUP_STATE_DIR         (افتراضي /var/lib/ticketty/backup-state)
#
# RPO المُحقق بهذا الجدول: 24 ساعة (نسخة كل يوم). راجع القسم
# "RPO/RTO" في docs/operations/backup-restore.md بعد تطبيق الجدول.
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail
umask 077

# ── الإعدادات ────────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
RCLONE_WEEKLY_REMOTE="${RCLONE_WEEKLY_REMOTE:-}"
RCLONE_MONTHLY_REMOTE="${RCLONE_MONTHLY_REMOTE:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/ticketty/backups}"
BACKUP_STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/ticketty/backup-state}"
BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-/var/log/ticketty}"
BACKUP_METRICS_DIR="${BACKUP_METRICS_DIR:-/var/lib/ticketty/metrics}"
# Zero disables deletion. Production retention must be explicitly approved
# before any valid local or off-site backup is removed.
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"
WEBHOOK_URL="${BACKUP_WEBHOOK_URL:-${WATCHDOG_WEBHOOK_URL:-}}"
NOW_EPOCH="$(date -u +%s)"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$BACKUP_DIR" "$BACKUP_STATE_DIR" "$BACKUP_LOG_DIR" "$BACKUP_METRICS_DIR"
STATE_OK="$BACKUP_STATE_DIR/last-success"      # يحوي timestamp آخر نجاح
RESULT_LOG="$BACKUP_LOG_DIR/backup-results.csv"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_result() { # outcome, file, size_mb, detail
  printf '%s,%s,%s,%s,%s\n' "$NOW_ISO" "$1" "$2" "$3" "$4" >>"$RESULT_LOG"
}
write_metrics() { # result (0/1), optional successful timestamp
  local result="$1" success_timestamp="${2:-}"
  local target="$BACKUP_METRICS_DIR/ticketty_backup.prom" tmp
  tmp="$(mktemp "$BACKUP_METRICS_DIR/.ticketty_backup.prom.XXXXXX")"
  if [[ -z "$success_timestamp" && -f "$target" ]]; then
    success_timestamp="$(awk '$1=="ticketty_backup_last_success_timestamp_seconds" {print $2}' "$target" | tail -1)"
  fi
  success_timestamp="${success_timestamp:-0}"
  {
    echo '# HELP ticketty_backup_last_success_timestamp_seconds Unix timestamp of the last verified off-site backup.'
    echo '# TYPE ticketty_backup_last_success_timestamp_seconds gauge'
    printf 'ticketty_backup_last_success_timestamp_seconds %s\n' "$success_timestamp"
    echo '# HELP ticketty_backup_last_result Result of the most recent backup attempt: 1 success, 0 failure.'
    echo '# TYPE ticketty_backup_last_result gauge'
    printf 'ticketty_backup_last_result %s\n' "$result"
  } >"$tmp"
  chmod 0644 "$tmp"
  mv "$tmp" "$target"
}
notify() { # severity title body
  if [ -n "$WEBHOOK_URL" ]; then
    curl -fsS --max-time 10 \
      -H "Title: [$1] $2" \
      -H "Tags: floppy_disk" \
      --data-urlencode "$3" \
      "$WEBHOOK_URL" >/dev/null 2>&1 || true   # الفشل لا يوقف السكربت
  fi
}
fail() { # detail → سجل + إنذار + exit 1 (يفشل cron التوثيقي)
  log_result "FAILED" "-" 0 "$1"
  write_metrics 0
  notify "HIGH" "فشل النسخ الاحتياطي الليلي" "$1"
  echo "[$NOW_ISO] BACKUP FAILED: $1" >&2
  exit 1
}

# ── 1) النسخة نفسها (نفس السكربت المُثبت والمُختبر) ─────────────────────────
echo "[$NOW_ISO] starting nightly backup → $BACKUP_DIR"
if ! BACKUP_DIR="$BACKUP_DIR" "$SCRIPT_DIR/backup-postgres.sh" \
      >"$BACKUP_LOG_DIR/backup-last-run.log" 2>&1; then
  tail -5 "$BACKUP_LOG_DIR/backup-last-run.log" >&2 || true
  fail "backup-postgres.sh فشل — راجع backup-last-run.log"
fi
DUMP_FILE="$(grep -oP 'Backup created: \K\S+' "$BACKUP_LOG_DIR/backup-last-run.log" || true)"
[ -n "$DUMP_FILE" ] || fail "لم يُعثر على مسار النسخة في مخرجات backup-postgres.sh"
[ -f "$DUMP_FILE" ] || fail "ملف النسخة غير موجود: $DUMP_FILE"
SIZE_MB="$(du -m "$DUMP_FILE" | cut -f1)"

# ── 2) self-verify هيكلي فوري (الأرشيف قابل للاسترداد؟) ─────────────────────
if ! pg_restore --list "$DUMP_FILE" >/dev/null 2>&1; then
  fail "الأرشيف غير قابل للاسترداد (pg_restore --list فشل): $DUMP_FILE"
fi
# تحقق المجموع الاختباري المكتوب مع النسخة (يمنع انزلاق نسخة تالفة)
if [ -f "$DUMP_FILE.sha256" ]; then
  ( cd "$(dirname "$DUMP_FILE")" && sha256sum --check "$(basename "$DUMP_FILE").sha256" >/dev/null 2>&1 ) \
    || fail "sha256 لا يطابق بعد النسخ: $DUMP_FILE"
fi

# ── 3) off-site عبر rclone (خارج الخادم — إلزامي للإنتاج) ──────────────────
OFFSITE="no-remote"
if [ -n "$RCLONE_REMOTE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    if rclone copy "$DUMP_FILE" "$RCLONE_REMOTE" --log-file "$BACKUP_LOG_DIR/rclone.log" \
        --log-level INFO 2>>"$BACKUP_LOG_DIR/rclone.log"; then
      # انسخ ملف المجموع معه (تحقق طرف-للطرف بعد التنزيل)
      rclone copy "$DUMP_FILE.sha256" "$RCLONE_REMOTE" 2>>"$BACKUP_LOG_DIR/rclone.log" \
        || fail "رفع المجموع الاختباري فشل (النسخة رُفعت بلا تحقق خارجي)"
      # تحقق طرف-للطرف: الحجم على الوجهة = الحجم المحلي بالبايت
      RSIZE="$(rclone lsl "$RCLONE_REMOTE" 2>/dev/null | awk -v f="$(basename "$DUMP_FILE")" '$4==f {print $1}' | tail -1)"
      LOCAL_SIZE="$(stat -c%s "$DUMP_FILE")"
      [ -n "$RSIZE" ] || fail "النسخة غير ظاهرة على الوجهة الخارجية (rclone lsl)"
      [ "$RSIZE" = "$LOCAL_SIZE" ] \
        || fail "حجم النسخة على الوجهة الخارجية لا يطابق المحلي (rclone lsl: $RSIZE مقابل $LOCAL_SIZE)"
      OFFSITE="uploaded"
    else
      fail "rclone فشل في رفع النسخة — راجع rclone.log (المحلية نجحت)"
    fi
  else
    fail "RCLONE_REMOTE مضبوط لكن rclone غير مثبت على الخادم"
  fi
else
  fail "RCLONE_REMOTE غير مضبوط — النسخة المحلية وحدها ليست نسخة استرداد كوارث"
fi

# نسخ طبقية: يوم الأحد إلى Weekly، واليوم الأول من الشهر إلى Monthly.
# copyto لا يحذف أي نسخة قائمة؛ retention يبقى معطلاً حتى اعتماد السياسة.
if [[ "$(date -u +%u)" == "7" && -n "$RCLONE_WEEKLY_REMOTE" ]]; then
  rclone copyto "$DUMP_FILE" "$RCLONE_WEEKLY_REMOTE/$(basename "$DUMP_FILE")" \
    || fail "رفع النسخة الأسبوعية فشل"
  rclone copyto "$DUMP_FILE.sha256" "$RCLONE_WEEKLY_REMOTE/$(basename "$DUMP_FILE").sha256" \
    || fail "رفع checksum النسخة الأسبوعية فشل"
fi
if [[ "$(date -u +%d)" == "01" && -n "$RCLONE_MONTHLY_REMOTE" ]]; then
  rclone copyto "$DUMP_FILE" "$RCLONE_MONTHLY_REMOTE/$(basename "$DUMP_FILE")" \
    || fail "رفع النسخة الشهرية فشل"
  rclone copyto "$DUMP_FILE.sha256" "$RCLONE_MONTHLY_REMOTE/$(basename "$DUMP_FILE").sha256" \
    || fail "رفع checksum النسخة الشهرية فشل"
fi

# ── 4) retention (محلي + خارجي) ─────────────────────────────────────────────
# محلي/خارجي: الحذف يعمل فقط بعد ضبط قيمة موجبة معتمدة صراحةً.
find "$BACKUP_DIR" -name '*.tmp' -mtime +1 -delete 2>/dev/null || true
if (( RETENTION_DAYS > 0 )); then
  find "$BACKUP_DIR" -name 'ticketty-*.dump' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
  find "$BACKUP_DIR" -name 'ticketty-*.dump.sha256' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
  CUTOFF_EPOCH=$(( NOW_EPOCH - RETENTION_DAYS * 86400 ))
  rclone lsl "$RCLONE_REMOTE" 2>/dev/null | while read -r _size _date _time fname; do
    [ -n "$fname" ] || continue
    case "$fname" in ticketty-*.dump|ticketty-*.dump.sha256) ;; *) continue ;; esac
    F_EPOCH="$(date -d "$_date $_time" +%s 2>/dev/null || echo 0)"
    [ "$F_EPOCH" -lt "$CUTOFF_EPOCH" ] && rclone delete "$RCLONE_REMOTE/$fname" 2>/dev/null || true
  done
fi

# ── 5) النجاح + سجل الحالة (للـ staleness watchdog) ─────────────────────────
printf '%s\n%s\n' "$NOW_EPOCH" "$DUMP_FILE" >"$STATE_OK"
write_metrics 1 "$NOW_EPOCH"
log_result "OK" "$(basename "$DUMP_FILE")" "$SIZE_MB" "$OFFSITE"
echo "[$NOW_ISO] BACKUP OK: $(basename "$DUMP_FILE") (${SIZE_MB}MB, $OFFSITE)"

# Freshness is checked by ops/backup-watchdog.sh from an independent schedule.
exit 0
