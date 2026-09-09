# Deployment Runbook

## Scope

The included Compose stack is a reproducible single-host baseline, not a high-availability architecture. Terminate TLS at a trusted reverse proxy and expose only the web service publicly.

## Prerequisites

- Docker Engine with Compose v2.
- DNS/TLS and an external secret-management process.
- A reviewed release commit/tag.

## Prepare configuration

```bash
cp .env.production.example .env
openssl rand -base64 48
```

Put the generated value in `JWT_SECRET`, replace the database password, and set the canonical HTTPS `WEB_ORIGIN`. Never commit `.env`.

Changing JWT issuer, audience, or secret invalidates existing sessions and requires a coordinated forced login.

## Build and deploy

```bash
docker compose config
docker compose build --pull
docker compose run --rm migrate
docker compose up -d
docker compose ps
```

Migrations run as a one-shot release task. Never run demo seed commands in production and do not run migrations independently in every backend replica.

## Smoke checks

```bash
curl -fsS http://127.0.0.1:3001/api/health/liveness
curl -fsS http://127.0.0.1:3001/api/health/readiness
curl -fsS http://127.0.0.1:3000/api/health/live
curl -fsS http://127.0.0.1:3000/api/health/ready
```

Readiness must succeed before routing traffic. Monitor application logs during the first operational transaction.

## Rollback

1. Stop traffic to the affected release.
2. Preserve logs and take a database backup.
3. Redeploy the previous immutable image/tag.
4. Database migrations are forward-only by default. Do not attempt destructive rollback without a reviewed migration-specific recovery plan.
5. Run all smoke checks, then restore traffic gradually.

## Release gates

- CI is green, including PostgreSQL E2E and SQL integrity contracts.
- No unaccepted High/Critical dependency advisory.
- Backup and scratch restore have been tested for the release window.
- Migration impact and rollback strategy are reviewed.
- Metrics, alerts, and operator ownership are configured in the target environment.

---

## TRUST_PROXY_HOPS — الطوبولوجيا والقيمة النهائية (Go-Live Gate: S-2)

### الطوبولوجيا الفعلية للنشر

```
Client (متصفح التذكرة)
  → Cloudflare edge (TLS, IP العميل الحقيقي معروف هنا)
  → cloudflared daemon (على الخادم — الوكيل الموثوق الوحيد،
     يضيف عمود X-Forwarded-For واحدًا بقيمة IP عميل Cloudflare)
  → backend :3001 (compose، منضبط 127.0.0.1)
```

لا يوجد وكيل آخر بينهما (compose يربط 127.0.0.1 والنفق يوجّه
إليه مباشرة). **القيمة الصحيحة: `TRUST_PROXY_HOPS=1`** (هي الآن
الافتراضية في `compose.yaml` و`.env.production.example`).

### لماذا 1 بالضبط (سلوك Express 5 «trust proxy N»)

يُعتمد **آخر N أعمدة** في سلسلة X-Forwarded-For كموثوقين، والعمود
الواقف عند النقطة N-1 من النهاية هو IP العميل المُدرَك:

- `0` — تُتجاهل الترويسة كليًا: لا تزوير ممكن، **لكن** كل مستخدمي
  النفق يظهرون بـ IP واحد (socket الداخلي) → خنق الدخول 5/min
  **للشركة كلها مجتمعة**.
- `1` — يُصدَّق العمود الذي أضافه cloudflared فقط = **IP عميل
  Cloudflare الحقيقي**. ما يرسله العميل بنفسه من أعمدة مزيفة
  يبقى قبل العمود الموثوق ويُتجاهل.
- `2+` — يُعامل العميل نفسه كوكيل موثوق في السلسلة → **تزوير
  كامل للـ throttle** (العميل يوزع نفسه على IPs وهمية).

### الإثبات المُنفّذ (2026-09-09 — تجارب فعلية لا استنتاج)

1. **مصفوفة تجريبية على Express 5.2.1** (نفس express@5.2.1 الذي
   يعمل به الـ backend): طلب مباشر بترويسة مزيفة
   `X-Forwarded-For: 1.2.3.4, 5.6.7.8`:
   | hops | IP المُدرَك من التطبيق | الدلالة |
   |---|---|---|
   | 0 | 127.0.0.1 (الترويسة مُتجاهلة) | لا تزوير لكن تجميع |
   | 1 | **5.6.7.8** (آخر عمود — من الوكيل الموثوق) | الصواب |
   | 2 | 1.2.3.4 (**ترويسة العميل المزيفة صُدّقت!**) | تزوير |
   | 3 | 1.2.3.4 (تزوير) | تزوير |
2. **محاكاة throttle كاملة بـ hops=1**: عميل أرسل 6 IPs مزيفة
   مختلفة عبر وكيل واحد موثوق → التطبيق رأى دائمًا IP الوكيل
   الموثوق؛ **429 عند السادسة** — التزوير فاشل والعد سليم.
3. **عبر النفق الحقيقي** (`api.suda-technologies.com` على hops=0
   الحالي): 6 محاولات دخول خاطئة متتالية بـ XFF مزيفة مختلفة
   كل مرة → **401×5 ثم 429** — الترويسة المزيفة لم تُصدَّق
   (لكن لاحظ التجميع: كل الطلبات عدّت كعميل واحد).
4. **سلوك النفق نفسه**: نفس الطلبات عبر النفق بلا ترويسات →
   401×5 ثم 429 — throttle يعمل عبر النفق فعليًا.

### عند تغيّر الطوبولوجيا

أي وكيل إضافي (Caddy/nginx وسيط مثلًا) = +1 لكل طبقة تضيف
عمود XFF. أعد التجربة (السكربت التجريبي موثق أعلاه) ولا تخمّن.
**لا تستخدم أبدًا قيمة أعلى من عدد الوكلاء الفعليين** — الفارق
بين N وN+1 هو بالضبط الفرق بين «لا تزوير» و«تزوير كامل».

### ملاحظة dev

خوادم dev المحلية (بلا نفق) تعمل بـ 0 (افتراضي بلا بيئة) —
صحيح للاختبارات المحلية: كل طلب من 127.0.0.1. إعدادات النفق
التطويري (`cloudflare-tunnel.md`) جسر معاينة فقط — للنشر الحقيقي
هذا القسم هو المرجع.
