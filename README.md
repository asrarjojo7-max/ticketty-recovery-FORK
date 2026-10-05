# Ticketty ERP

منصة تشغيل وإدارة النقل والحجوزات والمدفوعات، مبنية لتتوسع من نظام تذاكر إلى بنية تشغيل ومالية وامتثال قابلة للتدقيق.

## المكونات

- `backend/` — NestJS + Prisma + PostgreSQL API.
- `web/` — Next.js Arabic RTL web application.
- `docs/` — المبادئ الهندسية ومرجعية الامتثال.

## التشغيل المحلي

1. انسخ `backend/.env.example` إلى `backend/.env` واضبط القيم السرية وقاعدة البيانات.
2. طبّق ترحيلات قاعدة البيانات ثم أنشئ الحساب الأول:

```bash
cd backend
pnpm install
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm start:dev
```

3. في طرفية أخرى شغّل الواجهة:

```bash
cd web
cp .env.example .env.local
pnpm install
pnpm dev
```

- الواجهة: `http://localhost:3000`
- الـ API: `http://localhost:3001/api`

## ضوابط مهمة

- رمز JWT محفوظ في Cookie من نوع `HttpOnly` من خلال طبقة BFF في Next.js، ولا يُخزّن في Local Storage.
- الصلاحيات وحالة المستخدم والمؤسسة يعاد التحقق منها Server-side في كل طلب محمي.
- لا تستخدم بيانات الاعتماد التجريبية في بيئة إنتاج.
- راجع `docs/engineering-principles.md` و`docs/compliance/` قبل اعتماد أي Feature.
