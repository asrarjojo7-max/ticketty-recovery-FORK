# PILOT READINESS REPORT — Ticketty
**التاريخ:** 2026-09-08 · **قاعدة التقييم:** الأدلة الفعلية في هذا الـ repo (لا تقديرات)
**السياق:** اكتمل برنامج Pre-Launch Hardening (المراحل السبع، كلها ملتزَمة وبواباتها خضراء). هذا التقرير يقيّم الجاهزية لتشغيل أول شركة نقل حقيقية — لا أكثر.

---

## TL;DR — الحكم الصادق

**النظام آمن ومعزول ومُختبَر بعمق على مستوى المكونات، لكنه غير جاهز لتشغيل أول عميل قبل حلّ 3 blockers تشغيلية (كلها صغيرة ومحددة).** الفجوة ليست في الأمان أو المحاسبة — بل في "اليوم الأول للعميل": مسار الإعداد الافتتاحي للشركة الجديدة (فترة مالية + سياسات محاسبية + دليل حسابات) لا يوجد له أي مسار مُختبَر أو موثق، والأحداث المحاسبية تفشل بصمت خلفه.

| البُعد | الحالة |
|---|---|
| Core security (RLS/tenancy/guards/audit) | ✅ مكتمل ومُثبت — لا يُمسّ |
| المكونات الوظيفية (بيع/تذكرة/check-in/إلغاء/تسوية) | ✅ موجودة ومختبرة فرديًا |
| مسار أول عميل من البداية للنهاية (اليوم الأول) | ✗ **غير مثبت — فيه 3 blockers** |
| البنية التشغيلية (backup/monitoring/deploy) | ⚠️ موجودة على مستوى dev؛ خطوات إنتاج محددة موثقة أدناه |

---

## 1) ما هو جاهز للـ Pilot ✓

**الأمان والنواة (مُثبت بالاختبارات، لا بالكلام):**
- RLS على 33 جدولًا + probe حي (صفر صفوف بلا سياق) — يفحصه `test:db:invariants` على كل deploy
- عزل المستأجرين: 30 composite org FKs، 19 org-scoped uniques، مُثبت في e2e (runtime-rls, agent-isolation)
- الصلاحيات: مصفوفة runtime كاملة (67 اختبار HTTP حقيقي × كل الأدوار) + static spec يمنع انحراف الـ metadata
- الاشتراكات: state machine في DB + guard مركزي fail-closed + 402 + sweep worker
- المحاسبة مزدوجة القيد: posting_guard trigger (لا يُرحَّل غير المتوازن حتى لو تجاوز التطبيق — مُثبت بـ probe خام)، POSTED immutable، عكس مرآة كامل
- سلامة الدفع: CASH فقط (Option A)، استرداد تراكمي ≤ المبلغ بـ trigger، idempotency على الحجز والاسترداد
- Audit append-only (منع حتى التنظيف — اكتشفناه بالتجربة)
- Booking concurrency: claim atomic + HOLD + lazy cleanup — ومُختبر (2-client, 6-way check-in)

**الوظائف (كل خطوة في السيناريو لها API + UI موجودة):**
- إنشاء شركة عبر platform (موثق ومختبر في `platform-provisioning.e2e-spec.ts` وweb e2e)
- الفروع/المستخدمون/الأدوار (7 أدوار seeded)، الأسطول (buses/drivers/templates)، الخطوط والرحلات (مع فحص التراكب exclusion constraint)
- البيع من POS (المسار الذهبي مختبر في Playwright) + طباعة تذكرة (print CSS معزولة في globals.css)
- Check-in (بمصادقة بـ 6-way concurrency test)، الإلغاء/الاسترداد بالنسبة، كشف الركاب (manifests)
- التسوية per-agent (generate/settle)، التقارير (dashboard/sales/financial/occupancy)، reconciliation endpoint
- المراقبة: /metrics + 13 عدادًا + alert rules جاهزة الربط

**البنية:**
- Deploy: compose migrate-gated (النشر يفشل لو سقطت الـ invariants — TD-016 deploy-time)
- Backup/restore: سكربتات + drill آلي كامل **PASS بمقياس RTO ‏16s** (يتضمن إعادة منح الأمان بعد --no-acl)
- Env validation ترفض placeholders/الأسرار القصيرة

---

## 2) ما هو غير جاهز ✗ — Blockers (تُعرض ولا تُصلح؛ القرار لك)

### BLOCKER-1: الشركة الجديدة تبدأ بلا أي تهيئة محاسبية → كل بيع يُفشل قيده بصمت
- **المشكلة:** `POST /accounting/periods` هو الطريقة الوحيدة لإنشاء فترة مالية، و`POST /accounting/policies` لسياسة القيود، و`POST /accounting/accounts` للحسابات — **لا seed ولا provisioning flow يفعلها للشركة الجديدة**. اختبار الـ worker الحي في هذه الجولة أثبت النتيجة: 65 حدثًا PENDING/FAILED برسالة `لا توجد فترة مالية مفتوحة للحدث` — منها 21 في منظمة `ticketty` التجريبية الرئيسية نفسها.
- **السبب:** provisioning يبني org/branches/users فقط؛ المحاسبة تُترك "لمن يعرف" — لا أحد في يوم أول عميل.
- **الخطورة:** عالية على الأثر، منخفضة على التعقيد. **التأثير على Pilot:** أول بيع سينجح للعميل (تذكرة تُطبع!) بينما القيد المحاسبي يتراكم فاشلًا بصمت — فواتير/taswiya عند أول مراجعة مالية ستكون خاطئة، والاكتشاف متأخر.
- **الحل المقترح (أصغر ما يفي):** (a) عند provisioning: إنشاء دليل حسابات افتتاحي قياسي + فترة السنة الحالية OPEN + سياسات القيود الافتراضية، أو (b) على الأقل: seed command موثق للتهيئة الافتتاحية + checklist onboarding يفرضها.
- **الملفات المتأثرة:** `backend/src/platform/platform.service.ts` (أو provisioning extension)، `prisma/migrations/*` (لا تغيير schema — بيانات فقط)، ربما `platform.controller.ts`، seed files، `test/platform-provisioning.e2e-spec.ts` (اختبار جديد يثبت: شركة جديدة → بيع → القيد POSTED).
- **الاختبارات المطلوبة:** e2e: provisioning ثم بيع فوري ثم `GET /accounting/events` كله POSTED؛ unit: provisioning يخلق فترة OPEN تغطي اليوم.
- **Rollback:** البيانات افتتاحية فقط (rows) — حذفها يعيد الحالة؛ لا schema change، لا نواة. تحديد إضافي: هذا **لا يلمس** double-entry logic نفسها — يغذيها فقط بمدخلاتها المطلوبة.

### BLOCKER-2: الأحداث المحاسبية الفاشلة غير مرئية لأي شخص
- **المشكلة:** الـ backend يملك `GET /accounting/events` + requeue + process، لكن **الـ UI لا تعرضها في أي مكان** (لا صفحة، لا عمود، لا عدّاد). الفشل يظهر فقط في /metrics (إن ضُبط alerting) وpg_direct.
- **السبب:** Phase 6 غطت المراقبة الأمنية (counters/alert rules موثقة) لكن لم تُربط بواجهة تشغيلية لمالك/محاسب الشركة.
- **الخطورة:** متوسطة (مع BLOCKER-1 تصبح عالية). **التأثير على Pilot:** عميل يشترط المراجعة المحاسبية لن يعرف أن قيوده متوقفة حتى تتكدس أيامًا.
- **الحل المقترح:** جدول أحداث بسيط في صفحة `/accounting` (الفيلتر الافتراضي: PENDING/FAILED) مع زر requeue لـ FAILED (الـ endpoint موجود) — استهلاك API موجود، لا منطق جديد.
- **الملفات المتأثرة:** `web/src/features/accounting/{api.ts, accounting-feature.tsx}` (+ ربما types). Backend: صفر.
- **الاختبارات:** web e2e واحد: صفحة تعرض حدثًا FAILED مع زر requeue يعمل. (أيضًا يخدم مصفوفة الصلاحيات — accounting.read موجودة.)
- **Rollback:** تغيير UI صرف؛ حذف الجدول يعيد الوضع.

### BLOCKER-3: لا يوجد اختبار/برهان للسيناريو الكامل لأول عميل (الخيط الطولي)
- **المشكلة:** سيناريو Pilot الذي طلبته (شركة → فرع → مستخدمون → أسطول → خطوط → رحلات → بيع → طباعة → check-in → إلغاء → تسوية → تقارير → مراجعة) **موجود مكونًا فقط** — كل حلقة مختبرة وحدها، لكن الخيط المتصل غير مشغّل أبدًا في اختبار واحد. BLOCKER-1 يقطعه فعلًا في المنتصف.
- **السبب:** الاختبارات بنيت invariant-first (عزلة/حدود) كما فرضت الخطة — وهو الصحيح للأمان — لكن لم يُطلب/يُبن مسار الدخان الطولي.
- **الخطورة:** هذا هو تعريف "unproven for first client". **التأثير على Pilot:** أي نقطة التصاق بين المكونات (مثل: هل منظمة جديدة تستطيع فعلًا إكمال يوم كامل؟) بلا شبكة أمان.
- **الحل المقترح:** `pilot-journey.e2e-spec.ts` واحد يشغّل السيناريو كله عبر API الحقيقية (بعض الخطوات عبر web e2e الحالي) — يُبنى بعد حل BLOCKER-1 وإلا سيفشل في نقطة الفترة.
- **الملفات المتأثرة:** `backend/test/pilot-journey.e2e-spec.ts` (جديد)، ربما web e2e إضافي.
- **الاختبارات المطلوبة:** هو نفسه الاختبار.
- **Rollback:** ملف اختبار جديد — لا إنتاج.

**ملاحظة إجرائية (عقدك):** الثلاثة كلها خارج النواة المحمية. لكن بموجب تعليماتك (لا إصلاح قبل العرض) — **هذا العرض. لا شيء أُصلح بعد.**

---

## 3) موصى به لكنه ليس blocker

1. **Audit logs بلا مسار قراءة** (2444 صفًا، API/UI قراءة غير موجودة). للتحقيقات اقرأ من DB مباشرة. مناسب جدًا كـ follow-up.
2. **metrics/alertmanager غير مربوط فعليًا** — alert rules جاهزة الورق (`ops/alert-rules.yml`) لكن لا prometheus server يجمع /metrics. مقبول للـ pilot إذا التزمت بمراجعة يدوية + healthchecks، مؤجل بوعي.
3. **login throttle ‏5/min/IP** — خلف Cloudflare tunnel تأكد من ضبط `TRUST_PROXY_HOPS` الصحيح وإلا كل موظفي الفرع NAT واحدًا سيتشاركون الحصة. قرار نشر لا كود.
4. **جدول accounting worker واحد كل 5s** — كافٍ تمامًا لحجم أول عميل. لا تغيير.
5. **طباعة thermal/ESC-POS للطابعات الفيزيائية** — window.print فقط. يكفي للـ pilot إن كان المطبعة A4/حرارية-متصفح. اسأل العميل عن عتاده.
6. **RPO مُحدَّد بالجدولة لا بالسكربت** — backup-postgres.sh لا يوجد cron/timer مرفق (مقصود: بيئة الاستضافة تقرر). يُوثق في checklist أدناه.

---

## 4) Production Environment Checklist

- [ ] خادم Docker + Compose v2، DNS وجاهزية TLS (reverse proxy ينهي TLS — compose يكشف 127.0.0.1 فقط بالتصميم)
- [ ] `.env` من `.env.production.example` + `openssl rand -base64 48` لـ JWT_SECRET (validation ترفض أقل من 32/placeholder)
- [ ] إضافة `SUBSCRIPTION_SWEEP_ENABLED=true` + `SUBSCRIPTION_SWEEP_INTERVAL_MS` إلى `.env.production.example` (مفقودة فيه؛ compose default=true يغطي لكن المثال يجب أن يُظهرها — ملاحظة توثيق صغيرة)
- [ ] `TRUST_PROXY_HOPS` مطابق لعدد الـ hops الفعلي (tunnel/proxy أمام backend)
- [ ] `WEB_ORIGIN` = الـ origin القانوني (HTTPS) — تحقق CORS/cookies
- [ ] عدم تشغيل أي seed demo في الإنتاج (`docs/operations/deployment.md` يفرضها)
- [ ] `docker compose run --rm migrate` يمر (deploy-gate: الـ invariants تفشل النشر)
- [ ] فحوص الدخان الأربعة (backend/web × liveness/readiness) قبل توجيه المرور

## 5) Backup / Restore Checklist

- [ ] جدولة `ops/backup-postgres.sh` (يوميًا المبدئي) — cron/timer على بيئة الاستضافة + رفع خارجي مشفر (RPO = الجدولة)
- [ ] `SHA-256` مع كل نسخة + احتفاظ وفق سياسة الاحتفاظ
- [ ] **بعد كل استعادة `--no-acl`: إعادة تشغيل منح الأمان من migrations** (الـ drill أثبت أن الاستعادة المجردة تترك ticketty_app بلا أي صلاحية — السكربت يفعلها تلقائيًا؛ إن استُعملت السكربتات يدويًا فالخطوة إلزامية يدويًا)
- [ ] `ops/verify-restore.sh` يمر على **بيئة تمثل prod** (آخر نجاح كان dev-like؛ الخطة تشترط تكرار ربعي على prod-like)
- [ ] تسجيل RTO/RPO في `docs/operations/restore-drill-<date>.md` بعد كل drill

## 6) Monitoring Checklist

- [ ] قارئ /metrics (prometheus أو أي scraper) يشغّل دورة تجميع — حتى cron curl إلى ملف يكفي للبداية
- [ ] تفعيل `ops/alert-rules.yml` (worker stale > 3×interval، failed events > 0، 5xx rate، DB readiness) في أي alertmanager/بريد
- [ ] مراجعة يومية بشرية أثناء الـ pilot: readiness payload + عداد `accounting_events_failed_total` + عمق الطابور
- [ ] إقرار "من يستقبل الإنذار ومن يستجيب" (ownership) — نص غير تقني

## 7) Security Checklist

- [x] RLS مفعّل ومفحوص deploy-time (بوابة compose migrate)
- [x] أسرار غير-placeholder (env validation) — يبقى: JWT_SECRET قوي فعلًا في prod
- [x] Throttle (عام 120/min + login 5/min/IP) — تبقى مراجعة TRUST_PROXY_HOPS
- [ ] مراجعة أن كلمات أول مستخدم إنتاجي قوية وأن password rotation مفهوم (المسار موجود ومختبر)
- [ ] قصر الواجهة العامة على web فقط (المنصة /platform للمشغل فقط — مُثبت بالمصفوفة، تبقى مراجعة النشر: لا توجيه عام لـ backend)
- [x] فحوص S1–S4 خضراء (security regression: RLS bypass, privilege escalation, tenant tamper, protected metadata)
- [x] Audit append-only مُثبت (منع حتى محاولة الحذف)

## 8) Tenant Isolation Checklist

- [x] 33 جدولًا RLS + probe سلوكي صفر-صفوف (bلا سياق)
- [x] كل unique/FK مركبًا مع org (30 composite FKs — يفحصها invariants suite)
- [x] مصفوفة runtime 403 عبر كل الأدوار × عينات الـ endpoints
- [x] عزل الوكيل own-scope (agent-isolation e2e) + رفض بلا ملف وكيل
- [ ] **نقطة مراجعة بشرية أول عميل:** تشغيل السيناريو بشخصين من شركتين مختلفتين على prod للتأكد الحسي (اختبار تقني موجود؛ هذه مطابقة تشغيلية)

## 9) First-Client Onboarding Checklist (تشغيلي — بعد حل BLOCKER-1)

1. Platform: إنشاء الشركة + الفرع الرئيسي + المالك (كلمة مرور قوية → تدوير فوري)
2. التهيئة المحاسبية الافتتاحية (حل BLOCKER-1): دليل حسابات + فترة OPEN تغطي اليوم + سياسات قيود PAYMENT_RECEIVED/REFUND_COMPLETED/المصروفات
3. المستخدمون: SELLER(s) للفرع، FINANCE للمالية، وكل بحسب المصفوفة
4. الأسطول: قالب مقاعد → حافلة → سائقون
5. خط + محطات (بترتيب صحيح) → رحلة (بـ arrivalAt) → تحقق من مخطط المقاعد
6. **بيع تجريبي واحد والتوقف للتحقق:** التذكرة طبعت؟ `GET /accounting/events` كله POSTED؟ (هذا هو اختبار BLOCKER-1 الحي)
7. طباعة فعلية على عتاد العميل (أول مرة على جهازه الحقيقي)
8. Check-in تجريبي بماسح العميل
9. إلغاء/استرداد تجريبي واحد — التحقق من النسبة والعمولة المعكوسة
10. التسوية: generate → مراجعة → settle؛ التقارير الأربعة؛ المراجعة المحاسبية (reconciliation)
11. تسليم: روابط + بيانات الدخول + خط الطوارئ (أدناه) + جدولة النسخ الاحتياطي مؤكدة
12. أول يوم حقيقي: مراقبة live للأحداث المحاسبية + readiness

## 10) Rollback / Emergency Procedures

**موجود وموثق (deployment.md):**
- نشر: image/tag ثابت سابق؛ الهجرة forward-only افتراضيًا
- قبل أي rollback: حفظ السجلات + نسخة DB احتياطية
- الـ drills: استعادة إلى scratch إلزامية قبل أي restore في مكان (السكربت يرفض in-place افتراضيًا)

**طوارئ الـ pilot المحددة (إضافات مقترحة توثقها في runbook):**
- **قيود محاسبية متوقفة:** العَرَض = أحداث PENDING تتراكم. فوري: `GET /accounting/events` (أو metrics) → تشخيص الفترة (منسدلة/مغلقة؟) → إصلاح البيانات (لا schema) → requeue الفاشل (endpoint موجود). التذكرة/البيع لا يتوقفان أبدًا — الفصل مقصود حتى لا يمنع المحاسبيُّ البيع.
- **توقف worker كلي:** السعة تنضبط — أحداث تتراكم PENDING؛ البيع يستمر. الإصلاح: تشغيل الحاوية/العملية؛ المتراكم يُستنزف تلقائيًا (SKIP LOCKED).
- **خطأ نشر:** compose rollback للسابقة + `verify-restore.sh` على نسخة آخر نجاح إذا داهم شيء قاعدة البيانات.
- **تصعيد أمني:** سجل audit لا يُمسّ؛ أي تحقيق يقرأه مباشرة من DB (لا واجهة — موثق أعلاه).

## 11) Known Limitations (بلا تجميل)

1. **الدفع CASH فقط** (قرار Option A مقصود) — الرقمنة مؤجلة لسياسة تحقق مزودين (الخطة §5.3). أي وعد بيع رقمي للعميل = خارج النطاق الحالي.
2. **drill الاستعادة نجح على بيئة dev-like** — إلزام ربعي على prod-like مسجل لكن لم يُنفذ بعد (لا توجد بيئة prod بعد).
3. **audit بلا واجهة قراءة.**
4. **لا Ha/زائد:** single-host compose — مقصود للـ pilot، موثق.
5. **منطقة زمنية واحدة ضمنية** (خادم واحد) — إن تعددت فروع العميل بمدن مختلفة فلا مشكلة (نفس البلد)، لكن خارج ذلك غير مُختبَر.
6. **اللغة:** العربية أساسًا؛ أي واجهة إنجليزية غير موجودة.
7. **32 lint warnings مسبقة** (0 أخطاء) — ديون صغيرة مقبولة.
8. **الـ e2e بين التشغيلات حساس للاستهلاك المشترك لـ login throttle** (5/min/IP) — موثق داخل الـ specs؛ في CI المتوازي احتُرم بفجوات.

---

## 12) سيناريو Pilot الواقعي — ما يجب اختباره مع أول شركة حقيقية

**الخط، كما طلبته بالضبط، مع حالة كل خطوة اليوم:**

| # | الخطوة | API | UI | مُختبَر؟ | ملاحظة |
|---|---|---|---|---|---|
| 1 | إنشاء الشركة | ✅ | ✅ | ✅ (e2e+web e2e) | |
| 2 | الفرع | ✅ | ✅ | ✅ | provisioning يشمل primary branch |
| 3 | المستخدمون والصلاحيات | ✅ | ✅ | ✅ (مصفوفة runtime) | |
| 4 | المركبات (buses/templates) | ✅ | ✅ | ✅ | |
| 5 | السائقون | ✅ | ✅ | ✅ | |
| 6 | الخطوط | ✅ | ✅ (داخل trips) | ✅ | routes page ضمن trips-feature |
| 7 | الرحلات | ✅ | ✅ | ✅ (بتراكب مرفوض) | arrivalAt إلزامي |
| 8 | المقاعد | ✅ | ✅ | ✅ (مخطط/HOLD/claim) | |
| 9 | إنشاء حجز | ✅ | ✅ | ✅ | Idempotency-Key |
| 10 | بيع تذكرة | ✅ | ✅ POS | ✅ (مسار ذهبي playwright) | |
| 11 | طباعة التذكرة | — | ✅ window.print | ⚠️ جزئيًا | CSS print موجود؛ لم يُختبر على طابعة فيزيائية |
| 12 | الدفع CASH | ✅ | ✅ | ✅ (Option A مُثبت) | |
| 13 | Check-in | ✅ | ✅ boarding | ✅ (6-way) | |
| 14 | إلغاء/Refund | ✅ | ✅ | ✅ (نسبة+عمولة+trigger) | |
| 15 | **إغلاق اليوم** | **✗ لا يوجد مفهوم "إغلاق يوم"** | ✗ | ✗ | **التسوية per-agent فقط.** هل يحتاجه العميل كـ Z-report يومي؟ إن نعم = قرار تصميم جديد يُعرض عليك (ليس عيبًا — غياب مفهوم). تقارير sales/day متوفرة كبديل |
| 16 | التسوية | ✅ | ✅ | ✅ | generate→settle |
| 17 | التقارير | ✅ (4 تقارير) | ✅ | ✅ | dashboard/sales/financial/occupancy |
| 18 | **المراجعة المحاسبية** | ✅ | ⚠️ | ⚠️ | entries/journals/reconciliation موجودة؛ **الأحداث الفاشلة غير مرئية (BLOCKER-2)** والتهيئة الافتتاحية مفقودة (BLOCKER-1) |

**الفجوة الحاسمة:** الخطوات 1–14 قد تنجح كلها أمام العميل بينما 15–18 تفشل خلف الكواليس بصمت — هذا بالضبط ما يمنعه حل الثلاثة blockers أعلاه، والاختبار الطولي (BLOCKER-3) هو البرهان الموحد.

**اقتراح ترتيب العمل بعد موافقتك (لا كود قبلها):**
1. BLOCKER-1 (provisioning accounting bootstrap) — يشمل اختبار الشركة-الجديدة-تبيع-بقيد-مرحّل
2. BLOCKER-2 (events visibility UI — استهلاك API موجود)
3. BLOCKER-3 (pilot-journey e2e الطولي — سيمر فقط بعد 1)
4. تحديث `.env.production.example` بسطرَي sweep + توثيق drill على prod-like عند أول بيئة فعلية
5. قراءة الـ smoke كاملة ثم إعادة تقييم هذا التقرير

---

## 13) ما لم يُختبر / ما لا أدّعيه

- لم يُشغَّل النظام تحت حمل حقيقي متزامن (فقط اختبارات سباق مُصممة) — لا أرقام latency throughput أزعمها
- لم تُختبر طابعة فيزيائية فعلية (window.print فقط)
- لم يُختبر prod drill بعد (dev-like فقط حتى الآن)
- لم تُختبر المتصفحات غير Chromium (playwright chromium فقط)
- سلوك البيئة العربية RTL على شاشات صغيرة: غير مُختبَر

---

*"جاهز" في هذا التقرير تعني: مُثبت بأدلة في هذا الـ repo. "غير جاهز" تعني: ينقصه برهان أو يمنع تشغيلًا سليمًا لأول عميل. لا نسب مئوية صادرة من تقدير.*
