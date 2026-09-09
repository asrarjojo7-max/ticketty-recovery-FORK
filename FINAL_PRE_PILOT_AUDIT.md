# FINAL PRE-PILOT AUDIT — التدقيق المستقل النهائي قبل أول Pilot حقيقي

**التاريخ:** 2026-09-09
**المدقق:** Principal Engineer / CTO / Senior Security Engineer / QA Lead (أدوار مجمعة)
**الوضع:** PHASE 0 Freeze — **قراءة فقط. لا سطر كود تغيّر خلال هذا التدقيق** (الاستثناء الوحيد: هذا الملف).
**المنهج:** تتبّع فعلي لتدفق البيانات + استعلامات حية على القاعدة + **اختبارات اختراق حية** ضد الـ backend العامل (:4000) بحسابات حقيقية + مراجعة كل الـ migrations والـ triggers والـ RLS policies.

---

## منهجية التحقق (للشفافية)

| نوع الدليل | الحالة |
|---|---|
| قراءة كود مصدر متتبعة (services/guards/triggers/SQL functions) | ✅ تم |
| استعلامات SELECT مباشرة على القاعدة الحية (pg_proc, pg_policies, pg_constraint, pg_indexes) | ✅ تم |
| **اختبارات اختراق HTTP حية** (login حقيقي + محاولات IDOR/تصعيد/حقن) | ✅ تم — 10 هجمات |
| تشغيل اختبارات | ❌ لم يُشغّل ضمن هذا التدقيق (آخر بوابة كاملة خضراء موثقة في PILOT_READINESS_FINAL.md — نفس الـ HEAD) |
| Load/Performance measurement | **NOT MEASURED** — لم يُقس أي رقم أداء في هذا التدقيق |

---

# PHASE 1 — مراجعة الهندسة الكاملة

## البنية المعمارية (النتيجة: سليمة)

- **Backend NestJS 11**: 24 وحدة منظمة حسب النطاق. حماية عالمية عبر APP_GUARD chain: `Throttler(120/min) → JwtAuthGuard → PermissionsGuard → SubscriptionGuard → TenantRlsInterceptor` — الترتيب صحيح منطقيًا (المصادقة قبل الصلاحيات قبل الاشتراك قبل RLS).
- **Prisma + RLS ثنائي الطبقة**: كل طلب tenant يمر عبر `withTenantContext` (SET LOCAL ROLE ticketty_runtime + set_config app.organization_id) — **والخدمات أيضًا تضع organizationId في where صراحة** (tenantScope). طبقتا عزل مستقلتان (defense-in-depth حقيقي).
- **Web BFF**: توكن في cookie httpOnly+secure+lax، يُحوَّل لـ Authorization خادميًا. لا وصول مباشر من المتصفح للـ backend. فحص origin للكتابات (CSRF)، path-traversal مسدود بـ SAFE_PATH_SEGMENT، timeout 15s، أخطاء معزولة (503 عام).

## نقاط اكتُشفت (بلا تضخيم)

### A-1 [LOW] [Technical debt] — طوابير cleanup كسولة في dev فقط
booking-inv/pay-inv specs تترك أحداث محاسبية فاشلة بعد كل تشغيل كامل (المصدر يُحذف قبل المعالجة). لا يحدث في prod (worker مفعّل). موثق سابقًا.

### A-2 [INFO] [Product decision] — branchId نطاق اختياري لا إلزامي
`tenantScope` يضيف branchId فقط إذا كان للمستخدم فرع، والفحوصات (check-in، tickets) ترشّح بالفرع **إن وُجد**. مستخدم بلا branchId يرى كل المنظمة. هذا قرار منتج (مدير محطة بلا فرع معيّن = رؤية شاملة) وليس ثغرة — لكن يجب أن يُقرّ صراحةً.

### A-3 [INFO] — سباق تسجيل الصعود (P1-1) والاسترداد المتزامن محسومان ذرّيًا
`updateMany WHERE status='BOOKED'` شرطي — لا TOCTOU. (تدقيق P1-1 السابق أثبت هذا باختبار حي).

---

# PHASE 2 — Security Red-Team (اختبارات حية فعلية)

## الهجمات المنفذة والنتائج

| # | الهجوم | النتيجة | الدليل |
|---|---|---|---|
| H1 | Tenant A يقرأ booking لـ Tenant B | **404** ✅ | HTTP حي |
| H2 | Tenant A يقرأ ticket لـ Tenant B | **404** ✅ | HTTP حي |
| H3 | Tenant A يعيد طابور حدث محاسبي لـ Tenant B | **409 بلا تنفيذ** ✅ (requeue where organizationId) | HTTP حي |
| H4 | **مالك Tenant (بنجمة '\*') → بوابة المنصة (provision/listTenants)** | **403** ✅ | HTTP حي — النجمة تجتاز PermissionsGuard لكن `requirePlatformOperator` يصده بانتماء منظمة المشغّل |
| H5 | قائمة أحداث محاسبية عبر-منظمة | **بيانات منظمة الطالب فقط** ✅ | استجابة فعلًا: org واحد |
| H6 | قراءة ticket عبر QR لمنظمة أخرى | **404** ✅ | HTTP حي |
| H7 | Mass assignment (PATCH user بـ organizationId/roleId) | **400 whitelist rejection** ✅ | forbidNonWhitelisted |
| H8 | حقن عبر query params (status=' OR 1=1--) | **400** ✅ | class-validator enum rejection |
| H9 | توكن مُعدّل (tampered) | **401** ✅ | signature check |
| H10 | طلب بلا توكن | **401** ✅ | JwtAuthGuard |

## تحليل معمق للثغرات المحتملة

### S-1 [MEDIUM] [Security hardening gap] — نجمة '\*' تطابق platform.admin في PermissionsGuard
`hasPermission`: `perms.includes('*')` يرجع true لأي required بما فيه `platform.admin`. **العزل قائم فقط على الطبقة الثانية** (انتماء منظمة المشغّل داخل كل دالة منصة — 11/11 عملية محمية، مُتحقق). هذا يعمل لكنه يعني أن صحة عزل المنصة **تعتمد على استدعاء داخلي لا على الحارس**. أي endpoint منصة مستقبلي ينسى `requirePlatformOperator` = ثغرة فورية. **الويب أضيق**: `hasPermission` في web/src/lib/permissions.ts يستثني platform.admin من النجمة صراحة — الباكند لا يفعل. التوصية: نفس الاستثناء في الباكند (defense-in-depth). **ليست قابلة للاستغلال اليوم** (مُتحقق حيًا H4).

### S-2 [LOW] [Operational gap] — TRUST_PROXY_HOPS الافتراضي 0 خلف reverse proxy
compose الافتراضي 0. خلف Cloudflare tunnel (النشر الموثق) الـ IP الحقيقي يحتاج قيمة صحيحة وإلا **login throttle 5/min يُطبق على IP الـ tunnel** = أول 5 مستخدمين يعملون ثم الجميع يُحجب 60 ثانية. **يجب ضبطه عند النشر** (مُوثق في cloudflare-tunnel.md لكن القيمة غير محسوبة).

### S-3 [LOW] — /api/metrics عام بلا مصادقة
معزول شبكيًا (منفذ داخلي فقط، لا يوجّه عبر tunnel) + لا بيانات أعمال. مقبول للـ pilot بشرط بقاء القيد الشبكي.

### S-4 [INFO] — لا يوجد lockout حسابي (فقط throttle 5/min/IP)
5 محاولات/دقيقة/IP = 7200 محاولة/يوم لكلمة مرور واحدة. bcrypt cost 12 يجعل الهجوم مكلفًا. مقبول للـ pilot؛ يُفضل lockout لاحقًا.

### S-5 [مُتحقق سليم ✅] — لا raw SQL بمدخلات
كل `$executeRawUnsafe` في prisma.service.ts لثوابت أسماء أدوار فقط. لا interpolation في أي مسار طلب.

---

# PHASE 3 — Business Logic Abuse

### B-1 [مُتحقق سليم ✅] — بيع مزدوج للمقعد مستحيل
الحجز: `updateMany WHERE id AND status='AVAILABLE'` (أو HELD مملوك وغير منتهي) داخل transaction — claim ذرّي شرطي. مُثبت في الكود (bookings.service.ts:215-232) + اختبار «a BOOKED seat cannot be sold again».
**لكن انظر T-1 في PHASE 9**: السباق المتزامن الحي (طلاب HTTP متوازيان) غير مختبر مباشرة.

### B-2 [مُتحقق سليم ✅] — السعر من الخادم حصريًا
`total = Σ seat.price` من DB. الـ DTO لا يقبل أي amount. مدخلات العميل: مقاعد + مسافر + طريقة دفع فقط.

### B-3 [مُتحقق سليم ✅] — replay محكم
Idempotency-Key مطلوب (8-128)، مُخزّن لكل عملية مع hash للطلب، replay يعيد نفس النتيجة (booking/cancel/entries). replay بمفتاح مختلف = عملية جديدة (صحيح). **نطاق المفتاح: (organizationId, key)** — مُتحقق من القيد الفريد.

### B-4 [مُتحقق سليم ✅] — الاسترداد لا يتجاوز الدفع
`refundable = amount - refundedAmount` + **trigger DB** `enforce_refund_integrity` (FOR UPDATE + مجموع تراكمي + رفض) — محصّن حتى لو انهار التطبيق. اختبار «refundedAmount bounds survive even a raw UPDATE» يثبت حماية CHECK. الإلغاء المزدوج مستحيل (status must be CONFIRMED).

### B-5 [مُتحقق سليم ✅] — CASH-only مفروض من DTO
`@IsIn([CASH])` برسالة موثقة (قرار منتج: منع phantom payment). لا endpoint آخر ينشئ دفعات.

### B-6 [مُتحقق سليم ✅] — قيد غير متوازن مستحيل (طبقتان)
تطبيق (createEntry يتحقق) + **trigger DB** `enforce_journal_entry_posting` (Σdebit=Σcredit>0 عند POST). اختبار DB-bypass موجود.

### B-7 [مُتحقق سليم ✅] — قيد مزدوج لحدث واحد مستحيل
idempotency على `accounting-event-${event.id}` + `updateMany status: POSTED` شرطي. لو انهار المنتصف: الحدث يبقى PENDING (lockedAt جديد) → recovery بعد 5 دقائق → إعادة المحاولة تُعاد إلى نفس القيد عبر idempotent replay. **لا double-post ممكن**.

### B-8 [مُتحقق سليم ✅] — الفترة المغلقة
trigger يرفض POST في غير OPEN + entryDate خارج المدى مرفوض. إغلاق فترة بـ DRAFT داخلها مرفوض (409).

### B-9 [MEDIUM] [Product/Operational] — التقارير المالية تقرأ من payments وليس من journal POSTED
`reportsService.financial` يجمع من payment/expense/commission مباشرة. لو تأخر العامل المحاسبي (أو فشل) **التقرير المالي يظهر إيرادًا لا يزال غير مرحّل في الدفاتر**. ليس فسادًا (worker يمسك الفجوة لاحقًا) لكن مصدرَي "الحقيقة المالية" غير متطابقين لحظيًا. **مصالحة reconciliation موجودة** (تقارن الطرفين — وهذا يكشف الفجوة). قرار مطلوب: أيهما "التقرير المالي الرسمي"؟

### B-10 [مُتحقق سليم ✅] — الاشتراك fail-closed
بلا وسم = 'full' = محمي. EXPIRED → 402 على كل صناعة المال (بيع/دفع/مصروف/تسوية/ترحيل). القراءات وcancel/check-in معفاة موثقة الأسباب (خدمة ما بِيع). boundary strict < مُختبر.

### B-11 [ملاحظة] — attempts<5 ثم ماذا؟
بعد 5 محاولات فاشلة: الحدث FAILED نهائيًا حتى تدخل يدوي (requeue من UI الجديد — BLOCKER-2). لا alert مخصص "event crossed 3 attempts" (يوجد للـ worker ككل). مقبول؛ تحسين لاحق.

---

# PHASE 4 — API Surface Audit (94 مسارًا)

**الجرد الكامل** أُستخرج آليًا (الملف: كل مسار مع method/permission/subscription-mode). الحاصل:

- 94 مسارًا؛ كل المصادق عليها (غير @Public) تحمل @Permissions **عدا**: `auth/me`، `auth/change-password` (هوية ذاتية — سليم)، `health/readiness` (مفحوص أدناه).
- **fail-closed للمال**: كل المسارات المالية المعدلة (hold/release/create/settle/approve/post/requeue/entries) محمية افتراضيًا (NONE = 'full').
- **الاستثناءات الموثقة**: قراءات كلها + cancel + check-in + manifests lock — لكل منها reason صريح في الكود.

### API-1 [LOW] [Bug/Docs] — health/readiness بلا @Public لكن بلا @Permissions أيضًا
يعمل لأن JwtAuthGuard يحميه (يتطلب توكن). compose healthcheck يستعمل **liveness** (@Public) — سليم. readiness يتطلب مصادقة = أي probe خارجي بلا توكن سيفشل. غير مستعمل في compose (يستعمل liveness). **مقبول عمليًا** لكن غير متسق مع التوثيق المحتمل.

### API-2 [مُتحقق سليم ✅] — لا endpoint يعيد passwordHash
users list/create تستعمل `select` صريحًا بلا hash. BFF لا يمرر أي header غير مُدرج.

### API-3 [NOT VERIFIED ⚠] — Branch scoping شبه غائب في المرشحات العامة
قوائم (bookings findAll, tickets findAll, payments) ترشّح بالمنظمة + الوكيل (للـ AGENT) لكن **ليس بالفرع** حتى لو كان للمستخدم branchId — بينما reports وtickets واحدة-بواحدة ترشّح بالفرع. اتساق جزئي. [Product decision مطلوب]

---

# PHASE 5 — Database Integrity

## المُتحقق (كل صحيح ✅)

- **RLS على 33/35 جدول** بيانات tenants. الاستثناءان (subscriptions, system_events) بلا أي منح لأدوار التطبيق — وصول مالك القاعدة فقط + عبر دوال SD مقيدة.
- **FORCE RLS غير مستعمل** — غير ضروري هنا: التطبيق لا يعمل كمالك أبدًا (كل مسار عبر SET LOCAL ROLE). التنظيف اليدوي (مالك) هو الحالة الوحيدة التي تتجاوز RLS — مقصود وموثق.
- **Policies**: قرأت العينات — `organization_id = current_setting('app.organization_id')::uuid` مع INSERT يفرض التطابق، UPDATE/DELETE مرتبطة. اختبار runtime-rls يثبت: fail-closed بلا سياق، عبر-منظمة مرفوض على مستوى policy، الجداول الابنة معزولة.
- **22 دالة SECURITY DEFINER** كلها: search_path مثبت (pg_catalog, public)، REVOKE PUBLIC، منح لأدوار محددة. `test:db:invariants` يفرض هذا آليًا **في كل نشر** (migrate يعمل ثم invariants — فشلها يمنع إقلاع backend).
- **Trigger التوازن/الثبات/الاسترداد/المنفستو**: كل الأجسام قُرئت من القاعدة الحية — الشروط صحيحة كما وصفت في PHASE 3.
- **subscriptions_org_active_idx**: partial unique WHERE status IN (TRIALING, ACTIVE, PAST_DUE) — يمنع اشتراكين نشطين، ويسمح بتاريخ منتهي بجانب جديد.
- **exclusion trips** (باص + سائق): مدى tsrange مع WHERE للحالات النشطة فقط — CANCELLED لا تحجز. مدى مفتوح عند arrivalAt NULL (مصدر انسداد fixture الويب سابقًا — سلوك صحيح للمنتج).
- **_prisma_migrations**: 36 مسجلة، صفر غير منتهية، prisma migrate status = up to date.
- **التنظيف الذرّي** (إصلاح bd78b0c) مُثبت: الحارسات لا يمكن أن تبقى معطلة.

## المكتشفات

### D-1 [LOW] [Technical debt] — ~16 FK بلا فهرس مغطٍ
(trips.routeId, bookings.customerId/agentId, tickets.bookingId, commissions.bookingId, expenses.tripId/busId, refunds.paymentId, accounting_policies.*, journal_entries.journalId, users.roleId/branchId, buses.seatTemplateId, accounts.parentId). عند حجم pilot صغير: غير مؤثر. عند مئات آلاف الصفوف: full scans على joins. **SHOULD FIX بعد أول عميل** (فهارس فقط — لا تغيير منطق).

### D-2 [NOT MEASURED] — نمو audit_logs بلا TTL/أرشفة
3111 صف / 1.4MB اليوم. كل عملية حساسة تكتب صفًا. تقدير: 10k عملية/شهر لعميل واحد → ~120k صف/سنة — بلا مشكلة لسنوات pilot. **CAN WAIT** لكن القرار يجب أن يُوثق.

### D-3 [INFO] — users.email فريد عالميًا
منطقي لمنصة B2B واحدة (login بلا نطاق منظمة). لو أراد عميلان نفس البريد مستقبلًا = قرار منتج.

---

# PHASE 6 — Failure & Recovery

| السيناريو | التحليل | الحكم |
|---|---|---|
| DB unavailable | worker: catch → counter → إعادة دورة كل 5s. API: Prisma يرمي → filter → 500 عام بلا تسريب. | ✅ آمن |
| Worker crash بعد claim قبل post | lockedAt新鲜的 → 5 دقائق → reclaim → idempotent replay يستأنف | ✅ آمن |
| Worker crash بعد post قبل POSTED-mark | replay يجد النتيجة المخزنة → لا double-post | ✅ آمن |
| Double click (booking) | Idempotency-Key من العميل + unique (org,key) | ✅ آمن (مختبر) |
| Frontend retry | BFF timeout 15s → 503 عام؛ React Query يعيد — idempotency يمتص | ✅ آمن |
| Transaction rollback جزئي | $transaction Prisma ذرّي؛ الحارسات لا تُعطّل أبدًا (إصلاح bd78b0c) | ✅ آمن |
| Stale JWT بعد تخفيض دور | **الصلاحيات تُقرأ من DB كل طلب** — يسري فورًا | ✅ ممتاز |
| تغيير كلمة مرور | iat مقابل passwordChangedAt → إبطال كل الجلسات الأقدم | ✅ مختبر P1-3 |
| Restore فوق الأصل | restore script يرفض إلا ALLOW_IN_PLACE_RESTORE=yes صريح | ✅ |
| Migration فاشلة | compose: migrate container يفشل → backend لا يبدأ (service_completed_successfully) + invariants ضمن نفس السلسلة | ✅ تصميم نشر ممتاز |
| Deployment rollback | migrations هجرة أمامية فقط؛ لا down scripts — rollback كامل يتطلب restore من backup | ⚠ موثق كمحدودية |
| **فشل silent للـ worker في prod لو ACCOUNTING_WORKER_ENABLED=false** | alert rule AccountingWorkerStale موجود لكن **لا scraper مثبت** (القواعد "جاهزة للربط") | ⚠ **فجوة تشغيلية حقيقية** — انظر F-1 |

### F-1 [HIGH] [Operational gap] — لا monitoring حي مثبّت: أخطر نمط فشل صامت غير مكتشف
alert-rules.yml موجود ومدقق، لكن لا Prometheus/Alertmanager يعمل. السيناريو: العامل المحاسبي يتوقف (OOM/bug) → الأحداث تتراكم PENDING → **البيع يستمر طبيعيًا** (الفصل مقصود) → تكتشف المشكلة بعد أيام حين تطلب الشركة تقاريرها المالية أو تسويتها. الواجهة الجديدة (BLOCKER-2) تجعل الحالة **مرئية** لمن ينظر — لكن لا أحد ينظر بلا alert. **MUST FIX قبل الـ pilot بأي ش**: أبسط نسخة = cron كل ساعة يفحص `GET /metrics` (أو SQL مباشر) ويرسل إنذارًا (بريد/رسالة) عند PENDING>0 لمدة ساعة أو worker stale.

---

# PHASE 7 — Production Readiness

| العنصر | الحالة | الدليل |
|---|---|---|
| Secrets | ✅ كلها `:?required` في compose؛ placeholders مرفوضة في env.validation (prod path) | compose.yaml |
| JWT | ✅ 15m expiry، issuer/audience، لا صلاحيات في التوكِن | jwt.guard + compose |
| CORS | ✅ origin واحد من WEB_ORIGIN | configure-app.ts |
| CSP | ✅ مبني في next.config.ts | web/next.config.ts:9 |
| HTTPS | ✅ عبر Cloudflare tunnel — موثق خطوة بخطوة | docs/operations/cloudflare-tunnel.md |
| Proxy trust | ⚠ **TRUST_PROXY_HOPS يجب ضبطه للنشر الحقيقي** (S-2 أعلاه) | env validation موجودة |
| Rate limiting | ✅ عالمي 120/min + login/change-password 5/min | app.module.ts:58 |
| Backup | ✅ سكربت custom-format + sha256 + umask | ops/backup-postgres.sh |
| Restore drill | ✅ **مُنفّذ فعليًا مرتين** — RTO 16s، RLS probe حي بعد الاستعادة | restore-drill-2026-09-08.md |
| RPO | ⚠ **غير معرّف تشغيليًا** — السكربت يوجد؛ جدولة النسخ الاحتياطي نفسها (cron/تواتر/off-site) **غير مثبتة** | docs تحدد "quarterly drill" فقط |
| Worker supervision | ✅ restart: unless-stopped + healthchecks مدمجة | compose.yaml |
| Logs | ⚠ structured للـ 500 فقط؛ لا تجميع مركزي | api-exception.filter |
| Monitoring/alerts | ❌ **F-1 أعلاه** — القواعد موجودة، لا مجمّع | |
| Health checks | ✅ liveness عام + readiness (مصادقة — API-1) + compose يفحص | |
| Migration gating | ✅ نشر فاشل = لا إقلاع (invariants في السلسلة) | compose migrate service |
| Disk/growth | ⚠ NOT MEASURED (لا قياس) — audit_logs بلا TTL (D-2) | |

### P-1 [MEDIUM] [Operational gap] — جدولة النسخ الاحتياطي غير مثبتة
السكربت موجود والتمرين ناجح، لكن **لا cron/host timer يُنفّذه**. RPO الفعلي حاليًا = لانهاية (آخر نسخة يدوية). قبل أول عميل: جدولة يومية مؤكدة + نسخة خارج الجهاز (لو ضاع الـ volume ضاعت كل شيء).

---

# PHASE 8 — Pilot Journey (رحلة أول عميل، 19 خطوة)

| الخطوة | الحالة | ملاحظة |
|---|---|---|
| Organization (تزويد) | ✅ مُختبر e2e | ذرّي + محاسبة كاملة |
| Branch | ✅ | ضمن التزويد |
| Users/Roles | ✅ مُختبر | 7 أدوار مزروعة |
| Vehicle (قالب+باص) | ✅ | |
| Driver | ✅ | برخصة سارية |
| Route | ✅ | 3 محطات |
| Trip | ✅ | arrivalAt إلزامي |
| Seats | ✅ | من القالب |
| Booking | ✅ مُختبر سباقه المنطقي | انظر T-1 |
| CASH Sale | ✅ | CASH-only مفروض |
| Ticket | ✅ | BOOKED + QR |
| **Printing** | ✅ window.print مع print-area CSS | بلا طابعة حرارية/تنسيق 80mm — قرار تشغيلي للعميل (متصفح يكفي للبداية) |
| Check-in | ✅ | ذرّي شرطي |
| Cancellation | ✅ | ratio + تحرير مقعد |
| Refund | ✅ | trigger حماية |
| Accounting Event | ✅ | enqueue ضمن نفس transaction البيع |
| POSTED | ✅ | worker حقيقي في الاختبار |
| Reports | ✅ | انظر B-9 (مصدر البيانات) |
| **Reconciliation** | ✅ endpoint موجود | يقارن القيود مقابل subledgers — يكشف أي فجوة |

**الخطوة الوحيدة المحتاجة لتدخل يدوي**: لا شيء إلزامي. (فترة يناير بعد سنة — قرار منتج مؤجل).

---

# PHASE 9 — Test Quality Audit

## ما تُثبته الاختبارات فعلًا (قوي بشكل استثنائي)

- **runtime-rls**: يفحص RLS **كما يعمل فعليًا** (بلا سياق → صفر صفوف؛ عبر-منظمة → رفض على مستوى policy) — ليست اختبارات الظل.
- **DB-bypass tests**: payment/refund/accounting في suites invariants **تتجاوز التطبيق** (raw SQL/UPDATE) لتثبت أن القيد/الـ trigger نفسه يحمي — أعلى مستوى إثبات.
- **authorization-matrix**: 403 فعلية عبر HTTP لكل زوج (دور×مسار) + الحدود (OWNER للمشغّل يمر، OWNER لـ tenant لا).
- **Idempotent replay**: يثبت أن replay يعيد نفس النتيجة (ليس فقط "لا يتكرر").
- **التنظيف الذرّي** (bd78b0c): أُثبت تجريبيًا بالاتجاهين — الحارسة لا تبقى معطلة.

## فجوات الاختبار الحقيقية

### T-1 [MEDIUM] [Test gap] — لا اختبار سباق حي لبيع نفس المقعد (طلاب HTTP متوازيين)
الحماية (claim الشرطي) موجودة ومُختبرة **تسلسليًا** («sold seat cannot be sold again»)، لكن **السباق المتزامن الحي** (طلاب حقيقيان في نفس اللحظة لنفس المقعد) غير مختبر. Claim atomic يجعله نظريًا محصّنًا، لكن المطلوب إثباته — هذا أهم اختبار مالي مفقود. **MUST FIX قبل الـ pilot** (اختبار واحد بسيط بـ Promise.all + نتيجة واحدة 201 وواحدة 409).

### T-2 [LOW] — لا اختبار worker-crash-recovery حي (claim ثم قتل قبل post)
الفجوة بين claim وpost محمية بالتصميم (idempotency + 5-min lock) ومُغطاة منطقيًا في الاختبارات، لكن محاكاة القتل الحي (SIGKILL وسط المعالجة) غير موجودة. أثرها منخفض (recovery آلي).

### T-3 [LOW] — flakiness التشغيل المتتالي (runInBand) عبر login throttle
تشغيل 16 suites متتالية يصطدم بـ 5/min/IP (مُثبت هذه الجلسة: ثلاث suites ثقيلة تمر بعد نافذة نظيفة). CI يمر لأنه يبدأ من قاعدة نظيفة. **ليس false-positive في النتيجة** لكنه يخفي نتائج كاملة محليًا إذا رُكضت فورًا بعد بعضها.

### T-4 [INFO] — false-positive مبني بالتصميم واحد: هامش status 200/201
اختبارات تعمد `[200,201]` — سليم كي لا ترتبط بتفاصيل غير جوهرية، لكنه يفقد قليلًا من الصرامة.

---

# PHASE 10 — Performance & Scalability

**NOT MEASURED** — كل ما يلي مراجعة هندسية بلا قياس:

- **N+1**: booking create يعالج المقاعد حلقةً (updateMany لكل مقعد) — مقبول (2-4 مقاعد نموذجيًا). listEvents include journalEntry — واحد لكل صف (Prisma single join) — سليم.
- **Unbounded queries**: `listEvents take:200` محدود ✅. bookings findAll: pagination (PaginationQueryDto) ✅. **reports findMany بلا take على payments/expenses** ضمن نطاق تاريخ — لنطاق سنة كاملة لعميل كبير قد يعود بآلاف الصفوف للذاكرة — **SHOULD FIX لاحقًا** (aggregate بدل findMany).
- **SKIP LOCKED** في claim ✅ — العاملون المتعددون لا يتصادمون.
- **قفل الرحلة** lockTripTransaction (SELECT FOR UPDATE على الرحلة) عند الحجز — **تسلسل كل حجوزات نفس الرحلة** = bottleneck مقصود وصحيح (يمنع سباق المقاعد) لكنه يعني: رحلة ساخنة واحدة = حجوزاتها متسلسلة. عند pilot حجم (عشرات الحجوزات/دقيقة) لا مشكلة. **NOT MEASURED** الحد الأعلى.
- **Connection pool**: إعدادات Prisma الافتراضية (غير مخصصة في compose) — غير مضبوط لـ prod. CAN WAIT.
- **FK بلا فهارس**: D-1 أعلاه.

---

# PHASE 11 — Final Risk Register

| ID | Finding | Severity | Evidence | Pilot Impact | Recommendation |
|----|---------|----------|----------|--------------|----------------|
| F-1 | لا monitoring/alerts حية مثبتة — فشل worker صامت | **HIGH** | alert-rules.yml بلا scraper؛ compose بلا Prometheus | تراكم أحداث بلا اكتشاف أيامًا؛ تقارير/تسويات متأخرة تدار يدويًا | أبسط cron-hourly check → بريد/رسالة. أو تثبيت Prometheus + rules الموجودة |
| P-1 | جدولة النسخ الاحتياطي غير مثبتة (RPO غير محدد) | **MEDIUM** | سكربت موجود؛ لا cron؛ drill يدوي فقط | خسارة كل البيانات لو ضاع volume بلا نسخة حديثة | cron يومي + نسخة خارج الجهاز + توثيق RPO |
| T-1 | لا اختبار سباق متزامن لنفس المقعد | **MEDIUM** | booking suites كلها تسلسلية | ثقة أقل في أهم قاعدة مالية (الحماية المنطقية موجودة) | اختبار Promise.all واحد قبل الـ pilot |
| B-9 | التقارير المالية من payments لا من journal POSTED | **MEDIUM** | reports.service.ts:291+ | تقرير مالي لحظيًا غير مطابق للدفاتر عند تأخر worker | قرار منتج: أيهما المصدر الرسمي (أو تسمية واضحة "مبيعات" مقابل "دفاتر") |
| S-1 | نجمة '\*' تطابق platform.admin في PermissionsGuard الباكند | **MEDIUM** | permissions.guard.ts:15 + H4 (الصدّ يعمل بالطبقة الثانية فقط) | اليوم محصّن؛ مسار منصة مستقبلي بلا requirePlatformOperator = ثغرة | استثناء platform.admin من النجمة في الباكند (مثل الويب) — إصلاح صغير آمن |
| S-2 | TRUST_PROXY_HOPS=0 الافتراضي خلف tunnel | **LOW** | compose.yaml + cloudflare-tunnel.md | login throttle يجمع كل المستخدمين في IP واحد | ضبط القيمة عند النشر (مضمّن في runbook النشر) |
| D-1 | ~16 FK بلا فهارس | **LOW** | استعلام pg_indexes حي | لا شيء على حجم pilot؛ يظهر مع النمو | إضافة فهارس بعد أول عميل (migration فهارس فقط) |
| D-2 | audit_logs بلا TTL/أرشفة | **LOW** | 3111 صف اليوم | لا شيء لفترة pilot | قرار احتفاظ موثق لاحقًا |
| API-3 | فرع-الرشح غير متسق عبر القوائم | **LOW** | مقارنة الخدمات | منظورات غير متوقعة لمستخدم فرع (يفتح غرضًا لا خرقًا) | قرار منتج: فرض الفرع في القوائم أم لا |
| A-1 | مخلفات أحداث specs في قاعدة dev | **INFO** | موثق | بلا أثر على prod | drain في afterAll أو قاعدة اختبار منفصلة |
| T-3 | flakiness محلي runInBand (throttle) | **INFO** | مُثبت هذه الجلسة | إزعاج dev فقط | نافذة 65s أو تسلسل CI كما هو |
| S-4 | لا account lockout (throttle فقط) | **INFO** | 5/min/IP + bcrypt 12 | مقبول مع كلمات مرور قوية | lockout لاحقًا |
| API-1 | readiness يتطلب مصادقة (غير مستعمل في compose) | **INFO** | inventory | لا شيء عمليًا | توضيح توثيقي |
| Rollback | لا down migrations؛ rollback = restore | **INFO** | مراجعة migrations | نشر سيئ يتطلب استعادة نسخة | سياسة rollback مكتوبة قبل أول نشر prod |

## عناصر تحققت سليمة (لا تفتح شيئًا — مُدرجة لأنها الأهم)

العزل بين tenants (طبقتا RLS + tenantScope، H1-H6)، حصن المنصة ثلاثي الطبقات (H4)، JWT بلا state حساس + إبطال فوري (P1-3)، idempotency شامل، منع البيع المزدوج المنطقي، حماية الاسترداد على DB، توازن القيود على DB، ثبات POSTED، فشل الاشتراك المغلق، immutability التدقيق، التنظيف الذرّي، نشر migration-gated، restore drill مثبت 16s.

---

## MUST FIX BEFORE PILOT

1. **F-1** — تثبيت إنذار فعلي واحد على الأقل (عامل محاسبي حي + عمق طابور). أبسط حل: cron + بريد. بدونها أول عطل محاسبي = أيام صمت.
2. **P-1** — جدولة نسخ احتياطي مؤكدة يوميًا + نسخة خارج الجهاز. بدونها RPO=∞.
3. **S-2** — ضبط TRUST_PROXY_HOPS للنشر الفعلي (سطر env واحد، لكن إلزامي خلف tunnel).

## SHOULD FIX (لا تمنع)

- **T-1** اختبار السباق المتزامن (ساعة عمل).
- **S-1** استثناء platform.admin من النجمة في الباكند (سطور قليلة).
- **B-9** تسمية/قرار مصدر التقرير المالي.
- **API-3** قرار رشح الفرع في القوائم.

## CAN WAIT

- D-1 فهارس FK، D-2 TTL audit، connection pool tuning، reports aggregation بدل findMany، lockout، أرشفة، تسميات 200/201، T-2/T-3.

## DO NOT TOUCH (مستقرة — التغيير فيها أعلى خطر من بقائها)

RLS policies، أدوار SET LOCAL ROLE + السياق، claim الشرطي للمقاعد (bookings.service.ts:215)، enforce_refund_integrity، enforce_journal_entry_posting + الحارسات، Idempotency (key+hash)، SubscriptionGuard fail-closed، requirePlatformOperator (الطبقة الثانية)، النسق الذرّي للتنظيف، provisioning fn، migration gating في compose، استثناءات BFF (origin check + SAFE_PATH).

---

# PHASE 12 — القرار النهائي

## 🟡 READY WITH CONDITIONS

**النظام صحيح أمنيًا ومحاسبيًا بمعيار عالٍ** — كل هجماتي الحية صُدّت، وكل الثوابت المالية محمية على مستوى القاعدة لا التطبيق فقط، والاختبارات تثبت السلوك الحقيقي (بما فيها تجاوز التطبيق). العزل بين المنظمات وبين المنصة والعملاء مُثبت حيًا.

**الشروط الثلاثة** (MUST FIX أعلاه) كلها **تشغيلية لا برمجية** — لا تتطلب تعديل أي من المحميات:
1. إنذار حي واحد على الأقل للعامل المحاسبي (إلا ذلك: أول عطل صامت = خسارة ثقة العميل الأول في «التقارير لا تطابق»).
2. نسخ احتياطي مجدول + خارج الجهاز (إلا ذلك: حادث واحد يمحو كل شيء).
3. ضبط TRUST_PROXY_HOPS عند النشر (إلا ذلك: أول 5 دخول/دقيقة لكل الشركة مجتمعة).

**سبب عدم 🟢**: غياب الإنذار الحي (F-1) يجعل أخطر نمط فشل في المنتج — انقطاع الترحيل المحاسبي — غير مكتشف. هذا تحديدًا النمط الذي كلف 65 حدثًا عالقًا سابقًا؛ حل مشكلته البرمجية اكتمل، لكن اكتشاف تكراره ما زال يدويًا.

**سبب عدم 🔴**: لا يوجد أي findings CRITICAL/HIGH برمجي. الشروط الثلاثة تُنجز في ساعات لا أيام، وبعدها 🟢.

---

## الإجابة المباشرة على سؤال المالك

> **ما الذي قد ينكسر أو يسبب خسارة مالية أو تسريبًا أو فسادًا محاسبيًا أو تعطيلًا تشغيليًا؟**

- **تسريب بيانات:** لا مسار وجدته. العزل مزدوج الطبقة ومُختبر حيًا.
- **فساد محاسبي:** لا مسار وجدته. القيود محمية بـ DB triggers حتى لو انهار التطبيق؛ الاسترداد محدود بالدفع triggerًا؛ لا double-post ممكن.
- **خسارة مالية (منطق):** حمايات قوية؛ النقطة المفتوحة الوحيدة هي اختبار السباق الحي (T-1) — الحماية المنطقية موجودة.
- **تعطيل تشغيلي (الأرجح والوحيد فعليًا):** العامل المحاسبي يتوقف بصمت (F-1) أو ضياع volume بلا نسخة (P-1) أو خنق دخول خلف tunnel (S-2). الثلاثة تشغيلية وقابلة للإغلاق قبل الغد.
