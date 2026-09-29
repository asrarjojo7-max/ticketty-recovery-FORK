# Ticketty Production Deployment Runbook

هذه الوثيقة تصف المسار المعتمد للتثبيت والتحديث ونقل Ticketty بين VPS جديد دون إعادة تهيئة البيانات أو الأسرار الموجودة على السيرفر القائم.

## 1. تثبيت VPS جديد

```bash
git clone https://github.com/mogahedadamy/ticketty-recovery.git /srv/ticketty
cd /srv/ticketty
sudo install -m 0755 ops/deployment/ticketty /usr/local/bin/ticketty
sudo ticketty install
```

يفحص Installer الموارد والمتطلبات، ينشئ الأسرار محليًا، يسأل عن الدومين وTelegram وCloudflare، يشغّل Compose، ثم يثبت Remote Operations.

إذا انقطعت جلسة SSH أو فشلت مرحلة:

```bash
sudo ticketty resume
```

المراحل المكتملة لا يعاد تنفيذها بلا تحقق.

## 2. أول ربط Telegram

بعد نجاح التثبيت يعرض Installer pairing code. يرسل المشغّل:

```text
/start <PAIRING_CODE>
```

الـpairing متاح من محادثة خاصة مع البوت فقط. لا تنشر code في مجموعة أو قناة.

## 3. Cloudflare

يفضل استخدام Tunnel موجود أو API Token محدود الصلاحيات. لا تستخدم Global API Key.

يمكن إعادة تشغيل:

```bash
sudo ticketty setup-cloudflare
```

ثم يتحقق Installer من الدومين العام عبر health endpoint.

## 4. قبل تحديث الإنتاج

لا تستخدم `git pull` إلى الإنتاج كعملية نشر رسمية.

الإصدار الإنتاجي يجب أن يكون GitHub Release مع Git tag. `release-gate.sh` يحدد commit الوسم ويتحقق من أحدث تشغيل CI على نفس commit وأن جميع jobs ناجحة.

يمكن فحص الإصدار يدويًا:

```bash
sudo ticketty gate v2026.10.01
```

ثم:

```bash
sudo ticketty update
```

يأخذ التحديث نسخة PostgreSQL احتياطية قبل migration.

## 5. Telegram update

من Telegram:

```text
هل يوجد تحديث؟
```

إذا وجد Release، ينشئ السيرفر خطة قصيرة العمر. زر التنفيذ يرسل plan ID فقط. لا يتم تمرير shell command أو release ref من Telegram.

## 6. Migration منفصل

```bash
sudo ticketty migrate
```

أو من واجهة القائمة التفاعلية.

التنفيذ يستخدم خدمة Compose `migrate` ثم يعود بنجاح أو فشل صريح. لا يتم عكس migrations تلقائيًا.

## 7. نقل السيرفر

على السيرفر القديم:

```bash
sudo ticketty profile-export /var/lib/ticketty/deployment/ticketty-profile.json
sudo ticketty transfer-export /secure/ticketty-transfer.tar.gz
```

انقل profile/bundle وقاعدة البيانات الاحتياطية عبر قناة آمنة.

على السيرفر الجديد:

```bash
sudo ticketty transfer-import /secure/ticketty-transfer.tar.gz
sudo ticketty install
```

الـbundle لا يحتوي الأسرار ولا قاعدة البيانات. يتحقق `transfer-import` من checksum، ويطبق profile غير السري تلقائيًا ويحفظ release المصدر دون نسخ هوية الخادم. أدخل Telegram/Cloudflare secrets بشكل منفصل أو استخدم مسار إدارة الأسرار المعتمد.

بعد استعادة database على السيرفر الجديد، شغّل migrations والتحقق قبل فتح المرور العام.

## 8. الفحص

```bash
sudo ticketty status
sudo ticketty doctor
```

يجب أن تكون Backend وWeb وRemote Operations وCompose configuration سليمة قبل اعتبار النشر جاهزًا.

## 9. قاعدة أمان

GitHub يبقى مصدر الكود وRelease artifacts. السيرفر يملك runtime state وsecrets وdatabase. لا توجد GitHub write credentials داخل Deployment Manager.