# Production Observability — Controlled Pilot

> تطبيق داخلي متكامل: application metrics + Prometheus + Alertmanager +
> PostgreSQL exporter + node-exporter + blackbox web probe. واجهات المراقبة خاصة وغير
> مكشوفة عبر BFF، وأسرار الإشعار تبقى في ملف خارج Git.

## المصدر: `GET /api/metrics`

- **تنسيق:** Prometheus text format (`text/plain; version=0.0.4`).
- **الحماية:** `@Public` — تُستهلك من داخل شبكة النشر فقط
  (compose لا يعرض منفذ الـ backend خارجيًا؛ الـ proxy العام يوجّه
  `/api/*` التجارية وليس `/api/metrics`). لا بيانات أعمال في
  المخرجات — عدادات ومقاييس فقط.
- **التنفيذ:** `backend/src/monitoring/` — سجل عالمي واحد
  (`MonitoringModule` هو `@Global()`) + توسعة الـ middleware
  القائم بلا استبدال + تعليقات في العاملين (محاسبة/اشتراكات).

## المقاييس

| الاسم | النوع | المصدر | المعنى |
|---|---|---|---|
| `ticketty_http_requests_total{method,route,status}` | counter | request-context middleware | إجمالي الطلبات — معدلات الأخطاء/النجاح لكل مسار مُطبَّع |
| `ticketty_http_request_duration_seconds{...}` | histogram | نفس الوسط | زمن الاستجابة (buckets 5ms→10s) |
| `ticketty_subscription_blocks_total{route}` | counter | الوسط (رمز 402) | إجابة "منظمة نشطة تُحجب عن البيع" — يربط Phase 1 بالمراقبة |
| `ticketty_accounting_queue_depth{status}` | gauge | العامل المحاسبي | عمق الطابور PENDING/FAILED/POSTED |
| `ticketty_accounting_events_processed_total` | counter | العامل | أحداث رُحّلت بنجاح |
| `ticketty_accounting_events_failed_total` | counter | العامل | أحداث أعمال فشلت معالجتها |
| `ticketty_accounting_worker_last_success_timestamp_seconds` | gauge | العامل | **إجابة "إذا توقف العامل نعرف تلقائيًا"** — staleness alert |
| `ticketty_accounting_worker_consecutive_failures` | gauge | العامل | دورات العامل التي رمت استثناء (عطل تشغيلي لا فشل أعمال) |
| `ticketty_subscription_sweep_last_run_timestamp_seconds` | gauge | سحّال الاشتراكات (Phase 1) | آخر تشغيل — يتوقع كل 6 ساعات |
| `ticketty_subscription_sweep_last_result` | gauge | السحّال | 1 = نجاح، 0 = خطأ |
| `ticketty_process_*` | default | prom-client | event loop lag، ذاكرة، GC |

**تطبيع المسارات:** الأجزاء الديناميكية (uuid / cuid2
`c…base36` / أرقام) تُقلص إلى `:id`/`:num` — cardinality محدودة
فلا تنفجر الليبلات مهما طال التشغيل.

## Prometheus + Alertmanager

ملفات النشر في `ops/monitoring/` ومربوطة بخدمات Compose الخاصة. Prometheus
يجمع التطبيق والويب وPostgreSQL وموارد المضيف، ويقيّم 26 قاعدة في أربع
مجموعات: التطبيق، قاعدة البيانات، النسخ الاحتياطي، والبنية التحتية.

تغطي القواعد: توقف التطبيق، 5xx، p95 latency (>750ms لمدة 10 دقائق مقابل
baseline مقاس 333ms)، إعادة التشغيل، ضغط الذاكرة/event-loop، توقف قاعدة
البيانات، استهلاك الاتصالات >80%، deadlocks، توقف العامل أو فشله وتراكم
الطابور، فشل/تقادم النسخ، CPU/ذاكرة/قرص/readonly filesystem، وإعادة تشغيل
الحاويات.

التحقق في 2026-09-12:

- `promtool check config`: نجاح، 25 قاعدة/4 مجموعات.
- `amtool check-config`: نجاح.
- خمسة targets حيّة أثناء الاختبار: التطبيق وPrometheus وPostgreSQL exporter
  وnode-exporter وblackbox-exporter.
- Alertmanager استقبل تنبيهًا مضبوطًا وأرسله إلى webhook اختباري محلي؛ هذا
  يثبت pipeline فقط.
- **قناة خارجية حقيقية: BLOCKED** — لا يوجد webhook/SMTP/Telegram معتمد أو
  secret على الخادم. `alertmanager.yml` يقرأ URL من ملف secret غير ملتزم
  (`/run/secrets/alertmanager_webhook_url`) ويفشل مغلقًا عند غيابه. لا يجوز
  وصف التنبيه الخارجي بأنه VERIFIED قبل إثبات وصوله إلى قناة مملوكة للشركة.

## Health — الجاهزية توسعة (لا استبدال)

`/api/health/readiness` يعلن حالة العامل صراحةً:
`disabled` أو `never_succeeded` أو `failing` أو `stale` أو `healthy`،
مع `secondsSinceLastSuccess=null` عندما لا يوجد نجاح سابق. العامل المفعّل
الذي لم ينجح أو أصبح متعطلاً يجعل الحالة العامة `degraded` بدل نجاح صامت،
مع إبقاء HTTP 200 كي لا يؤدي تعطل العامل إلى حلقة إعادة تشغيل توقف البيع.
`database: up` يبقى شرط الجاهزية الفعلي، وقواعد التنبيه/watchdog مسؤولة
عن تصعيد الحالة المتدهورة.

## الاختبار

- `backend/test/observability.e2e-spec.ts` — يثبت: public endpoint
  بتنسيق Prometheus، عدادات الطلبات ترتفع فعليًا بعد طلب حقيقي،
  تطبيع المسارات، histogram يحسب.
- عوامل الاختبار (worker specs) تتحقق من تعليق المقاييس في
  دورات العامل (نجاح/فشل).

---

## Watchdog الحي — `ops/worker-watchdog.sh` (Go-Live Gate: F-1)

قواعد التنبيه أعلاه (Prometheus) تبقى الطريق المرجعي عند نشر
منظومة كاملة. **للـ pilot** نشرنا الطبقة الحية الدنيا الموثوقة:
`cron` كل 5 دقائق يستعلم **قاعدة البيانات مباشرة** (لا نطلب من
العامل نفسه أن يقول إنه حي — لو ماتت الحاوية مات الـ metrics
معه، أما صفوف `accounting_events` فتبقى شاهدة) + `GET /api/metrics`
كطبقة ثانية لحيوية العامل.

### شروط الإنذار الأربعة

| المفتاح | الخطورة | الشرط | العتبة (قابلة للضبط) |
|---|---|---|---|
| `DB_DOWN` | CRITICAL | القاعدة لا تجيب (مسبار + إعادة محاولة بعد 2s لمنع الإنذار الشبكي اللحظي) | `WATCHDOG_DB_TIMEOUT` |
| `DB_QUERY_FAILED` | CRITICAL | القاعدة تجيب لكن استعلام الطابور يفشل | — |
| `WORKER_STALE` | HIGH | آخر دورة عامل ناجحة أقدم من العتبة — **أو `never`** (العامل لم يعمل إطلاقًا: خطأ نشر `ACCOUNTING_WORKER_ENABLED` يُكتشف فورًا) | 15 دقيقة |
| `BACKLOG` | HIGH | PENDING أقدم من العتبة (lock معلق/محاولات نضبت) | 10 دقائق |
| `FAILED_EVENTS` | HIGH | أحداث FAILED نهائية تحتاج تدخلًا بشريًا (requeue من واجهة المحاسبة) | ≥ 1 |

### الخصائص الإنتاجية

- **لا إرسال بلا حدود**: ملف حالة — نفس المفتاح لا يُنذر أكثر من
  مرة كل `WATCHDOG_REPEAT_EVERY_MINUTES` (افتراضي 60). تنبيه جديد
  لنفس المفتاح بعد فتح وإغلاق (حالة تغيرت ثم عادت) يُرسل طبيعيًا.
- **لا فقدان إنذار**: mark_sent يُستدعى **بعد** نجاح الإرسال فعليًا —
  فشل الـ webhook = إعادة في الدورة التالية.
- **السجلات**: `watchdog-cycles.csv` (كل دورة حتى السليمة — قابل
  للرسم بأي أداة) + `watchdog-alerts.jsonl` (كل إنذار JSON).
- **الإشعار**: أي HTTP endpoint عبر `WATCHDOG_WEBHOOK_URL`
  (اختبار معتمد: ntfy.sh — بلا حساب). فارغ = dry-run تسجيل فقط.

### التثبيت (cron على الخادم)

```cron
*/5 * * * * cd /srv/ticketty && \
  DATABASE_URL=... WATCHDOG_WEBHOOK_URL=https://ntfy.sh/<topic-private> \
  ./ops/worker-watchdog.sh >> /var/log/ticketty/watchdog.log 2>&1
```

(الـ topic الخاص يُحفظ في `/etc/ticketty/watchdog.env` بمنow 600
ويُقرأ بـ `set -a; . /etc/ticketty/watchdog.env; set +a` إن رُفض
وضع الأسرار في crontab.)

### الإثبات المُنفّذ (2026-09-09 — حيًا، ليس على الورق)

| السيناريو | النتيجة |
|---|---|
| 21 حدثًا فاشلًا حقيقيًا في القاعدة (مخلفات specs) | `ALERT-SENT FAILED_EVENTS (HIGH)` + **الرسالة استُلمت فعليًا عبر ntfy** (تحقق poll) |
| إعادة التشغيل فورًا | `alert-silenced` — **dedup يعمل** |
| قاعدة على منفذ مغلق | `ALERT-SENT DB_DOWN (CRITICAL)` — **أسوأ حالة تُكتشف** |
| بعد تنظيف الطابور، عامل dev معطل | `ALERT-SENT WORKER_STALE (HIGH)` — **اكتشاف خطأ نشر العامل** |
| طابور نظيف + عامل نظري حي | `HEALTHY` في سجل الدورات |
