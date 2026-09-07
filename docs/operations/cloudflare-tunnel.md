# Cloudflare Tunnel — تشغيل النظام على app.suda-technologies.com

**الغرض:** عرض النظام المحلي (dev servers الحية) على صب دومين حقيقي عبر HTTPS، بحيث ترى كل تغييراتك فوراً وأنت تعمل. **هذا ليس نشر إنتاج** — إنه جسر تطوير (dev preview). لنشر الإنتاج الحقيقي اتبع `deployment.md`.

## المتطلب الوحيد (مرة واحدة — يحتاج sudo)

التونل الجاري على السيرفر يُدار بواسطة systemd كـ root وكونفيجه في `/etc/cloudflared/config.yml`. أضف سطري الـ ingress التاليين **قبل** سطر `http_status:404`:

```bash
sudo nano /etc/cloudflared/config.yml
```

المحتوى النهائي يجب أن يكون:

```yaml
tunnel: 6575525c-b0ab-414d-a0b2-1c982290bfff
credentials-file: /home/mojahed/.cloudflared/6575525c-b0ab-414d-a0b2-1c982290bfff.json

ingress:
  - hostname: dashboard.suda-technologies.com
    service: http://localhost:8000
  - hostname: app.suda-technologies.com
    service: http://localhost:3000
  - hostname: api.suda-technologies.com
    service: http://localhost:4000
  - service: http_status:404
```

ثم أعد تشغيل الخدمة:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

## سجلّات DNS (تمت بالفعل — للتوثيق فقط)

أُنشئ CNAME تلقائياً (2026-09-07) عبر `cloudflared tunnel route dns`:
- `app.suda-technologies.com` → `6575525c-….cfargotunnel.com`
- `api.suda-technologies.com` → `6575525c-….cfargotunnel.com`

لا تحذفهما من لوحة Cloudflare DNS. إن حذفتهما بالخطأ أعِدهما بأمر:
`cloudflared tunnel route dns 6575525c-b0ab-414d-a0b2-1c982290bfff app.suda-technologies.com`

## تشغيل الخوادم المحلية (من جلد المشروع)

الخوادم التي يجب أن تكون حية:

```bash
# backend على :4000
cd /home/mojahed/Downloads/ticketty/backend
set -a; source .env; set +a
PORT=4000 node --enable-source-maps dist/main &

# web dev server على :3000 (التغييرات تظهر فوراً — HMR)
cd /home/mojahed/Downloads/ticketty/web
pnpm dev
```

**متغيرات البيئة للـ web** (`.env.local`):

```bash
API_BASE_URL=http://127.0.0.1:4000/api
APP_ORIGIN=https://app.suda-technologies.com
APP_ORIGIN_ALT=http://localhost:3000
```

- `APP_ORIGIN=https://app…` يجعل كوكي الجلسة `Secure` (مطلوب عبر HTTPS) ويجعل الدخول من الصب دومين موثوقاً.
- `APP_ORIGIN_ALT` يبقي الدخول من `http://localhost:3000` يعمل أيضاً أثناء التطوير المحلي.
- الكود يدعم هذا كله بعد commit `e0743f1` (لا حاجة لأي تغيير إضافي).

> ملاحظة HMR: تغييرات **ملفات web فقط** تظهر فوراً. تغييرات **backend** تحتاج `pnpm build` ثم إعادة تشغيل `dist/main` (لا يوجد watch في الـ dist). للتطوير السريع للـ backend شغّل `pnpm start:dev` بدل الـ dist.

## فحوصات التحقق

بعد تعديل الكونفيج وإعادة التشغيل:

```bash
# 1) الصفحة تفتح عبر HTTPS
curl -fsS https://app.suda-technologies.com/ -o /dev/null -w "%{http_code}\n"   # 200

# 2) صحة الـ backend عبر التونل
curl -fsS https://api.suda-technologies.com/api/health/liveness                  # {"status":"ok"}

# 3) الدخول من المتصفح: https://app.suda-technologies.com
#    سجّل الدخول بمستخدمك — يجب أن تصل للـ dashboard.
```

## الأمان (مقروء بتمعن)

- الكوكي `ticketty_session` هو `HttpOnly + Secure + SameSite=Lax` عبر التونل.
- فحص Origin في `/api/session` و`/api/proxy` يقبل `APP_ORIGIN` و`APP_ORIGIN_ALT` فقط — أي موقع آخر مرفوض (403).
- **لا تضع سرّ الإنتاج في هذا التونل**: هذا التونل يعرض dev server. أي زائر يعرف الرابط يرى شاشة الدخول — استخدم كلمات مرور حقيقية للمستخدمين، ولا تشغّل `db:seed-demo` ببيانات وهمية إن كان الرابط سيتشارك.
- `api.suda-technologies.com` معرّض مباشرة عبر التونل (للفحص فقط). لو لن تستخدمه، احذف سطره من الكونفيج — كل حركة التطبيق تمر عبر `/api/proxy` داخل نفس أصل `app.`، ولا يحتاج المتصفح الوصول المباشر للـ API.

## استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| 403 «طلب غير موثوق» عند الدخول | تأكد أن `APP_ORIGIN=https://app.suda-technologies.com` في `web/.env.local` وأن الـ dev server أعيد تشغيله بعده |
| 530 / 1033 من Cloudflare | التونل لا يعمل: `sudo systemctl status cloudflared` وراجع `journalctl -u cloudflared -n 50` |
| الكوكي لا يُقبل (الدخول يفشل بصمت) | تأكد أن `APP_ORIGIN` **https** وليس http (الـ Secure cookie لا يُحفظ على http) |
| الصفحة تفتح والبيانات لا تحمل | الـ backend على :4000 غير حي — راجع فحص 2 أعلاه |

## لماذا ليس نشر إنتاج؟

هذا التونل يخدم **سيرفر التطوير من جهازك** — سرعتك وجودته تعتمدان على جهازك واتصالك، ويتوقف عند إيقاف الجهاز. للنشر الحقيقي اتبع `deployment.md` (Compose على سيرفر + نفس التونل يشير إلى الخدمات المنشورة بدل dev ports).
