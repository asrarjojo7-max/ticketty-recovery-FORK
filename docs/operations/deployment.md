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

Put the generated value in `JWT_SECRET`, replace both database passwords, and set the canonical HTTPS `WEB_ORIGIN` and `APP_ORIGIN`. Never commit `.env`.

Database credentials are deliberately split:

- `MIGRATION_DATABASE_URL` uses the PostgreSQL bootstrap/admin identity and is injected only into the one-shot `migrate` service.
- `RUNTIME_DATABASE_URL` uses the fixed `ticketty_runtime` login, which is `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT`, owns no application objects, and has no direct table grants.
- `RUNTIME_DATABASE_PASSWORD` is consumed by `pnpm db:provision-runtime` in the migration job to create/rotate that login and grant only the audited `ticketty_app`, `ticketty_auth`, `ticketty_platform`, and `ticketty_accounting_worker` memberships.

Use separately generated passwords. If either contains URL-reserved characters, percent-encode it in its URL. Never provide `MIGRATION_DATABASE_URL` to the backend service. Backend startup in `NODE_ENV=production` fails closed unless the session identity is the least-privilege `ticketty_runtime` role.

Changing JWT issuer, audience, or secret invalidates existing sessions and requires a coordinated forced login. Production rejects JWT lifetimes above one hour and rejects a non-HTTPS browser origin; the supplied baseline is 15 minutes.

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
  → Cloudflare edge (TLS، يكتب CF-Connecting-IP الموثوق)
  → cloudflared daemon
  → web/BFF :3000 (يُسقط X-Forwarded-For القادم من العميل ويكتب
     X-Forwarded-For من CF-Connecting-IP بعد التحقق أنه IP)
  → backend :3001 (compose، منضبط 127.0.0.1)
```

الـ backend لا يتصل به العميل مباشرة؛ الوكيل المباشر الوحيد أمامه هو
web/BFF. **القيمة الصحيحة: `TRUST_PROXY_HOPS=1`** (هي الآن الافتراضية
في `compose.yaml` و`.env.production.example`). يجب أن يبقى منفذ web
مربوطًا بالـ loopback وألا توجد قناة عامة تتجاوز Cloudflare، لأن سلامة
`CF-Connecting-IP` تعتمد على أن Cloudflare هو من يستبدلها.

### لماذا 1 بالضبط (سلوك Express 5 «trust proxy N»)

الـ BFF لا يمرر `X-Forwarded-For` القادم من المتصفح. يأخذ فقط
`CF-Connecting-IP` الذي تستبدله Cloudflare، يتحقق أنه عنوان IP، ثم يكتب
سلسلة من عنصر واحد إلى الـ backend. لذلك يثق Express في وكيل واحد فقط:

- `0` — يتجاهل عنوان العميل ويجمع الجميع على عنوان حاوية web.
- `1` — يقرأ عنوان العميل الوحيد الذي أعاد الـ BFF بناءه.
- `2+` — غير مطلوب لهذه الطوبولوجيا ويوسع سطح الثقة بلا داعٍ.

### الإثبات المُنفّذ (2026-09-12)

عبر نسخة production محلية من web/BFF والـ backend مع `TRUST_PROXY_HOPS=1`:

1. العميل A بعنوان `CF-Connecting-IP: 203.0.113.10` تلقى
   `401×5` ثم `429`.
2. العميل B بعنوان مختلف تلقى `401` ولم يرث حصة A.
3. ست محاولات غيّرت `X-Forwarded-For` فقط بلا CF header بقيت في حصة
   واحدة وأعادت `429` في السادسة؛ أي أن ترويسة المتصفح المزيفة لا تُمرر.

أعد هذه التجربة من خارج النفق عند كل تغيير لطوبولوجيا الحافة.

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
