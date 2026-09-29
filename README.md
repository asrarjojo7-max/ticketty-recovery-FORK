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

## دورة نشر Ticketty

التثبيت والاستئناف والتحديث والترحيل تعمل بحالة محفوظة على الخادم، مع الحفاظ على الأسرار والبيانات الموجودة. قبل أي Release يتم التحقق من بوابة الإصدار ونسخة احتياطية قبل النشر.

في حال فشل migration أو فشل تشغيل/فحص الإصدار الجديد بعد migration، لا ينفذ النظام rollback تلقائيًا للكود أو قاعدة البيانات؛ يسجل الحالة `RECOVERY_REQUIRED` لمنع إخفاء عدم توافق محتمل بين التطبيق وقاعدة البيانات.

أمر `rollback` مخصص للعودة إلى آخر إصدار مسجل عندما يكون آخر تحديث **لم يطبق migration**. يتطلب تأكيدًا صريحًا ويعيد فحص Release Gate قبل التنفيذ. لا يقوم الأمر بأي rollback لقاعدة البيانات.

الأوامر الرئيسية:

```bash
sudo ticketty status
sudo ticketty update --plan
sudo ticketty update
sudo ticketty rollback --confirm
sudo ticketty doctor
```
