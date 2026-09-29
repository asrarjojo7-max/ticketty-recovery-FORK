# Ticketty ERP

منصة تشغيل وإدارة النقل والحجوزات والمدفوعات، مصممة لتعمل على VPS مع دورة نشر قابلة للاستئناف، آمنة، وقابلة للتدقيق.

## التثبيت على VPS — أمر واحد

لا تحتاج إلى إعداد المشروع يدويًا أو تشغيل مجموعة أوامر Docker وPostgreSQL.

على خادم Linux جديد، نفّذ **هذا الأمر الوحيد**:

```bash
curl -fsSL https://raw.githubusercontent.com/asrarjojo7-max/ticketty-recovery-FORK/master/install.sh | sudo bash
```

بعد ذلك يبدأ معالج Ticketty تلقائيًا ويقوم بفحص الخادم ثم يمر بمراحل التثبيت المطلوبة.

> **ملاحظة:** أمر الـInstaller الحالي يعتمد على مستودع التطوير المعتمد في هذا الخط:
> `asrarjojo7-max/ticketty-recovery-FORK`.
> يمكن تغيير المصدر باستخدام `TICKETTY_REPOSITORY_URL` عند الحاجة.

## ماذا يفعل الأمر؟

الـInstaller هو Bootstrap واحد لنظام النشر بالكامل. بحسب حالة الخادم، يقوم تلقائيًا بـ:

1. التحقق من صلاحيات root وتوفير أدوات النظام المطلوبة.
2. اكتشاف ما إذا كان Ticketty مثبتًا بالفعل.
3. تثبيت أو التحقق من Git وDocker وDocker Compose والأدوات اللازمة.
4. جلب كود Ticketty والتحقق من حالة مستودع الخادم.
5. فحص CPU وRAM والقرص وقيود cgroups والموارد المتاحة، ثم بناء خطة موارد مناسبة.
6. إنشاء بيئة الإنتاج والأسرار مرة واحدة فقط عند الحاجة.
7. الحفاظ على الأسرار والإعدادات والبيانات الموجودة عند إعادة التشغيل.
8. إعداد الدومين وTelegram وCloudflare حسب الإعداد الذي تختاره في المعالج.
9. التحقق من Docker Compose وتشغيل الخدمات.
10. إعداد Remote Operations على Unix Socket مع HMAC وقيود وصول.
11. تنفيذ فحوص الصحة النهائية والتأكد من جاهزية النظام.

## ماذا يحدث في أول تثبيت؟

في أول تشغيل، سيطلب منك المعالج فقط المعلومات التي لا يمكنه معرفتها تلقائيًا، مثل:

- الدومين الذي سيستخدمه Ticketty.
- Telegram Bot Token.
- إعداد Cloudflare أو تأجيله.
- بعض خيارات البيئة اللازمة للتثبيت.

لا تحتاج إلى إنشاء ملفات secrets يدويًا أو تشغيل migrations يدويًا أو تشغيل Docker Compose بنفسك.

بعد اكتمال التثبيت، يعرض Ticketty رمز ربط Telegram على الخادم لاستخدامه في المحادثة الخاصة مع البوت.

## ماذا يحدث عند وجود نسخة قديمة؟

يمكنك إعادة تشغيل **نفس الأمر نفسه** على الخادم.

لن يبدأ Ticketty من الصفر.

إذا اكتشف الـInstaller تثبيتًا سابقًا مكتملًا، فإنه:

1. يكتشف حالة التثبيت الحالية.
2. يحافظ على `/etc/ticketty` والأسرار وبيانات PostgreSQL وDocker volumes وحالة Telegram.
3. يفحص أحدث GitHub Release المتاح.
4. إذا لم توجد نسخة أحدث، يخبرك أن النظام محدث.
5. إذا وجدت نسخة أحدث، يدخل في مسار التحديث الآمن.
6. يأخذ Backup قبل التحديث.
7. يتحقق من Release Gate.
8. يطبق migrations المطلوبة بالطريقة forward-only.
9. يشغّل الإصدار الجديد.
10. يتحقق من Backend وWeb والخدمات وRemote Operations.
11. يسجل حالة النشر والإصدار والـmigration.

وبذلك يصبح السيناريو الأساسي:

```text
الأمر نفسه
    ↓
تثبيت جديد؟
    ├─ نعم → تثبيت ذكي كامل
    └─ لا → فحص الحالة
              ↓
         هل يوجد Release أحدث؟
              ├─ لا → النظام محدث
              └─ نعم → Backup → Migration → Deploy → Health Check
```

## الاستئناف بعد انقطاع أو فشل

التثبيت مصمم ليكون Resumable.

إذا انقطع الاتصال أو توقف الخادم أثناء إحدى المراحل، يحتفظ Ticketty بحالة كل مرحلة ويعيد استخدام ما اكتمل بنجاح بدل إعادة إنشاء كل شيء.

يمكن متابعة العملية يدويًا بالأمر:

```bash
sudo ticketty resume
```

## أهم أوامر التشغيل

بعد التثبيت، تبقى أوامر الإدارة متاحة على الخادم:

```bash
sudo ticketty status
sudo ticketty doctor
sudo ticketty update
sudo ticketty rollback --confirm
```

- `status` يعرض الإصدار والدومين وحالة النشر وRemote Operations.
- `doctor` يفحص Docker والبيئة والأسرار وCloudflare وRemote Operations وصحة التطبيق.
- `update` يبحث عن أحدث Release ويطبق مسار التحديث الآمن.
- `rollback` يسمح بالعودة إلى الإصدار السابق فقط عندما تكون شروط السلامة متحققة؛ لا ينفذ rollback لقاعدة البيانات.

## قاعدة مهمة للتحديثات

Ticketty لا يعيد إنشاء الأسرار أو قاعدة البيانات لمجرد إعادة تشغيل الـInstaller.

كما أن migrations قاعدة البيانات forward-only، ولا يوجد rollback تلقائي لقاعدة البيانات.

إذا حدث فشل بعد تطبيق migration، تتحول الحالة إلى:

```text
RECOVERY_REQUIRED
```

ويتم منع أي رجوع تلقائي قد يؤدي إلى عدم توافق بين التطبيق وقاعدة البيانات.

## بنية النظام

- **Backend:** NestJS + Prisma + PostgreSQL.
- **Web:** Next.js + Arabic RTL.
- **Deployment Manager:** Installer + lifecycle state + release gate + resource planner.
- **Remote Operations:** Unix Socket + HMAC + nonce/timestamp validation.
- **Telegram Operations Assistant:** أوامر عربية، pairing، status، alerts، update، rollback.
- **Monitoring:** Prometheus + Alertmanager + Telegram delivery.
- **Cloudflare:** Tunnel وDNS provisioning مع تحقق من الوصول العام.

## الأمان وحماية البيانات

- الأسرار تحفظ في ملفات محمية خارج مستودع Git.
- إعادة التثبيت لا تعيد إنشاء الأسرار الموجودة.
- لا يحتاج نشر VPS إلى GitHub PAT أو صلاحية push.
- عمليات Telegram الحساسة تمر عبر allowlist وتأكيد صريح.
- Remote Operations محمي بالتوقيع HMAC وUnix Socket.
- تحديثات الإنتاج تمر عبر Release Gate وBackup قبل النشر.
- لا يتم تنفيذ Database Rollback تلقائيًا.

## المتطلبات

الـInstaller يدعم التثبيت التلقائي على توزيعات Debian/Ubuntu التي يستخدمها Ticketty لهذا المسار.

يفضل تشغيله على VPS نظيف، مع اسم نطاق متاح عند إعداد الوصول العام.

## بعد التثبيت

يمكنك التأكد من الحالة بالأمر:

```bash
sudo ticketty status
```

والفحص التشخيصي بالأمر:

```bash
sudo ticketty doctor
```

ثم يتم التعامل مع العمليات المستقبلية من خلال نفس Ticketty Deployment Manager وواجهة Telegram Operations Assistant.

## التشغيل المحلي للتطوير

للتطوير المحلي، راجع بنية المشروع وأدلة الهندسة داخل `docs/`.

يظل التشغيل المحلي منفصلًا عن مسار نشر VPS، لأن Deployment Manager مصمم لإدارة بيئة الخادم والإصدارات وحالة النشر والـsecrets والنسخ الاحتياطية.

## مبدأ التصميم

Ticketty مصمم على أساس:

```text
Plan → Confirm → Execute → Verify
```

مع الحفاظ على:

```text
Idempotency
Resumability
Data Integrity
Least Privilege
Auditability
Forward-only Migrations
```
