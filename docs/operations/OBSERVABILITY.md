# Observability Baseline — Phase 6 (Pre-Launch Hardening)

> الحد الأدنى المفيد والموثوق قبل أول عميل — لا منظومة مراقبة ضخمة.
> dependency واحدة (prom-client 15.1.3)، بلا hosted service.

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

## قواعد التنبيه — `ops/alert-rules.yml`

جاهزة للربط بأي Prometheus/Alertmanager عند النشر (لا نشر
hosted الآن). الجوهر:

1. **AccountingWorkerStale** (critical): العامل لم ينجح منذ >15 دقيقة.
2. **AccountingWorkerFailing** (warning): فشل متكرر >10 دقائق.
3. **AccountingEventsFailing** (warning): أحداث أعمال فاشلة (مربع مالي).
4. **AccountingQueueBacklog** (warning): PENDING > 100 منذ 15 دقيقة.
5. **AccountingStalePending** (critical): أحداث معلقة + عامل متوقف.
6. **SubscriptionSweepStale/Erroring** (warning): سحّال الاشتراكات.
7. **SubscriptionBlocksSurge** (info): موجة 402 — فرصة تجارية.
8. **Backend5xxRate** (critical): أخطاء 5xx > 5%.
9. **DatabaseDown** (critical): scrape فشل.

## Health — الجاهزية توسعة (لا استبدال)

`/api/health/readiness` يضيف `stalePendingAccountingEvents`
(أحداث PENDING أقدم من 10 دقائق، أو -1 إن تعذر الاستعلام) —
**degraded وليس not-ready**: تذبذب العامل لا يقتل الحاوية،
لكن يظهر للمراقبة. `database: up` يبقى شرط الجاهزية الفعلي.

## الاختبار

- `backend/test/observability.e2e-spec.ts` — يثبت: public endpoint
  بتنسيق Prometheus، عدادات الطلبات ترتفع فعليًا بعد طلب حقيقي،
  تطبيع المسارات، histogram يحسب.
- عوامل الاختبار (worker specs) تتحقق من تعليق المقاييس في
  دورات العامل (نجاح/فشل).
