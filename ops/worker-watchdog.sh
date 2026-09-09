#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# worker-watchdog.sh — F-1: إنذار حي وموثوق لحالة العامل المحاسبي والطابور
# (PILOT GO-LIVE GATE: إغلاق الشرط F-1 من FINAL_PRE_PILOT_AUDIT.md)
#
# التصميم (production-appropriate بلا منظومة observability ضخمة):
#   • المصدر الأول للحقيقة: قاعدة البيانات مباشرة (لا نطلب من العامل
#     نفسه أن يقول إنه حي — لو انهارت الحاوية كاملة، الـ metrics ماتت
#     معه، أما صفوف accounting_events فتبقى شاهدة على الحقيقة).
#   • المصدر الثاني: GET /api/metrics (للعامل الحي داخل العملية).
#   • الحالة (dedup): ملف حالة صغير يمنع إعادة الإرسال بلا حدود —
#     نفس الحالة الصحية لا تُنذر أكثر من مرة كل REPEAT_EVERY.
#   • الإشعار: ntfy.sh webhook (بلا حساب/بلا اعتماديات) — أو أي HTTP
#     endpoint عبر WATCHDOG_WEBHOOK_URL. فشل الإشعار نفسه يُسجَّل
#     ويُعاد في الدورة التالية (لا يُفقد الإنذار).
#   • السجل: CSV بسيط لكل دورة (وقت، حالة، عمق الطابور، staleness)
#     + JSON لكل إنذار مُرسل — قابل للفحص بأي أداة.
#
# شروط الإنذار (كلها قابلة للضبط بالبيئة):
#   W1  STALE  : آخر نجاح للعامل أقدم من STALE_MINUTES (من metrics)
#                أو العامل لا يجيب إطلاقاً (metrics unreachable).
#   W2  BACKLOG: PENDING أقدم من BACKLOG_MINUTES موجود (حدث عالق
#                فعلاً — ليس فقط "لا أحداث").
#   W3  FAILED : FAILED >= FAILED_THRESHOLD (أحداث أعمال فشلت
#                معالجتها بعد المحاولات الخمس).
#   W4  DBDOWN : فشل الوصول للقاعدة نفسها (أسوأ حالة — الإنذار
#                الأهم؛ نستخدم عتبة شبكية قصيرة كي لا نخلط انقطاع
#                الشبكة اللحظي بعطل قاعدة حقيقي).
#
# الاستخدام (cron كل 5 دقائق):
#   */5 * * * * cd /srv/ticketty && WATCHDOG_WEBHOOK_URL=... \
#     ./ops/worker-watchdog.sh >> /var/log/ticketty/watchdog.log 2>&1
#
# الاختبار (راجع test-workdog section في docs/operations/OBSERVABILITY.md):
#   WORKDOG_STATE_DIR=/tmp/wd-test DATABASE_URL=... ./ops/worker-watchdog.sh
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail
umask 077

# ── الإعدادات (كلها قابلة للتجاوز من البيئة) ────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
METRICS_URL="${METRICS_URL:-http://127.0.0.1:3001/api/metrics}"
WEBHOOK_URL="${WATCHDOG_WEBHOOK_URL:-}"           # فارغ = تسجيل فقط (dry-run)
STATE_DIR="${WATCHDOG_STATE_DIR:-/var/lib/ticketty/watchdog}"
LOG_DIR="${WATCHDOG_LOG_DIR:-/var/log/ticketty}"
STALE_MINUTES="${WATCHDOG_STALE_MINUTES:-15}"      # > 3× دورة العامل (5s→15m كافية)
BACKLOG_MINUTES="${WATCHDOG_BACKLOG_MINUTES:-10}"  # PENDING أقدم من هذا = عالق
FAILED_THRESHOLD="${WATCHDOG_FAILED_THRESHOLD:-1}" # أي FAILED يستحق نظرًا
DB_TIMEOUT="${WATCHDOG_DB_TIMEOUT:-8}"             # ثوانٍ — أقصر من دورة cron
METRICS_TIMEOUT="${WATCHDOG_METRICS_TIMEOUT:-5}"
REPEAT_EVERY_MINUTES="${WATCHDOG_REPEAT_EVERY_MINUTES:-60}" # إعادة تنبيه نفس الحالة
TOPIC="${WATCHDOG_TOPIC:-ticketty-pilot-alerts}"

mkdir -p "$STATE_DIR" "$LOG_DIR"
STATE_FILE="$STATE_DIR/alert-state.tsv"
CYCLE_LOG="$LOG_DIR/watchdog-cycles.csv"
ALERT_LOG="$LOG_DIR/watchdog-alerts.jsonl"
NOW_EPOCH="$(date -u +%s)"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── أدوات صغيرة ─────────────────────────────────────────────────────────────
# statement_timeout عبر PGOPTIONS (متغير جلسة يرسله libpq كـ SET).
# connect_timeout معامل اتصال client-side لا جلسة — يوضع في URL فقط
# (وضعه في PGOPTIONS يرفضه الخادم: unrecognized configuration parameter).
export PGOPTIONS="-c statement_timeout=$(( DB_TIMEOUT * 1000 ))"
DB_URL_BARE="${DATABASE_URL%%\?*}"
db_query() { psql "$DB_URL_BARE" -tA -F"|" -c "$1" 2>/dev/null || true; }
log_cycle() { # status,pending,failed,stale_pending_age_min,worker_last_success
  printf '%s,%s,%s,%s,%s,%s,%s\n' \
    "$NOW_ISO" "$1" "$2" "$3" "$4" "$5" "$6" >>"$CYCLE_LOG"
}
should_send() { # key → 0 أرسل، 1 اهدأ (نفس الحالة خلال نافذة الإعادة)
  local key="$1" last
  [ -f "$STATE_FILE" ] || return 0
  last="$(awk -F'\t' -v k="$key" '$1==k {print $2}' "$STATE_FILE" | tail -1)"
  [ -z "$last" ] && return 0
  [ $(( NOW_EPOCH - last )) -ge $(( REPEAT_EVERY_MINUTES * 60 )) ] && return 0
  return 1
}
mark_sent() { # key
  awk -F'\t' -v k="$1" -v t="$NOW_EPOCH" '$1!=k' "$STATE_FILE" 2>/dev/null >"$STATE_FILE.tmp" || true
  printf '%s\t%s\n' "$1" "$NOW_EPOCH" >>"$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"
}
notify() { # key severity title message
  local key="$1" severity="$2" title="$3" body="$4"
  printf '{"time":"%s","key":"%s","severity":"%s","title":"%s","body":"%s"}\n' \
    "$NOW_ISO" "$key" "$severity" "$title" "$body" >>"$ALERT_LOG"
  if [ -n "$WEBHOOK_URL" ]; then
    # --data-urlencoding: العنوان/النص عربي/رموز — ترميز آمن.
    # فشل الإرسال لا يوقف الدورة ولا يمحو السجل — يُعاد في الدورة
    # التالية لأن mark_sent لم يُستدعَ إلا بعد نجاح الإرسال فعلياً.
    curl -fsS --max-time 10 \
      -H "Title: [$severity] $title" \
      -H "Tags: warning" \
      --data-urlencode "$body" \
      "$WEBHOOK_URL" >/dev/null 2>&1
    return $?
  fi
  return 0
}
alert_once() { # key severity title body
  if should_send "$1"; then
    if notify "$1" "$2" "$3" "$4"; then
      mark_sent "$1"
      echo "[$NOW_ISO] ALERT-SENT $1 ($2) $3"
    else
      echo "[$NOW_ISO] ALERT-FAILED-TO-SEND $1 — سيُعاد في الدورة التالية"
    fi
  else
    echo "[$NOW_ISO] alert-silenced $1 (ضمن نافذة الإعادة)"
  fi
}

# ── W4: القاعدة نفسها (أسوأ حالة أولاً) ────────────────────────────────────
DB_PROBE="$(db_query "SELECT now()")"
if [ -z "$DB_PROBE" ]; then
  # فشل الوصول — نميّز: انقطاع cron الشبكي اللحظي عن العطل بفحص إضافي
  # قصير أقصى (إعادة محاولة واحدة بعد ثانيتين تمنع الإنذار العشوائي).
  sleep 2
  DB_PROBE="$(db_query "SELECT now()")"
  if [ -z "$DB_PROBE" ]; then
    log_cycle "DB_DOWN" "-" "-" "-" "-" "-"
    alert_once "DB_DOWN" CRITICAL "Ticketty DB غير متاحة" \
"قاعدة البيانات لا تستجيب من جهاز الـ watchdog ($HOSTNAME).
هذا أعلى مستوى إنذار: كل شيء (API + العامل المحاسبي + النسخ
الاحتياطي) متوقف. افحص حاوية postgres فوراً:
  docker compose ps postgres && docker compose logs --tail 50 postgres"
    exit 0 # الدورة انتهت (لا شيء آخر يمكن قياسه)
  fi
fi

# ── استعلام الحقيقة الواحد (كل الأرقام من القاعدة) ─────────────────────────
# pending_count / failed_count / oldest_pending_age_min
ROW="$(db_query "
  SELECT
    (SELECT count(*) FROM accounting_events WHERE status='PENDING'),
    (SELECT count(*) FROM accounting_events WHERE status='FAILED'),
    COALESCE((SELECT EXTRACT(EPOCH FROM (now()-MIN(\"createdAt\")))/60
      FROM accounting_events WHERE status='PENDING'), 0)::int
")"
if [ -z "$ROW" ]; then
  log_cycle "DB_QUERY_FAILED" "-" "-" "-" "-" "-"
  alert_once "DB_QUERY_FAILED" CRITICAL "استعلام الطابور فشل" \
"القاعدة تجيب (now() نجح) لكن استعلام accounting_events فشل —
قد يكون قفل/ترقيم/جدول تالف. افحص يدوياً:
  docker compose exec postgres psql -U ticketty -c 'SELECT status,count(*) FROM accounting_events GROUP BY 1'"
  exit 0
fi
PENDING="${ROW%%|*}"; REST="${ROW#*|}"
FAILED="${REST%%|*}"; OLDEST_PENDING_MIN="${REST#*|}"

# ── W1: العامل حي؟ (metrics — العامل نفسه يحدّث الطابع كل دورة) ──────────
METRICS_RAW="$(curl -fsS --max-time "$METRICS_TIMEOUT" "$METRICS_URL" 2>/dev/null || true)"
WORKER_LAST_SUCCESS="$(printf '%s' "$METRICS_RAW" \
  | awk '$1=="ticketty_accounting_worker_last_success_timestamp_seconds"{print $2}' | tail -1)"
WORKER_STALE_MIN="-"
if [ -z "$METRICS_RAW" ]; then
  WORKER_STALE_MIN="unreachable"
elif [ -z "$WORKER_LAST_SUCCESS" ] || [ "$WORKER_LAST_SUCCESS" = "0" ]; then
  # 0 = العامل لم يُقلع إطلاقاً منذ الإقلاع الأخير — العامل معطّل
  # أو ACCOUNTING_WORKER_ENABLED≠true في البيئة (خطأ نشر!).
  WORKER_STALE_MIN="never"
else
  WORKER_STALE_MIN=$(( ( NOW_EPOCH - ${WORKER_LAST_SUCCESS%.*} ) / 60 ))
fi

STATUS="HEALTHY"
[ "$WORKER_STALE_MIN" = "unreachable" ] || [ "$WORKER_STALE_MIN" = "never" ] \
  && STATUS="WORKER_STALE"
if [ "$WORKER_STALE_MIN" != "-" ] && [ "$WORKER_STALE_MIN" != "unreachable" ] \
   && [ "$WORKER_STALE_MIN" != "never" ] \
   && [ "$WORKER_STALE_MIN" -ge "$STALE_MINUTES" ]; then
  STATUS="WORKER_STALE"
fi
[ "$OLDEST_PENDING_MIN" -ge "$BACKLOG_MINUTES" ] && [ "$PENDING" -gt 0 ] \
  && STATUS="BACKLOG"
[ "$FAILED" -ge "$FAILED_THRESHOLD" ] && STATUS="FAILED_EVENTS"
log_cycle "$STATUS" "$PENDING" "$FAILED" "$OLDEST_PENDING_MIN" \
  "$WORKER_STALE_MIN" "$WORKER_LAST_SUCCESS"

# ── إطلاق الإنذارات (كل شرط بمفتاحه — لا إعادة إرسال بلا حدود) ─────────────
case "$STATUS" in
  WORKER_STALE)
    alert_once "WORKER_STALE" HIGH "العامل المحاسبي متوقف/لا يجيب" \
"آخر دورة ناجحة للعامل المحاسبي: ${WORKER_STALE_MIN} دقيقة مضت (العتبة: ${STALE_MINUTES}).
البيع مستمر لكن القيود المحاسبية تتوقف عن الترحيل — تتراكم PENDING.
الفحص الفوري:
  docker compose ps backend && docker compose logs --tail 100 backend | grep -i worker
  curl -s http://127.0.0.1:3001/api/metrics | grep accounting_worker"
    ;;
  BACKLOG)
    alert_once "BACKLOG" HIGH "طابور محاسبي عالق (${PENDING} PENDING)" \
"أقدم حدث PENDING عمره ${OLDEST_PENDING_MIN} دقيقة والعتبة ${BACKLOG_MINUTES}.
العامل قد يكون حياً لكنه لا يستهلك (lock معلق؟ attempts نضبت؟).
الفحص:
  SELECT id,status,attempts,\"lastError\" FROM accounting_events
    WHERE status='PENDING' ORDER BY \"createdAt\" LIMIT 5;"
    ;;
  FAILED_EVENTS)
    alert_once "FAILED_EVENTS" HIGH "${FAILED} أحداث محاسبية فشلت نهائياً" \
"توجد ${FAILED} أحداث بحالة FAILED (استنفدت المحاولات الخمس أو خطأ دائم).
هذه تحتاج تدخلاً بشرياً: راجع آخر خطأ ثم أعد الطابور من
واجهة المحاسبة (زر إعادة المحاولة) أو SQL موثق في runbook."
    ;;
  HEALTHY)
    echo "[$NOW_ISO] HEALTHY — queue: ${PENDING}P/${FAILED}F, worker staleness: ${WORKER_STALE_MIN}m"
    ;;
esac
exit 0
