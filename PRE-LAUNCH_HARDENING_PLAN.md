# TICKETTY — PRE-LAUNCH HARDENING PLAN

**المرحلة:** الانتقال من Audit إلى Controlled Pre-Launch Hardening
**Baseline:** commit `073fb30` (التقرير المعتمد: Engineering 83 / Production 78 / SaaS 72 / Commercial 65)
**الطبيعة:** هذه وثيقة تصميم واعتماد — **لا تنفيذ قبل موافقة المالك.**

---

## 0. قواعد الالتزام (Rules of Engagement)

1. **لا Rewrite.** لا إعادة تصميم معمارية. كل الحلول أدنى-تغيير ممكن يحل الجذر.
2. **النواة المحمية — لا تُلمس إلا لعيب مثبت:**
   - RLS policies/grants/triggers (إضافات فقط، لا تعديل لما يعمل)
   - Booking core transaction (hold→claim→ticket→payment atomic)
   - Seat concurrency (advisory locks + conditional writes)
   - Accounting core (double-entry triggers, posting guards, period lock)
   - Audit immutability (trigger + grants)
   - Security boundaries (guard chain, BFF, RLS interceptor)
3. **كل مرحلة:** Gate كامل (lint/typecheck/unit/e2e/build/migrate + security regression suite) قبل الانتقال للتالية.
4. **إعادة التقييم بلا تضخيم:** الأرقام تتحرك فقط بتغير الحالة الفعلية، والتوقعات المكتوبة هنا labeled كـ *prediction*.
5. **تصحيح رسمي لتقرير Health Audit:** بند "controller-permissions.spec = 0 assertions" **غير دقيق** — الملف يحوي `it.each` (3 expects) يفحص **وجود** permission metadata على كل endpoint في 16 controller. الحقيقة الأدق: الاختبار يفحص التغطية الشكلية ولا يفحص **الفرض الفعلي** (لا 403 matrix إطلاقًا في أي مكان). البند 3 أدناه يعالج الجذر الحقيقي.

---

## PHASE 1 — SaaS SUBSCRIPTION ENFORCEMENT (P0 — بانتظار موافقتك)

### 1.1 Current Subscription Architecture [VERIFIED]

| المكون | الحالة | الدليل |
|---|---|---|
| جدول `subscriptions` | موجود، 1:1 مع org (`organizationId @unique`) | schema.prisma:960 |
| الحالات المخزنة | `status: String` — TRIALING / ACTIVE / PAST_DUE / EXPIRED / CANCELLED (PAST_DUE معرّفة في السطر التعليقي لكن **لا يضعها أحد أبدًا**) | schema.prisma:966 |
| دورة الحياة الحالية | `startedAt` / `currentPeriodEnd` / `cancelledAt` | schema |
| دوال SQL platform | `platform_set_subscription` (إنشاء/تجديد بسعر مفروض DB-side + إلغاء السابق)، `platform_renew_subscription`، `platform_expire_subscriptions` (TRIALING/ACTIVE منتهية الفترة → EXPIRED + system_events مع dedup) — كلها SECURITY DEFINER | migration 20260908010000 |
| Grants | `subscriptions` table: **ticketty_app لا يملك شيئًا** (فحص مباشر) — platform role فقط (INSERT/SELECT/UPDATE) | information_schema |
| الواجهة | Platform console: set/renew/expire يدوي + pricing pages | platform.controller |
| **Enforcement** | **صفر** — لا guard ولا interceptor ولا استعلام اشتراك في أي مسار runtime | grep شامل |
| Scheduler | **لا يوجد** — `expireSubscriptions()` endpoint يدوي فقط | platform.service:648 |
| Kill-switch موجود | `organizations.active=false` يمنع **اللوجين كليًا** (auth.service:23) — خيار نووي لا يميز "org موقوفة إداريًا" عن "tenant لم تدفع" | auth.service |

### 1.2 Gap Analysis

1. **لا طبقة enforcement بين "org نشطة" و"tenant لم تدفع":** منظمة TRIALING انتهت فترتها منذ شهر تعمل بكامل الصلاحيات بلا توقف.
2. **انتهاء يدوي فقط:** إن لم يضغط مشغّل المنصة زر Expire، لا شيء يتغير أبدًا.
3. **PAST_DUE حالة شبح:** معرفة في النموذج، لا تُنتجها أي عملية — لا يوجد مفهوم grace period.
4. **لا سياسة متدرجة:** المتاح حاليًا إما "كل شيء" أو "لوجين ممنوع" (org.active) — لا وسط يسمح للـ tenant برؤية بياناتها وتصديرها بعد انتهاء الدفع.
5. **كل التقييم في التقرير مبني على هذه الفجوة** (SaaS 72, Commercial 65).

### 1.3 Proposed State Machine

```
                    ┌──────────── setSubscription(TRIAL) ────────────┐
                    ▼                                                
TRIALING ──(periodEnd، بلا سماح)──────────────────────► EXPIRED
    │                                                        ▲
    └─(setSubscription MONTHLY/YEARLY)─► ACTIVE ─(periodEnd)─► PAST_DUE ──(grace 7d ينتهي)──┘
                    ACTIVE ◄──────(renew قبل/أثناء أي مرحلة)──────┤
                    ACTIVE ◄──────(re-activate من EXPIRED)────────┘
     أي حالة ──(إلغاء يدوي من المنصة)──► CANCELLED (نفس معاملة EXPIRED في الوصول)
```

- **TRIALING:** وصول كامل. 30 يومًا (موجود فعلًا). **بلا grace** — مجاني.
- **ACTIVE:** وصول كامل حتى `currentPeriodEnd`.
- **PAST_DUE:** (جديد — يفعّل الحالة الشبحية) انتهت الفترة المدفوعة → **grace 7 أيام** وصول كامل (constant `SUBSCRIPTION_GRACE_DAYS = 7`، قابل للنقل إلى env لاحقًا بلا migration).
- **EXPIRED:** **قراءة + إدارة فقط** (السياسة في 1.4). يعود ACTIVE فورًا بالتجديد — **بلا redeploy**.
- **CANCELLED:** معاملة EXPIRED (بيانات متاحة، عمليات ممنوعة) حتى إعادة تفعيل.

### 1.4 Enforcement Policy — سياسة الوصول المتدرجة

المبدأ: **انتهاء الاشتراك يوقف "صنع المال الجديد"، ولا يمس أبدًا تشغيل ما بِيع، ولا يسجن بيانات الـ tenant.**

| الفئة | أمثلة | TRIALING/ACTIVE/PAST_DUE | EXPIRED/CANCELLED |
|---|---|---|---|
| **العمليات التجارية (ممنوعة)** | hold / release / booking create / POS sale / payment create / expense approve / settlement generate / accounting post / subscription-relevant writes | ✅ | ❌ **402** |
| **خدمة ما بِيع (مسموحة)** | check-in / boarding / manifest / cancel / refund (خدمة عملاء للموجود) | ✅ | ✅ |
| **قراءة وتقارير (مسموحة)** | reports / financial / lists / search / exports | ✅ | ✅ |
| **إدارة tenant (مسموحة)** | login / users / roles / branches / settings / fleet read | ✅ | ✅ |
| **كتابات إدارية داخلية (مسموحة)** | user management / route/bus/trip CRUD (تجهيز مستقبلي بلا بيع) | ✅ | ✅ |
| **Platform scope** | كل /platform/** | نطاق منفصل أصلًا | نطاق منفصل أصلًا |

> قرار تصميمي يعرض للموافقة: هل نمنع أيضًا **كتابات التجهيز** (route/bus/trip CRUD) عند EXPIRED؟ التوصية: **لا** — الـ tenant تجهّز جداولها وهي تسوّي دفعها، والمنع الوحيد المؤثر تجاريًا هو **بيع/تقيد/تحصيل جديد**. الحد الفاصل = "ما يخلق التزامًا ماليًا جديدًا للعميل النهائي".

**HTTP semantics:** `402 Payment Required` مع error taxonomy موحد `SUBSCRIPTION_REQUIRED` + رسالة عربية واضحة — مميز عن 403 (صلاحيات) وقابل للمراقبة كـ metric منفصل (يربط بـ Phase 6).

### 1.5 Enforcement Points (Server-side فقط)

**النقطة الوحيدة المركزية — Guard جديد في السلسلة العالمية:**

```
ThrottlerGuard → JwtAuthGuard → PermissionsGuard → SubscriptionGuard (جديد) → TenantRlsInterceptor
```

1. **مصدر الحقيقة = DB re-read الموجود أصلًا:** `findAuthUserById` (الذي يقرأ user/org/permissions من DB كل طلب — عبر `auth_user_by_id`) **يُوسَّع** ليعيد `subscription_status, subscription_period_end` بـ JOIN واحد. لا قراءة إضافية، لا claim قابل للتزوير، نفس نمط السلطة المعمول به للصلاحيات.
2. **تصنيف المسارات — fail-closed بالتصميم:** decorator جديد `@SubscriptionPolicy({ mode: 'full' | 'exempt' })`:
   - **الافتراضي (بلا annotation) = `full`** ← أي endpoint كتابة تجاري جديد مستقبلًا **محمي تلقائيًا**. هذا هو الـ default الصحيح أمنيًا — العكس (افتراضي مفتوح) هو كيف تتسرب الثغرات.
   - `exempt` فقط لقائمة صريحة مراجَعة: auth/*, health/*, reports/*, administration/*, settings, fleet CRUD, trips CRUD, routes CRUD, customers?, tickets.checkin, manifests, bookings.cancel, payments.refund, platform/** (platform خارج نطاق tenant أصلًا عبر @PlatformScope).
   - القائمة نفسها توثَّق في جدول قابل للفحص داخل guard metadata + اختبار يفحص أن كل `exempt` مُعلَّل بسبب (comment test).
3. **البوابات المناعية ضد الـ bypass:**
   - الـ guard يقرأ من الـ DB في نفس الطلب — لا token ولا header ولا client state.
   - Platform scope (`@PlatformScope`) يتجاوز الـ tenant context أصلًا — مشغّل المنصة يدير اشتراك org منتهية ويجدّدها (وهذا يجعل "التجديد يُفعّل فورًا" ممكنًا).
   - **RLS هو الدرع الثاني دائمًا** — الـ guard لا يضعفه بل يضيف فوقه.
   - Defense-in-depth مستقبلي (موثق لا منفذ الآن): write-block DB-level للـ tenants المنتهية. ليس ضروريًا الآن لأن الـ guard مركزي ومختبر.

### 1.6 Scheduler Design

- **`SubscriptionSweepWorker`** بنفس نمط `AccountingEventWorker` القائم (OnModuleInit/setInterval/unref — النمط المُجرّب في هذا الكودبيس): تشغيل عند الإقلاع + كل 6 ساعات (`SUBSCRIPTION_SWEEP_INTERVAL_MS`، default 21600000).
- **تعديل SQL fn واحدة:** `platform_expire_subscriptions()` تُرقّى (drop+create في migration جديدة) لتطبيق الحالة الجديدة: `ACTIVE منتهية → PAST_DUE`، `PAST_DUE منتهية الـ grace (7d) → EXPIRED`، `TRIALING منتهية → EXPIRED`. مع system_events لكل انتقال (بعضها موجود) — PAST_DUE transition يحصل على نوع حدث خاص لكي يستطيع مشغّل المنصة ملاحقة الدفع.
- **الدور:** fn SECURITY DEFINER جديدة `expire_subscriptions_sweep()` بلا أي مدخلات (قاعدة فقط: `currentPeriodEnd < now` + grace)، idempotent ببنيتها، GRANT لـ `ticketty_app` فقط — **آمنة للمنح لأنها بلا معاملات قابلة للتلاعب وقاعدة صرفة لا تقبل توجيهًا**. (البديل — تمرير دور platform من عملية غير HTTP — أعقد بلا فائدة أمنية.)
- **تفاعل مع worker المحاسبي:** لا تفاعل — الكيانات مستقلة تمامًا.

### 1.7 Migration Impact

| التغيير | نوعه | خطر |
|---|---|---|
| `auth_user_by_id` — إضافة عمودي subscription (DROP+CREATE بسبب تغير OUT params، نفس الدورة الناجحة في P1-3) | SQL migration | منخفض — نمط مُجرّب |
| ترقية `platform_expire_subscriptions` (PAST_DUE + grace) | SQL migration | منخفض — دالة مستقلة |
| `expire_subscriptions_sweep` جديدة + GRANT | SQL migration | منخفض |
| Prisma schema: **لا تغيير** (status String فعلًا — لا enum migration، PAST_DUE ضمن القيم المعرفة تعليقيًا؛ نحدّث التعليق فقط) | schema comment | صفر |
| **بلا جداول جديدة، بلا أعمدة جديدة على tables، بلا backfill** (الـ sweep الأولى تصلح أي TRIALING منتهية تاريخيًا تلقائيًا — سلوك مطلوب) | — | صفر |
| guard/worker/decorator | app code | منخفض |

### 1.8 Security Implications

- **مصدر سلطة واحد متسق:** subscription status من نفس قراءة DB التي تفرض الصلاحيات — لا مصدر ثانٍ.
- **fail-closed default:** endpoint كتابة جديد غير معلَّن = محمي. (اختبار يفشل إذا عاد endpoint كتابة بلا annotation).
- **الـ exempt list هو سطح الاهتمام الأمني:** كل إدخال فيها يمر بمراجعة، ولكل واحد سبب موثق. اختبار invariant: أي endpoint في exempt list **يجب** ألا يكون من فئة "إنشاء التزام مالي جديد".
- **لا توسيع grants:** app role لا يقرأ `subscriptions` جدولًا (يبقى صفر منح) — فقط عبر الدالة المعرّفة الجديدة بلا معاملات.
- **402 responses لا تكشف معلومات** — رسالة عامة عربية واحدة، وrequestId كالمعتاد.

### 1.9 Test Plan

**Unit (guard + policy):**
- matrix: status × route-mode → 402/allow (كل الحالات الخمس).
- fail-closed: controller بلا annotation → محمي.
- exempt endpoint مع annotation سليم → يمر.
- تمرير claim مزيف لا يؤثر (status من DB re-read mock).

**E2E (lifecycle كامل عبر HTTP — الأهم):**
1. Provision org + TRIAL → hold/booking ينجحان (200/201).
2. تقديم `currentPeriodEnd` للماضي → sweep → TRIALING→EXPIRED → booking **402**، login **200**، reports **200**، users CRUD **200**، check-in تذكرة سابقة **201**، cancel booking سابق **200** (خدمة ما بِيع)، refund **200**.
3. تجديد من platform console → أول طلب تالٍ **201 فورًا** (بلا redeploy).
4. ACTIVE منتهية → sweep → **PAST_DUE** → وصول كامل (grace) → بعد تجاوز grace (تحكم الاختبار بالوقت عبر seed مباشر) → **EXPIRED** → 402.
5. **Regression دائم:** في security-regression suite أو ملف e2e مستقل `subscription-enforcement.e2e-spec.ts` — يمنع أي تراجع مستقبلي في الفرض.
6. Playwright (web): رؤية رسالة الاشتراك المنتهي في POS (bypass UI-only يفشل أصلاً لأن الـ backend يرفض — الاختبار يثبت العرض السليم للخطأ فقط).

**Gate:** كل البوابات القياسية + 41 e2e موجودة تبقى خضراء + suite الجديدة.

### 1.10 Files (متوقعة)

```
backend/prisma/migrations/2026090X_subscription_enforcement/migration.sql   (الـ SQL الثلاثة أعلاه)
backend/src/common/guards/subscription.guard.ts                            (جديد)
backend/src/common/decorators/subscription-policy.decorator.ts            (جديد)
backend/src/app.module.ts                                                  (تسجيل APP_GUARD — إضافة سطر)
backend/src/prisma/prisma.service.ts                                      (توسيع استعلام القراءة)
backend/src/platform/subscription-sweep.worker.ts                         (جديد)
backend/src/auth/auth.service.ts + administration (توجيه 402 خلال exempt حسب الحاجة)
backend/test/subscription-enforcement.e2e-spec.ts                         (جديد)
backend/src/common/guards/subscription.guard.spec.ts                      (جديد)
```

**التقدير:** 2–4 أيام عمل مع tests كاملة. Complexity: **M**. Risk: **Low-Medium** (الخطر الوحيد الحقيقي: نسيان exempt لأحد مسارات "خدمة ما بِيع" — يعالجه الـ e2e lifecycle).

---

## PHASE 2 — TD-016: MACHINE-ENFORCED DATABASE INVARIANTS (P1)

**Root cause:** قيود tenant composite (21 قيدًا في repair file) خارج schema.prisma — أي `migrate dev`/`db push` قد يسقطها بصمت، والدفاع الحالي "المطور يتذكر تشغيل test:db:tenant-consistency".

**الحل المقترح — تحويل الفحص من "تذكّر" إلى "استحالة تجاوز":**

1. **توسيع `test/sql/tenant-consistency.sql` → ملف invariants شامل جديد `test/sql/database-invariants.sql`:**
   - كل الـ 21 composite FK + unique composite indexes (من repair file — مصدر الحقيقة المولّد منه).
   - **RLS:** `relrowsecurity = true` + policy count ≥ 1 على كل الـ 33 جدول tenant.
   - **Triggers الحرجة موجودة:** journal posting guard، refund integrity، audit immutability، prevent_posted_line_mutation، settlement immutability.
   - **Grants الحرجة:** ticketty_app بلا DELETE/UPDATE على audit_logs، بلا أي منح على subscriptions، platform fns بلا PUBLIC.
   - **Enum/CHECK الحرجة:** payment amount positive، journal balance-critical CHECKs.
   - كل فحص `DO $$ ... RAISE EXCEPTION` — فشل واحد = exit code ≠ 0.
2. **CI (متصل فعلًا — يوسَّع):** استبدال استدعاءات test:db الستة بمظلة invariants + الاحتفاظ بالفردية (نفس scripts، إضافة `test:db:invariants`).
3. **Deploy-time enforcement (الجديد الجوهري):** خدمة `migrate` في compose.yaml تسلسل: `migrate deploy && prisma db execute invariants` — **الـ deployment نفسه يفشل إذا سقطت القيود**. أيضًا الدوكرة: healthcheck الـ backend.
4. **Dev-time:** `predev` hook (pnpm) يشغّل فيvariants خفيفة قبل start:dev — يمنع drift يتراكم أصلًا.
5. **توثيق:** قسم في docs/engineering/DATABASE_CONTRACT.md يسرد كل invariant + سببه + كيف يفحص.

Files: `test/sql/database-invariants.sql` (جديد)، `package.json` script، `compose.yaml` (سطر)، `.github/workflows/ci.yml` (استبدال)، `docs/engineering/DATABASE_CONTRACT.md`.
DB impact: صفر (قراءة/فحص فقط). API impact: صفر. Risk: صفر (فحص فقط). Complexity: **S** (نصف يوم–يوم).

---

## PHASE 3 — REAL PERMISSION ASSERTIONS (P1)

**Root cause:** controller-permissions.spec يفحص وجود metadata (لا شيء يفحص الفرض الفعلي — لا يوجد أي 403 matrix في المشروع).

**الحل — ثلاث طبقات، كل واحدة تثبت شيئًا مختلفًا:**

1. **الطبقة 1 — Static matrix (fast unit):** جدول واحد في spec: role × endpoint-pattern → allowed/denied. يُشتق آليًا من `@Permissions` metadata لكل controller (الموجود أصلًا) + تعريف أدوار مرجعي (OWNER full, CASHIER sales-only, AGENT own-only, SUPERVISOR no platform). يفشل إذا:
   - endpoint بلا صلاحيات، أو
   - دور النظام (SYSTEM_WORKER) يملك صلاحية خارج نطاقه، أو
   - الـ matrix تسمح بدور لا يجب أن يسمح (denied-paths صريحة).
2. **الطبقة 2 — Runtime 403 matrix e2e (الجوهرية):** `authorization-matrix.e2e-spec.ts`: لكل role حقيقي (login فعلي بـ seed users) × مجموعة endpoints ممثلة لكل controller (واحد على الأقل لكل controller + كل endpoints الحساسة ماليًا): assert 200 | 403 — **لا قيم أخرى مقبولة**. يشمل:
   - AGENT: booking الغير → 403 (own-scope).
   - CASHIER: administration/users → 403.
   - denied cross-role matrix من الطبقة 1 مطابَقة وقت التشغيل.
   - platform endpoints: لغير platform.admin → 403 (platform boundary).
3. **الطبقة 3 — Negative/unauthenticated:** بلا token → 401 على كل sample، مع token تالف → 401.

**الناتج:** إذا تعطلت الصلاحيات (حذف decorator، تغيير guard، تراجع في scoping) — **تفشل gates فورًا**.

Files: `backend/src/common/guards/controller-permissions.spec.ts` (إعادة بناء كاملة)، `backend/test/authorization-matrix.e2e-spec.ts` (جديد). DB: صفر. API: صفر. Risk: صفر (اختبارات فقط). Complexity: **S-M** (يوم–يومان).

---

## PHASE 4 — MEANINGFUL TEST REBALANCING (P1)

**الفلسفة (كما طلبت):** لا اختبارات لمجرد الرقم — **اختبارات للـ invariants التي لو كسرت لوقع ضرر مالي/عزلي.**

**أولًا — أهم business invariants لكل module [من الكود + التدقيقات]:**

| Module | الـ Invariants التي يجب أن تبقى صحيحة |
|---|---|
| **Booking** | ① تذكرة/مقعد واحد لكل رحلة فيزيائيًا (unique + claim) ② `totalAmount = Σ(seat prices)` دائمًا server-side ③ Idempotency: نفس المفتاح → نفس النتيجة أو 409، لا حجز مزدوج أبدًا ④ cancel يحرر المقعد ويصحح العمولة بالنسبة (cancellationFeePercent) ⑤ replay آمن بعد انتهاء hold ⑥ hold ينتهي بالانقضاء فقط |
| **Seats** | ① مقعد AVAILABLE أو HELD-by-me فقط قابل لل Claim ② الأنواع غير البيعية مرفوضة server-side ③ انتهاء hold يسمح بالاستيلاء ذريًا ④ (trip,seat) unique لا يكسر أبدًا |
| **Accounting** | ① POST محصّن بالـ trigger (لا قيد غير متوازن مهما كان التطبيق) ② POSTED immutable، تصحيح فقط بالـ reversal ③ reversal يصافر صافيًا القيد الأصلي ④ period مغلق = لا POST ⑤ worker: event واحد → معالج واحد (SKIP LOCKED) ⑥ FAILED يُعاد فقط آليًا، لا POSTED يُعاد |
| **Payments** | ① amount>0 ② refund تراكمي ≤ amount (DB trigger) ③ (org, idempotencyKey) unique ④ refund بعد refund جزئي بالباقي فقط ⑤ طريقة الدفع مقيدة بالسياسة المعتمدة (يرتبط بـ Phase 5) |
| **Permissions** | مغطى بالكامل بـ Phase 3 |

**ثانيًا — ما يُبنى:** لكل module suite e2e/service جديدة تغطي: happy + negative + edge + duplicate + state-transition + authorization-scoped. **الConcurrency موجود أصلًا وقوي** (booking 2-client, refund 2-client, check-in 6-way, expense dual) — لا يكرر، يُبنى حوله للجوانب الناقصة: replay windows، refund بعد cancel، period-close boundaries.

Files: `test/booking-invariants.e2e-spec.ts`, `test/accounting-invariants.e2e-spec.ts`, `test/payment-invariants.e2e-spec.ts` (+ توسيع unit للـ services). DB: صفر. API: صفر. Risk: صفر. Complexity: **M** (2–3 أيام).

---

## PHASE 5 — PAYMENT INTEGRITY MODEL (P1 — تصميم يعرض للموافقة)

### 5.1 الحقيقة الحالية [VERIFIED]

- Payment يُخلق **داخل معاملة الحجز** بحالة `COMPLETED` افتراضيًا — أي **الولادة = التأكيد**.
- `method` enum: CASH, CARD, BANKAK, MTN_MOMO, ZAIN_CASH, BANK_TRANSFER — **بلا أي provider/reconciliation** (مؤجل بقرار مالك).
- `receivedById` + `reference` (اختياري!) — البصمة = "كاشير يصرّح".
- **النتيجة:** تسجيل "MTN_MOMO" هو تأكيد كاشٍ بلا أي تحقق خارجي — phantom payment → confirmed ticket → إيراد مسجل. التقارير تعده إيرادًا كاملًا.

### 5.2 المفاهيم الأربعة كما تُقترح (تصميم صادق)

| المفهوم | ما يعنيه في Ticketty | أين يعيش |
|---|---|---|
| **Payment Intent** | نية التحصيل في مسار الحجز (method + amount من DTO) | transient — لا يخزن |
| **Payment Evidence** | سجل الدفع نفسه: method + amount + receivedById + reference | `payments` row |
| **Payment Verification** | **بشرية حاليًا** — لا يوجد provider verification ولا ندّعي وجوده | حسب الخيار أدناه |
| **Payment Confirmed** | COMPLETED — جاهز للإيراد المحاسبي | status |

### 5.3 خياران يعرضان للقرار

**الخيار A (الموصى به — "تقييد الآن، تصميم كامل عند الحاجة"):**
- DTO يقيّد `method` على `CASH` فقط (`@IsIn([CASH])`) — القيم الرقمية تبقى في الـ enum كـ **reserved & documented** غير قابلة للتسجيل حتى وجود سياسة/reconciliation (قرار المالك الأصلي بتأجيل providers يُطبَّق حرفيًا).
- **النتيجة الفورية:** phantom digital مستحيلة البتة (لا يمكن تسجيلها أصلًا)؛ الإيراد = نقد فعلي قابل للتصفية عبر تسويات الكاشير (settlements الموجودة).
- المرجع (reference) يصبح مطلوبًا... لا — CASH بلا reference (نقد في الدرج).
- Complexity: **XS** (سطر validation + tests + توثيق قرار المالك في MASTER_PLAN).
- **الخيار B يوثَّق كاملًا كتصميم v2 جاهز للتفعيل** (انظر Appendix B) عند أول حاجة فعلية للبيع الرقمي (pilot يقولها).

**الخيار B (كامل الآن — "verification workflow"):**
- `PENDING_VERIFICATION` حالة جديدة للطرق الرقمية + `verifiedAt/verifiedById` + endpoint `POST /payments/:id/verify` بصلاحية `payments.verify` (supervisor) + accounting يفرّق الإيراد مُثبَتًا/قيد-التحقق في التقارير (يرتبط TD-010 net-vs-gross) + سياسة refund للـ pending.
- Complexity: **M-L** — يمس معاملة الحجز، سياسة المحاسبة، التقارير، وrefunds — **قبل أول عميل حقيقي = overengineering واضح** (يتناقض مع §12 من ميثاقك: "الحد الصحيح من الهندسة للمرحلة").

**التوصية الصريحة: الخيار A.** أسبابه: يحل الجذر (لا تسجيل رقمي بلا سياسة) بأدنى تغيير، لا يبني فوق provider مؤجل بقرارك، وB جاهز وموثق عند الحاجة الفعلية.

### 5.4 Tests (بعد القرار)

A: تسجيل digital → 400 صريح، CASH يعمل، التقارير لا تتضمن سوى نقد (invariant)، seed data نظيف.
B (لو اختير): lifecycle كامل pending→verified→refund، عدم توثق إيراد غير مثبت، verify بصلاحية خاطئة → 403.

---

## PHASE 6 — OBSERVABILITY BASELINE (P1)

**المبدأ: الحد الأدنى المفيد والموثوق — لا منظومة مراقبة ضخمة قبل أول عميل.**

**الحزمة المقترحة (prom-client — dependency واحدة، بلا hosted service):**

1. **`GET /metrics`** (prometheus text format) — محمي بـ platform scope أو شكليًا network-internal (يقرر التنفيذ بالتوازي مع deploy topology).
2. **العدادات الأساسية:**
   - `http_requests_total{route,status}` + `http_request_duration_seconds` histogram — من الـ requestId middleware الموجود (توسعة، لا replacement).
   - `accounting_queue_depth{status}` (PENDING/FAILED) — gauge من استعلام موجود أصلًا في worker.
   - `accounting_events_processed_total` / `accounting_events_failed_total`.
   - `accounting_worker_last_success_timestamp` + `consecutive_failures` — **هذان هما جواب "إذا توقف العامل أو فشل بشكل متكرر نعرف تلقائيًا"** (alert rule على staleness > 3× interval و failures > 0 خلال 10m).
   - `subscription_sweep_last_run` (من Phase 1 — الربط المباشر).
   - process metrics (event loop lag, memory) من prom-client.
   - `402 SUBSCRIPTION_REQUIRED` counter (يربط Phase 1 بمراقبة الدفع).
3. **Alert rules file** (وثيقة جاهزة للربط بأي alertmanager مستقبلي — لا ننشر hosted الآن): worker stale، failed events > 0، error-rate 5xx، DB readiness fail.
4. **Health توسعة:** readiness يضيف worker staleness (degraded لا not-ready — لا نقتل الحاوية بسبب تذبذب worker).
5. **Critical business failures:** فشل accounting event + فشل subscription sweep يسجلان structured + counter (الموجود logger.warn يرقّى بلا تغيير منطق).

Files: `backend/src/monitoring/` module جديد (metrics registry + endpoint)، توسعة request-context middleware، worker hooks. Complexity: **M** (2–3 أيام). Risk: Low (إضافة غير مسارية). DB: صفر. API: endpoint واحد داخلي.

---

## PHASE 7 — BACKUP/RESTORE DRILL (P1)

**الموجود:** scripts + drill محلي موثق (2026-08-27). **الناقص:** إثبات قابل للتكرار آليًا على بيئة تمثل prod.

**Drill المقترح (سكربت واحد قابل للتكرار `ops/verify-restore.sh`):**
1. Backup فعلي من الـ DB الحيّة (pg_dump من scripts الموجودة).
2. Restore إلى scratch DB نظيفة.
3. `prisma migrate status` → up to date (توافق migrations).
4. **كل suites الـ invariants** (من Phase 2) تمر على الـ restored — **RLS + القيود + الـ triggers موجودة فعلًا بعد الاستعادة، ليس فقط في النسخة الأصلية.**
5. Application bootstrap ضد الـ restored DB: readiness → 200.
6. SQL probe: cross-tenant read → 0 rows (عزل حيّ بعد الاستعادة).
7. Data spot-check: row counts مطابقة المصدر لجداول مختارة.
8. توثيق النتيجة في `docs/operations/restore-drill-<date>.md` كدليل exec بقياس زمن RTO.

Complexity: **S-M** (يوم). Risk: صفر. **الناتج:** إثبات مرتب بالـ Phase 2 (نفس الـ invariants تُفحص على backup) — هذا هو "النسخ الاحتياطي الحقيقي".

---

## MASTER TABLE

| Priority | Task | Root Cause | Proposed Solution | Files | DB Impact | API Impact | Risk | Tests | Complexity |
|---|---|---|---|---|---|---|---|---|---|
| **P0** | SaaS Subscription Enforcement | لا runtime check + انتهاء يدوي + لا سياسة متدرجة | DB-join guard (402) + fail-closed policy decorator + sweep worker (PAST_DUE/grace) + state machine | migrations(1)، guard+decorator(جديد)، worker(جديد)، prisma.service، app.module، e2e+unit | 3 SQL fns، بلا جداول/أعمدة، بلا backfill | 402 لفئة العمليات التجارية عند EXPIRED؛ **لا كسر لأي API قائم** | Low-Med (exempt-list هو نقطة الاهتمام) | unit matrix + lifecycle e2e + regression دائم | **M** |
| **P1** | TD-016 invariants | قيود خارج schema.prisma + دفاع بشري | invariants SQL شاملة + CI + **deploy-time فشل** + predev hook | invariants.sql(جديد)، package.json، compose.yaml، ci.yml، DATABASE_CONTRACT.md | صفر (فحص) | صفر | صفر | الفحص نفسه هو الاختبار (fail-fast) | **S** |
| **P1** | Permission assertions | لا 403 matrix في المشروع | 3 طبقات: static matrix + runtime 403 e2e + unauthenticated | controller-permissions.spec (rebuild)، authorization-matrix.e2e (جديد) | صفر | صفر | صفر | الاختبار هو المخرَج | **S-M** |
| **P1** | Test rebalancing | 18 test لـ platform مقابل 2 لـ bookings و4 لـ accounting | suites invariant-first لـ Booking/Seats/Accounting/Payments | 3 e2e specs + unit توسعة | صفر | صفر | صفر | هي المخرَج | **M** |
| **P1** | Payment integrity | digital enum يُقبل بلا أي تحقق = phantom revenue | **[قرارك]** A: قصر CASH الآن (XS) — B: verification workflow كامل (M-L) | dto validation + توثيق / أو model+endpoint+reports | A: صفر — B: enum+أعمدة+fn | A: 400 للرقمية — B: endpoint جديد | A: صفر — B: Low-Med | A: negative+reports — B: lifecycle | **A: XS / B: M-L** |
| **P1** | Observability baseline | لا metrics ولا alerts (42/100) | prom-client + /metrics + worker/queue/error/latency counters + alert rules doc | monitoring module(جديد)، middleware توسعة، worker hooks | صفر | /metrics داخلي | Low | prom self-test + health | **M** |
| **P1** | Restore drill | backup موجود بلا إثبات استعادة قابل للتكرار | verify-restore.sh شامل (backup→restore→migrate→invariants→app→RLS probe) + توثيق RTO | ops/verify-restore.sh(جديد)، docs drill جديد | صفر (قراءة/نسخ) | صفر | صفر | الدليل الموثق هو المخرَج | **S-M** |

---

## DEPENDENCY ORDER + ملاحظة واحدة جوهرية

```
Phase 1 (Subscription)  ← ينتظر موافقتك — كل ما بعده متسلسل بعده
   ↓
Phase 2 (TD-016 invariants)  ← يؤسس "لغة الفحص" التي يستعملها Phase 7 (restore drill يفحص نفس invariants)
   ↓
Phase 3 (Permission matrix)  ← مستقل تمامًا؛ يوضع هنا لأنه سريع ويقفل أمانًا قبل توسعة الاختبارات
   ↓
Phase 4 (Test rebalancing)  ← Booking/Accounting أولًا؛ **جزء Payments يُؤجَّل إلى ما بعد قرار Phase 5** (توطئة الاختبارات قبل تغيير النموذج = إعادة كتابة)
   ↓
Phase 5 (Payment integrity — قرار تصميم)  ← ثم تُكتب اختبارات payments فوق النموذج النهائي
   ↓
Phase 6 (Observability)  ← يلتقط counters من Phase 1 (402s) والـ worker
   ↓
Phase 7 (Restore drill)  ← يستهلك invariants من Phase 2 — الخاتمة المثالية (إثبات النسخ الاحتياطي بكل ما بنيناه)
```

**ملاحظة الاعتماد الوحيدة المطلوبة لقرارك:** ترتيبك الأصلي يضع "test strengthening" (4) قبل "payment integrity" (5). أنفذها **كما طلبت** مع تعديل واحد صريح: **اختبارات Payments تحديدًا تُكتب بعد قرار Phase 5** (لأن كتابتها قبل تغيير نموذج الدفع تعني كتابتها مرتين). Booking/Accounting/Seats tests لا تتأثر — تُنفذ في موضعها. إن أردت الالتزام الحرفي بترتيبك أصلًا (كتابة اختبارات payments على النموذج الحالي ثم تحديثها)، قل ذلك صراحة وسألتزم.

---

## WHAT WILL NOT BE CHANGED (النواة المحمية — مكررة عن قصد)

1. **RLS:** كل policies/grants/triggers القائمة — أي إضافة في الخطة أعلاه additive بحتة.
2. **Booking core:** معاملة hold→claim→ticket→payment — لا تمس. الـ guard الجديد يقرأ فقط ولا يدخل المعاملة.
3. **Seat concurrency:** advisory locks + conditional writes كما هي.
4. **Accounting core:** double-entry triggers + posting guards + period lock + SKIP LOCKED — Phase 4 يختبرها ولا يعدلها، Phase 6 يرقّي تسجيلها بلا تغيير منطق.
5. **Audit immutability** (trigger + grants من P1-2 سابقًا).
6. **Guard chain القائمة:** Throttler → JwtAuthGuard → PermissionsGuard → RLS interceptor — subscription guard **يضاف** للسلسلة ولا يعيد ترتيبها أو يعيد تعريف أي منها.
7. **BFF/Cookie/CSP/design DNA/frontend shell.**
8. **CI pipeline الحالي** — توسعة scripts فقط.

---

## DEFINITION OF DONE — لكل مرحلة (وبعدها لا يقال "تم" بلا إثبات)

| إثبات | Phase 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Unit tests | ✅ guard matrix | — (الفحص SQL) | ✅ static matrix | ✅ | ✅ (حسب القرار) | ✅ | — |
| E2E (41 قائمة) | ✅ تبقى خضراء + lifecycle جديد | ✅ | ✅ + matrix جديد | ✅ + suites جديدة | ✅ | ✅ | — |
| Lint/Typecheck/Build | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Migration validation (deploy + status) | ✅ | ✅ | — | — | حسب القرار | — | ✅ (على restored) |
| **Database invariants** | ✅ (عبر suite) | ✅ **(هو المخرج)** | — | — | — | — | ✅ **(على restored)** |
| Security regression suite (S1–S4) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tenant isolation probes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **(على restored)** |
| Concurrency behavior | ✅ (لا يتغير) | — | — | ✅ ( suites تحرس) | — | — | — |
| **ما لن يُختبر يُذكر صراحة** | load/timing تحت حمل | — | كل مسارات web UI (backend فقط) | fault-injection (crash-mid-tx) | provider integration (غير موجود بالتصميم) | alert delivery فعلي (لا alertmanager منشور) | RPO/RTO الحقيقيان على prod hosted (الـ drill على بيئة مماثلة) |

---

## إعادة التقييم المتوقعة (predictions — لا تُعتمد إلا بعد التنفيذ والقياس)

| المؤشر | الحالي | بعد Phase 1 | بعد 1–7 |
|---|---:|---:|---:|
| SaaS Readiness | 72 | **~88** (enforcement + graduated policy + auto-expiry) | ~92 |
| Commercial Readiness | 65 | ~72 (نموذج تحصيل قابل للتفعيل) | ~80 (مع A: +2) |
| Production Readiness | 78 | ~82 | **~90** (invariants + observability + drill) |
| Testing | 72 | ~74 (suite جديدة) | **~85** (matrix + rebalance) |
| Observability | 42 | 42 (لا يتغير بالـ1) | **~68** (baseline موثوق لا hosted) |
| Engineering Overall | 83 | ~85 | **~88** |

> هذه **توقعات معلنة** ستُقاس فعليًا بعد التنفيذ، وقد تثبت الأرقام أنها أقل من المتوقع — حينها تُوثَّق الأرقام الفعلية لا المتوقعة. لا inflation.

---

## القرار المطلوب منك الآن (قبل أي كود)

1. **الموافقة على Phase 1 (Subscription Enforcement)** بتصميمه أعلاه — وخاصة: (أ) سياسة الوصول المتدرجة §1.4، (ب) 402 كـ status، (ج) ترك كتابات التجهيز (routes/buses/trips CRUD) مسموحة عند EXPIRED.
2. **قرار Phase 5 المبدئي** (يمكن تأجيله حتى يصل دوره): الخيار A (قصر CASH) أم B (verification workflow) — التوصية: A.
3. **تأكيد التعديل الوحيد على الترتيب:** اختبارات payments بعد قرار Phase 5 (أو أمرك بالتزام حرفي).

**بعد موافقتك أبدأ Phase 1 فورًا، ببوابة كاملة قبل الانتقال لكل مرحلة تالية.**
