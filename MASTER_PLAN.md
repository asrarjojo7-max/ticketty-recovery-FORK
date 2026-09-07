# TICKETTY — MASTER EXECUTION PLAN
> **الوثيقة الحاكمة لكل التنفيذ. هذه الملف = الذاكرة الدائمة للمشروع.**
> إذا بدأت سيشن جديد أو فُقد السياق: اقرأ هذا الملف أولاً، ثم `docs/engineering/PROJECT_STATE.md`، ثم أكمل من "سجل التقدم" في الأسفل.

---
## 0) الهوية والمصادر

- **المستودع:** `/home/mojahed/Downloads/ticketty` (العمل هنا دائماً)
- **Backend:** NestJS 11 + Prisma 6 + PostgreSQL — 33 model، 27 migration، 103 endpoint، RLS نشط
- **Frontend:** Next.js 16 App Router + React 19 + TS + Tailwind v4 + TanStack Query/Table
- **المستودع المرجعي للتصميم:** `https://github.com/mogahedadamy/remix-of-remix-of-remix-of-ticket-master-suite.git`
  - نسخة محلية (قد تكون مؤقتة): `/tmp/ticket-master-ref` — كل الـ DNA المطلوب مستخرج وموثق أدناه داخل هذا الملف، فلا تعتمد عليها
- **قرار المصالحة الموثق:** Ticketty = Source of Truth (backend/database/business). ticket-master = مرجع بصري فقط. **Extract Design DNA → Rebuild UI on Ticketty architecture.** لا copy/paste لأي منطق Supabase.

## 1) القيود الذهبية غير القابلة للتفاوض

1. **مزود الدفع = المرحلة الأخيرة فقط** (قرار صريح من المالك). لا يُبنى أي Adapter/Provider قبل اكتمال كل المراحل الأخرى.
2. **UI تعرض وتجمع المدخلات. Backend يقرر. Database يفرض الـ integrity.**
3. ممنوع نقل: Supabase client / `from()` / `rpc()` / `channel()` / PostgREST joins / client-side money math / localStorage كـ tenant context / ROLE_ALLOWED_PATHS كمصدر أمان / unpaginated lists.
4. كل الأرقام المالية (revenue/occupancy/discount/totals) تُحسب **Server-side** (backend endpoints موجودة: `GET /api/reports/dashboard|sales|financial|occupancy`).
5. كل قائمة Production: server pagination (الـ backend يدعم `page`/`limit` افتراضياً 50 حد أقصى 200).
6. كل عملية حجز/إلغاء ترسل `Idempotency-Key` header (مفروض من الـ backend بالفعل — `bookings.controller.ts:43,66`).
7. RTL first-class: `dir="rtl"` على `<html>`، logical properties فقط (`ms-/me-/ps-/pe-/start-/end-`)، ممنوع `left/right` و`pl-/pr-/ml-/mr-` في أي كود جديد.
8. لا regressions: بعد كل مرحلة `pnpm lint:check && pnpm typecheck && pnpm test && pnpm build` في `web/`، ونفس الشيء + `pnpm test --runInBand` في `backend/` عند تعديله.
9. **لا حذف/تعديل لأي منطق backend المحمي**: RLS، advisory locks، idempotency، refund triggers، settlement invariants، accounting guards.
10. المستخدم العربية لغة وحيدة للواجهة (لا i18n في هذا الإصدار).

## 2) Design DNA الموثق (مستخرج من ticket-master — المرجع البصري الملزم)

### 2.1 نظام الألوان (oklch) — يُبنى في `web/src/app/globals.css`

```
LIGHT :root {
  --radius: 1rem;
  --background: oklch(0.985 0.006 60);  --foreground: oklch(0.22 0.05 260);
  --card: oklch(1 0 0);  --card-foreground: oklch(0.22 0.05 260);
  --popover: oklch(1 0 0);  --popover-foreground: oklch(0.22 0.05 260);
  /* Brand primary = Ticketty ORANGE */
  --primary: oklch(0.72 0.19 50);  --primary-foreground: oklch(0.99 0.005 60);
  --primary-soft: oklch(0.96 0.04 60);  --primary-glow: oklch(0.78 0.17 60);
  --secondary: oklch(0.965 0.008 240);  --secondary-foreground: oklch(0.28 0.05 255);
  --muted: oklch(0.965 0.008 240);  --muted-foreground: oklch(0.5 0.02 250);
  /* Accent = deep NAVY */
  --accent: oklch(0.36 0.1 250);  --accent-foreground: oklch(0.99 0.005 60);
  --accent-soft: oklch(0.95 0.03 250);
  --brand-navy: oklch(0.32 0.1 255);  --brand-navy-foreground: oklch(0.99 0.005 60);
  --success: oklch(0.62 0.14 155);  --success-foreground: oklch(0.99 0 0);
  --warning: oklch(0.78 0.15 85);   --warning-foreground: oklch(0.2 0.04 60);
  --destructive: oklch(0.58 0.22 27); --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.92 0.012 60);  --input: oklch(0.92 0.012 60);  --ring: oklch(0.72 0.19 50);
  --sidebar: oklch(0.99 0.006 60); --sidebar-foreground: oklch(0.3 0.06 255);
  --sidebar-border: oklch(0.93 0.012 60); --sidebar-accent: oklch(0.96 0.05 60);
  --sidebar-accent-foreground: oklch(0.55 0.18 50);
}
DARK .dark {
  --background: oklch(0.18 0.03 260); --foreground: oklch(0.96 0.01 60);
  --card: oklch(0.22 0.03 260);  --card-foreground: oklch(0.96 0.01 60);
  --popover: oklch(0.22 0.03 260); --popover-foreground: oklch(0.96 0.01 60);
  --primary: oklch(0.75 0.18 55); --primary-foreground: oklch(0.18 0.03 260);
  --primary-soft: oklch(0.3 0.08 55); --primary-glow: oklch(0.8 0.17 60);
  --secondary: oklch(0.26 0.03 260); --secondary-foreground: oklch(0.96 0.01 60);
  --muted: oklch(0.26 0.03 260);  --muted-foreground: oklch(0.72 0.02 250);
  --accent: oklch(0.72 0.13 250); --accent-foreground: oklch(0.15 0.02 260); --accent-soft: oklch(0.3 0.06 255);
  --brand-navy: oklch(0.28 0.08 258); --brand-navy-foreground: oklch(0.96 0.01 60);
  --success: oklch(0.7 0.14 155); --success-foreground: oklch(0.15 0.02 155);
  --warning: oklch(0.82 0.15 85); --warning-foreground: oklch(0.2 0.04 60);
  --destructive: oklch(0.65 0.2 27); --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(1 0 0 / 10%);  --input: oklch(1 0 0 / 12%);  --ring: oklch(0.75 0.18 55);
  --sidebar: oklch(0.2 0.025 260); --sidebar-foreground: oklch(0.92 0.01 60);
  --sidebar-border: oklch(1 0 0 / 8%); --sidebar-accent: oklch(0.3 0.08 55);
  --sidebar-accent-foreground: oklch(0.85 0.14 60);
}
GRADIENTS + SHADOWS (نفس القيم في الثيمين):
  --gradient-primary: linear-gradient(135deg, oklch(0.76 0.18 55) 0%, oklch(0.66 0.21 40) 100%);
  --gradient-hero: linear-gradient(135deg, oklch(0.78 0.16 55) 0%, oklch(0.62 0.22 35) 60%, oklch(0.42 0.14 265) 100%);
  --gradient-navy: linear-gradient(135deg, oklch(0.32 0.1 255) 0%, oklch(0.22 0.06 260) 100%);
  --gradient-soft: linear-gradient(135deg, oklch(0.98 0.03 60) 0%, oklch(0.97 0.02 250) 100%);
  --shadow-card: 0 1px 2px 0 oklch(0.2 0.04 255/.04), 0 1px 3px 0 oklch(0.2 0.04 255/.06);
  --shadow-elevated: 0 10px 30px -12px oklch(0.2 0.04 255/.18), 0 4px 12px -4px oklch(0.2 0.04 255/.08);
  --shadow-glow: 0 20px 50px -20px oklch(0.72 0.19 50/.45);
Utilities: @utility bg-gradient-primary/hero/navy/soft, shadow-glow/elevated, bg-dot-grid (radial 18px grid)
```
**هوية اللون:** برتقالي Ticketty = primary (CTA/active/أرقام مميزة)، كحلي عميق = accent/navy (سطح مناقض)، ~85% محايد، ~10% برتقالي، ~5% كحلي. الحالات دائماً `bg-x/15 text-x` (ألفا منخفض + نص مشبع) — ممنوع fill صلب للحالات.

### 2.2 Typography
```
--font-sans: "Cairo" (body 400–800) · --font-display: "Mada" (headings 600–900)
h1–h4 { font-family: display; letter-spacing: -0.01em }
.tabular { font-variant-numeric: tabular-nums }  ← لكل الأرقام المالية/مقاعد/KPI
body { font-feature-settings: "cv02","cv03","cv04","ss01" } · text-sm (14px) هو الأساس
Page title: font-display text-2xl font-extrabold lg:text-3xl · KPI value: font-display text-3xl font-extrabold tabular
```
**التنفيذ في Next.js:** `next/font/google` — Cairo({subsets:["arabic"],weight:["400","500","600","700","800"]}) + Mada({weight:["600","700","800","900"]}) بمتغيرات `--font-sans`/`--font-display`. يستبدلان Alexandria/IBM_Plex الحاليين في `web/src/app/layout.tsx`.

### 2.3 Page Contract (عقد الصفحة الموحد — كل شاشة)
```
<PageHeader eyebrow? title subtitle? icon? actions?/>  →  rounded-3xl bg-gradient-soft p-5/lg:p-6 + blur orbs
[Filter row: relative search input بـ ps-9 + icon absolute insetInlineStart .75rem] + Selects
Container: overflow-hidden rounded-2xl border border-border bg-card shadow-card → overflow-x-auto > table
Table: thead bg-muted/40 text-[11px] font-bold uppercase tracking-wider · px-4 py-3/px-4 py-4 · divide-y
Empty: EmptyState (icon tile bg-primary-soft + blur + title/desc + CTA اختياري) · Error: destructive/40 panel
Loading: skeleton مطابق لهندسة الشاشة · Mutations: dialog → useMutation → invalidate → sonner toast
```

### 2.4 مكونات DNA المرجعية (تُبنى في `web/src/components/`)
- **PageHeader** — كما هو أعلاه
- **StatusBadge** — map واحد فقط لحالات booking (مؤكد/معلّق/ملغى/مسترد) + حالات trip/ticket/payment لاحقاً
- **KpiCard** — rounded-3xl p-5، icon tile `toneIconBg` (primary=gradient-primary+shadow-glow, success=success/15, accent=gradient-navy, warning=warning/20, destructive=destructive/15)، `text-3xl font-extrabold tabular`، DeltaPill اختياري، Sparkline SVG اختياري، progress bar اختياري، hover:-translate-y-0.5 hover:shadow-elevated
- **DeltaPill** — `bg-success/15 text-success` أو destructive، +X% tabular
- **Sparkline/RevenueAreaChart/FleetDonut** — SVG يدوي، ألوان var(--color-*) فقط، gradient fill (stopOpacity .35→.02)، stroke 2.2، نقاط r=3.5 fill=card، gridlines dashed 3 4
- **EmptyState** — icon h-14 w-14 rounded-2xl bg-primary-soft + absolute blur-xl opacity-40
- **Skeletons** — TableSkeleton/CardGridSkeleton مطابقة للهندسة النهائية
- **AppShell** — Sidebar: `w-64` فاتح `bg-sidebar`، عناصر `rounded-xl px-2.5 py-2 text-sm`، active = `bg-gradient-primary text-primary-foreground shadow-glow`، مجموعة `text-[10px] uppercase tracking-wider`، TopBar `sticky h-16 bg-background/80 backdrop-blur` + بحث + خروج. Mobile: drawer من اليمين `translate-x-full→0` + overlay، يغلق عند تغيير المسار.

### 2.5 Seat Map (4 حالات — القرار التصميمي الحاسم)
```
Grid: 2+aisle+2 (grid-cols-[1fr_1fr_1.5rem_1fr_1fr] أو gridTemplate مولّد) · مقعد h-10 w-10 rounded-lg border-2 tabular text-sm font-bold
AVAILABLE     : border-primary/20 bg-card text-foreground → hover:border-primary text-primary shadow-md scale-105
HELD_BY_ME    : border-warning bg-warning text-warning-foreground shadow-lg shadow-warning/20 (disabled)
HELD_BY_OTHER : border-border bg-muted/60 text-muted-foreground + نمط قطري (مقعد محجوز من طرف آخر — جديد)
BOOKED        : border-destructive/30 bg-destructive/10 text-destructive/60 cursor-not-allowed
Interaction   : transition-transform hover:scale-105 active:scale-95 · Driver seat يُعرض ولا يُختار
```
ticketty يملك BusSeatMap عاملاً بالفعل (hold/release/vip/regular/blocked) — يُعاد تنسيقه بهذه اللغة البصرية + الحالة الرابعة (held-by-other = HELD ليس لي).

## 3) خريطة الشاشات (Page Mapping)

| الشاشة | المسار | المصدر البصري | مصدر البيانات | القرار |
|---|---|---|---|---|
| Login | `/login` | ticket-master auth (split + gradient-hero brand panel) | `POST /api/auth/login` (موجود) | RECREATE |
| Dashboard | `/dashboard` | hero+KPI+charts | **توسعة `GET /api/reports/dashboard`** | REBUILD (API-first) |
| Bookings | `/bookings` | جدول+dialog | `/api/bookings` + pagination | REBUILD |
| **POS** | `/bookings` (وضع بيع سريع) أو `/pos` | POS single-screen | hold+`POST /api/bookings`+Idempotency-Key | REBUILD (أولوية قصوى) |
| Boarding | `/boarding` | scanner | `/api/tickets` QR | ADAPT (تنسيق فقط) |
| Trips | `/trips` | جدول+dialog | `/api/trips` | REBUILD |
| Fleet/Buses | `/buses` | بطاقات+dialog | `/api/buses` | REBUILD |
| Agents | `/agents` | جدول | `/api/agents` | REBUILD |
| Manifests | `/manifests` | قائمة+طباعة | `/api/manifests` | ADAPT |
| Accounting | `/accounting` | بطاقات+جداول | `/api/accounting/*` (موجود) | REBUILD UI |
| Financial | `/financial` | تقارير | `/api/reports/financial` | ADAPT |

## 4) المراحل التنفيذية (تنفذ بالترتيب حصراً)

---
### Phase 0 — أمان وخط أساس (ساعات، صفر مخاطرة)
**الهدف:** حماية 49 ملفاً غير متتبعة (بما فيها وحدة المحاسبة كاملة) + مزامنة الذاكرة الهندسية.
1. `git add -A && git commit` برسالة توثق الحالة (baseline)
2. تحديث `docs/engineering/PROJECT_STATE.md` + `PROGRESS.json` + `TEST_STRATEGY.md`: 8 commits موجودة → الآن أكثر، 24 suites/91 unit، 5/19 E2E، 27 migrations، 33 models
3. تسجيل هذا الملف (`MASTER_PLAN.md`) في الـ commit الأول
**قبول المرحلة:** `git status` نظيف (باستثناء .env) · docs متطابقة مع `pnpm test` الفعلي.

---
### Phase 1 — Design System Core (globals.css + خطوط + sonner)
**الهدف:** هوية ticket-master البصرية فوق بنية Tailwind v4 الحالية.
1. أضف `sonner` إلى `web/package.json` + `<Toaster position="top-left" dir="rtl" richColors closeButton/>` في `providers.tsx`
2. استبدل بلوكات `:root`/`.dark` في `web/src/app/globals.css` بقيم oklch الموثقة أعلاه (§2.1) — مع الإبقاء على `@theme inline` mapping و`@custom-variant dark` وإضافة `--color-primary-soft/--color-primary-glow/--color-brand-navy/--color-sidebar-*` + utilities gradients/dot-grid/shadows
3. `web/src/app/layout.tsx`: استبدل Alexandria/IBM_Plex بـ Cairo+Mada عبر `next/font/google` بمتغيرات `--font-sans`/`--font-display` + `<html lang="ar" dir="rtl">` (تأكد أنه موجود)
4. RTL lint guard: أضف قاعدة ESLint تمنع `(^|[^-])((p|m)(l|r)-|left-|right-)` في `web/.eslintrc`/`eslint.config` (استثناء: `text-left/right` غير موجود عندنا — لا استثناءات)
5. **جرد الهجرة:** ملفاتtsx تحتوي `emerald|teal|blue-600|rose-|#[0-9a-f]{3,6}` مباشرة → تُرحل مرحلياً في المراحل 4-7 (لا تكسر الآن ما دام التطبيق يبني)
**قبول المرحلة:** `pnpm build` + `pnpm lint:check` + `pnpm typecheck` + `pnpm test` خضراء في `web/` · صفحة login تعرض بالهوية الجديدة (قد تكون غير مثالية — المراحل التالية تنقّح).

---
### Phase 2 — Component Library (عقد الصفحة)
**الهدف:** رفّ المكونات الذي تبني به كل الشاشات اللاحقة.
أنشئ في `web/src/components/`:
1. `layout/page-header.tsx` — كما في §2.4 (بدون أي data fetching)
2. `ui/status-badge.tsx` — map موحد (booking: CONFIRMED/PENDING/CANCELLED/REFUNDED + ترجمة عربية)
3. `ui/empty-state.tsx` — أعد بناءه بنمط ticket-master (icon tile + blur + CTA اختياري `<Link href/>`)
4. `dashboard/kpi-card.tsx` — مع toneIconBg/DeltaPill/Sparkline/progress
5. `dashboard/charts.tsx` — Sparkline + RevenueAreaChart + FleetDonut + FleetRow (SVG يدوي، ألوان var فقط)
6. `ui/skeletons.tsx` — TableSkeleton(rows,cols)+CardGridSkeleton(count,cols)
7. حديث `ui/card|button|input|table` للتقيد بالـ tokens الجديدة تلقائياً (لا تغيير جوهري — نفس واجهات props)
**اختبار:** لا مكون يجلب بيانات (props فقط) · لا ملف يستورد Link إلا EmptyState/page-header عبر props اختيارية.
**قبول المرحلة:** build/lint/typecheck/test خضراء.

---
### Phase 3 — Shell (Sidebar+TopBar+Navigation)
**الهدف:** قشرة التطبيق بهوية ticket-master وسلوك ticketty.
1. `web/src/components/layout/sidebar.tsx` → إعادة تنسيق: فاتح `bg-sidebar`، مجموعة `text-[10px] uppercase`، عنصر active `bg-gradient-primary text-primary-foreground shadow-glow`، أيقونات من `navigation.ts` الحالي (موجود بالفعل مع filterNavigation بالصلاحيات — **لا يُمَس المنطق**)
2. `header.tsx` → sticky backdrop-blur + بحث + خروج (احتفظ بجلسة BFF الحالية)
3. `app-shell.tsx` → drawer موبايل من اليمين + overlay + إغلاق عند pathname change
4. رقّم `config/navigation.ts` بمجموعات ticket-master (الرئيسية/العمليات/الإدارة) — labels موجودة، تحسّن الترتيب فقط
**قبول المرحلة:** تنقل كامل يعمل + فلترة الصلاحيات كما كانت (permissions.test.ts يمر) + mobile drawer صحيح RTL.

---
### Phase 4 — Dashboard (API-first rebuild)
**الهدف:** dashboard قوي بصرياً + كل الحساب server-side.
1. **Backend** `backend/src/reports/reports.service.ts → dashboard()`: أرجع payload كامل:
   `{ todayRevenue, todayBookings, yesterdayRevenue, yesterdayBookings, activeTrips, busCounts:{active,maintenance,inactive}, avgOccupancy, revenueSeries:[{day,label,revenue,bookings}×7], recentBookings[≤8 مع route/seat/amount/status], upcomingTrips[≤5 مع route/capacity/booked/departureAt], ticketsSoldToday }`
   - الحساب كله في service عبر aggregate/findMany محدود (موجود جزئياً — وسّع فقط، لا تعيد كتابة)
   - احترام: tenant scope (`requireOrgId`/branch) + `refundedAmount` في الإيراد الصافي (net = amount - refunded) — **لا gross كإيراد**
   - اختبار unit للتجميع في `reports.service.spec.ts` (موجود — أضف حالات السلسلة/الإشغال)
2. **Web** `web/src/app/(dashboard)/dashboard/page.tsx` + `web/src/components/dashboard/`:
   - Hero: gradient-hero + dot-grid + blur orbs + رقم اليوم الضخم tabular + MiniStat 2×2 + أزرار CTA سريعة
   - صف KPI 4 بطاقات (KpiCard) مع DeltaPill مقارنة بالأمس
   - RevenueAreaChart (7 أيام) + FleetDonut + FleetRows
   - آخر الحجوزات (جدول مصغر) + الرحلات القادمة (progress bars لكل رحلة)
   - `useQuery(["dashboard"], fetchDashboard, { refetchInterval: 60_000 })` عبر BFF proxy — **صفر حساب في React** (فقط `pctChange` للمقارنة = عرض بحت)
3. Skeleton مطابق للهندسة (HeroSkeleton+KpiGridSkeleton)
**قبول المرحلة:** لا query مباشر من frontend لغير `/api/reports/dashboard` · أرقام الإيراد = net بعد refunds · build+tests خضراء (backend+web).

---
### Phase 5 — POS (نقطة البيع — أولوية قصوى)
**الهدف:** شاشة بيع واحدة كفاشير: رحلات→مقاعد→مسافرون→سلة→دفع→تذكرة فورية.
**Backend (توسعات صغيرة فقط — المحرك موجود):**
1. تأكد أن `GET /api/trips` يدعم فلترة النافذة الزمنية (trips قادمة/اليوم) و`GET /api/trips/:id/seats` (موجود مع lazy hold-expiry cleanup) — أضف `?upcoming=true&limit=` اختيارياً لو يلزم
2. `POST /api/trips/:id/seats/:seatId/hold` + release (موجودان) — تأكد أن الاستجابة تعيد `heldByUserId` لتلوين HELD_BY_OTHER في الواجهة (أضف `heldByCurrentUser` في استجابة seats إذا لم يوجد)
**Web** (صفحة `/pos` جديدة داخل `(dashboard)`):
1. `web/src/features/pos/` — `pos-feature.tsx` + `components/trip-cards.tsx, seat-panel.tsx, cart.tsx, passenger-dialog.tsx`
2. بنية ticket-master: عمودان lg:grid-cols-3 — يمين (بحث+بطاقات رحلة+خريطة مقاعد)، يسار (سلة+خصم+طريقة دفع+checkout)
3. خريطة المقاعد: BusSeatMap الحالي بتنسيق §2.5 (4 حالات — حالة HELD_NOT_MINE من heldByUserId)
4. الحجز: `createBooking` hook موجود (`use-create-booking.ts` يرسل Idempotency-Key — تأكد أن POS يستخدم نفس العقد: `Idempotency-Key: crypto.randomUUID()` لكل checkout)
5. خصم: **ال backend لا يقبل discount حالياً** → في v1 إزالة خانة الخصم من POS (قرار موثق: الخصم يحتاج سياسة backend — ليس frontend math). السعر = مجموع أسعار المقاعد من الـ server (seat.price)
6. Checkout: POST واحد متعدد المقاعد (DTO `seatIds[] + passengers[]` موجود) → عند نجاح: dialog تذاكر فورية (TicketPreview الموجود) + طباعة
7. تعارض المقاعد: خطأ 409/CONFLICT من الـ backend → toast عربي "بعض المقاعد التي اخترتها تم حجزها للتو" + invalidate `["trip-seats"]` — (موجود في api-error mapping، حسّن الرسالة)
8. Hold timer مرة واحدة أعلى الخريطة (seat-hold-timer.tsx موجود)
**قبول المرحلة:** بيع مقعد→تذكرة QR دون مغادرة الشاشة · hold فعلي server-side · idempotency header مُرسل · double-click على checkout لا يكرر الحجز · toast عربي عند كل نتيجة.

---
### Phase 6 — Tables & Forms (عقد البيانات)
**الهدف:** كل القوائم server-paginated + نماذج موحدة.
1. `web/src/components/ui/data-table.tsx` — رأس قابل للفرز (اختياري)، status badge، actions slot، pagination footer (page/limit على `?page=&limit=` — استجابة Backend مصفوفة مباشرة: "صفحة أقصر من limit = الأخيرة")، skeleton، empty، error
2. أضف `sonner` toast لكل mutation في features الموجودة
3. النماذج: أبقِ النمط الحالي (local state + dialog) إن كان يعمل؛ أدخل `zod` للتحقق فقط عند إنشاء نماذج جديدة — **لا تعيد كتابة نماذج تعمل** (Minimum Safe Change)
4. رحّل القوائم: bookings (use-bookings)، trips، agents، buses، drivers، expenses (finance-feature) إلى DataTable + pagination (Backend جاهز page/limit افتراضياً)
**قبول المرحلة:** لا قائمة تحمّل "كل الصفوف" · كل mutation له toast + invalidate.

---
### Phase 7 — بقية الشاشات (نفس العقد)
بالترتيب: Bookings rebuild كامل (فلاتر+بحث+dialog+إلغاء/استرداد موجودان backend) → Trips (بطاقات+جدول+إنشاء) → Buses/Fleet → Agents → Accounting UI (SetupForms موجودة — رقّم فقط + أضف Policies list basic من `GET /api/accounting/policies`) → Financial/Reports (تقارير موجودة) → Login (بصري split-screen فقط — منطق BFF cookie لا يُمس) → Boarding/Manifests (تنسيق).
**قاعدة:** شاشة تعمل = تنسيق (ADAPT). شاشة قبيحة/ضعيفة = REBUILD بعقد الصفحة. كل شيء عبر `/api/proxy/[...path]` BFF الحالي.

---
### Phase 8 — Backend Hardening (من تدقيق المرحلة السابقة)
1. **Bus/Driver overlap:** migration جديدة `add_bus_driver_overlap_guard`: CHECK/trigger يمنع رحلتين متقاطعتين زمنياً لنفس busId/driverId (مرجع SQL: `backend/prisma/v1/sql/001_contract_constraints.sql` — انقل الفكرة لا الملف) + فحص تطبيقي في `trips.service.create()` داخل transaction + اختبار SQL contract `test:db:trip-overlap` + unit test
2. **Docs sync نهائي** بعد كل ما سبق
**(لا يُلمس anything آخر في المحرك: locks/RLS/triggers/idempotency محمية — القيد الذهبي #9)**

---
### Phase 9 — اختبارات المتصفح (Playwright golden paths)
1. أضف `@playwright/test` + `web/e2e/` — خمس رحلات ذهبية: login→dashboard · POS: بيع تذكرة كاملة · bookings: بحث+إلغاء · trips: إنشاء · صلاحيات: مستخدم AGENT لا يرى ما لا يملك صلاحياته
2. `pnpm exec playwright test` في CI (`.github/workflows/ci.yml` — job جديد مع backend+postgres services)
**قبول المرحلة:** 5 specs خضراء محلياً وCI.

---
### Phase 10 — مزود الدفع (الأخيرة حصراً — بقرار المالك)
**لا يبدأ إلا بعد اكتمال 0–9 + موافقة المالك.** Adapter layer واحد لعقد موحد (Provider interface) + webhook موقّع + idempotent provider events + Payment lifecycle PENDING→COMPLETED — التصميم مسبقاً في `docs/engineering/` قبل سطر كود، ويرتبط بقرار License Perimeter (REG-005) في `docs/compliance/regulatory-register.md`.

---
## 5) Definition of Done (للمشروع كله)
- [ ] هوية ticket-master البصرية كاملة (tokens/خطوط/gradients/charts) في كل الشاشات
- [ ] RTL سليم في كل مكون (lint rule يعمل، لا physical props)
- [ ] صفر direct DB access من frontend · صفر حساب مالي في React
- [ ] Server pagination في كل قائمة · Idempotency-Key في كل حجز/إلغاء
- [ ] Backend source of truth محفوظ (RLS/locks/triggers لم تتغير سلباً — اختباراتها تمر)
- [ ] Bus/Driver overlap محجوب DB+app · Playwright golden paths خضراء
- [ ] build/lint/typecheck/tests/audits خضراء في backend+web
- [ ] مزود الدفع مكتمل (المرحلة 10) بموافقة صريحة

## 6) سجل التقدم (يُحدَّث بعد كل مرحلة — لا تحذف الأسطر المنجزة)

| المرحلة | الحالة | تاريخ | ملاحظات/ملفات |
|---|---|---|---|
| Phase 0 — Git baseline + docs sync | ✅ | 2026-09-01 | commit `60672a6` (49 ملفاً محمياً)، PROJECT_STATE/TECH_DEBT/TEST_STRATEGY مُزامنة، TD-014 → Resolved |
| Phase 1 — Design System Core | ✅ | 2026-09-01 | commit `fee2a63` — oklch tokens كاملة + Cairo/Mada + sonner + RTL lint guard + إصلاح 23 مخالفة RTL في 16 ملفاً. **مؤجل للمراحل 3-4**: ألوان teal القديمة في sidebar.tsx وwelcome-header.tsx (تُعاد كتابتها هناك) |
| Phase 2 — Component Library | ✅ | 2026-09-01 | page-header + status-badge (6 domains) + empty-state (متوافق مع الاستدعاءات القديمة) + kpi-card/DeltaPill + charts (Sparkline/RevenueAreaChart/FleetDonut/FleetRow SVG) + skeletons. كلها presentational props-only |
| Phase 3 — Shell | ✅ | 2026-09-01 | commit `1f1bde1` — sidebar فاتح بالـ tokens (شعار TICKETTY متدرج، active=gradient+glow)، header sticky blur، drawer موبايل يغلق تلقائياً عند تغيير المسار. filterNavigation/الصلاحيات لم تُمس |
| Phase 4 — Dashboard | ✅ | 2026-09-01 | backend: busCounts+avgOccupancy+upcomingTrips في `reports/dashboard` (كلها server-side)؛ web: hero متدرج + 4 KpiCard + RevenueAreaChart + FleetDonut/FleetRow + رحلات قادمة بأشرطة إشغال + refetchInterval 60s. حُذفت recharts وframer-motion |
| Phase 5 — POS | ⬜ | — | — |
| Phase 6 — Tables & Forms | ⬜ | — | — |
| Phase 7 — بقية الشاشات | ⬜ | — | — |
| Phase 8 — Backend Hardening | ⬜ | — | — |
| Phase 9 — Playwright | ⬜ | — | — |
| Phase 10 — Payment Provider | ⬜ | — | يحتاج موافقة المالك |

**آخر تحقق هندسي:** 2026-09-01 — backend: 24 suites/91 unit + 5/19 E2E + 4 SQL contracts خضراء · web: 3/10 + typecheck + lint + build خضراء · prisma valid · migrate status up-to-date (27).

## 7) أوامر التحقق القياسية (بعد كل مرحلة)
```bash
cd /home/mojahed/Downloads/ticketty/web  && pnpm lint:check && pnpm typecheck && pnpm test && pnpm build
cd /home/mojahed/Downloads/ticketty/backend && pnpm lint:check && pnpm typecheck && pnpm test --runInBand
# عند تعديل backend فقط: + pnpm test:e2e --runInBand && pnpm exec prisma validate && pnpm exec prisma migrate status
```
