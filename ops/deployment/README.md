# Ticketty Deployment Manager

طبقة النشر الجديدة تجعل Ticketty قابلاً للتثبيت والاستئناف والتحديث والنقل بين خوادم مختلفة دون إعادة بناء كل شيء من الصفر.

## الأوامر

```bash
sudo ticketty
sudo ticketty install
sudo ticketty resume
sudo ticketty update
sudo ticketty update --plan
sudo ticketty status
sudo ticketty doctor
sudo ticketty setup-cloudflare
```

## فلسفة التشغيل

- GitHub هو مصدر الكود فقط. لا يوجد `git push` من Installer ولا GitHub write credential على السيرفر.
- حالة النشر والأسرار والبيانات تبقى على السيرفر أو في النسخ الاحتياطية المحمية.
- كل مرحلة تسجل `PENDING/RUNNING/DONE/FAILED` في `/var/lib/ticketty/deployment/state.env`.
- إعادة `ticketty resume` تعيد فقط المراحل غير المكتملة وتتحقق من الحالة الفعلية قبل المتابعة.
- التحديثات الإنتاجية مبنية على GitHub Releases/tags وليس على `master`.
- قبل أي تحديث توجد نسخة PostgreSQL احتياطية محلية مع checksum.
- فشل التطبيق أو health checks يعيد كود التطبيق إلى الإصدار السابق؛ migrations لا تُعكس تلقائيًا.

## Cloudflare

الـWizard يدعم:

1. Tunnel موجود مسبقًا: الصق Tunnel Token مرة واحدة.
2. API-managed: Token محدود الصلاحيات + Account ID + Zone ID لإنشاء Tunnel وضبط hostname وDNS.

عند وجود Tunnel token يشغل Compose خدمة `cloudflared` من profile `cloudflare`، ويتم إجراء فحص HTTP عام على `https://<hostname>/api/health/live` بعد النشر.

## Telegram Remote Operations

Telegram ليس Shell.

القناة بين Telegram Assistant وHost Deployment Manager هي Unix socket فقط:

```text
/run/ticketty/ops.sock
```

والعمليات المسموحة حاليًا:

- `STATUS`
- `PLAN_UPDATE`
- `CANCEL_PLAN`
- `EXECUTE_UPDATE`
- `OPERATION_STATUS`

كل طلب داخلي:

- HMAC-SHA256
- timestamp مع نافذة صلاحية قصيرة
- nonce لمنع replay
- request ID
- audit trail

التحديث البعيد لا يستقبل release ref من الرسالة مباشرة. السيرفر ينشئ plan ID قصير العمر، ثم زر Telegram يرسل plan ID فقط.

## النقل إلى VPS جديد

الهدف التشغيلي:

```text
VPS جديد
  ↓
ticketty install
  ↓
domain + Cloudflare + Telegram
  ↓
restore backup
  ↓
release
  ↓
health + verification
```

المرحلة التالية ستضيف bundle/profile رسميًا لنقل الإعدادات غير السرية واستعادة قاعدة البيانات بصورة قابلة للتكرار.

## ملاحظات أمان

- لا تستخدم أسرارًا حقيقية من `.env.production.example`.
- Cloudflare API token لا يُحفظ بعد provisioning.
- أسرار Telegram/ops/tunnel موجودة في `/etc/ticketty/secrets` بصلاحيات مقيدة.
- لا يتم تنفيذ restore لقاعدة الإنتاج من زر Telegram في هذا الإصدار.