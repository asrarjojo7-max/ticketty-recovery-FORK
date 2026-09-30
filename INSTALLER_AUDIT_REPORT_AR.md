# تقرير تدقيق Installer لنظام Ticketty

**المستودع:** `mogahedadamy/ticketty-recovery`  
**الفرع:** `master`  
**الالتزام المفحوص:** `2e217ae`  
**تاريخ الفحص:** 2026-09-30  
**النطاق:** `install.sh`، `ops/deployment/`، `compose.yaml`، `ops/systemd/`، `ops/monitoring/`، اختبارات النشر والتوثيق.

---

## 1. الحكم التنفيذي

الـ Installer الحالي ليس فاشلًا من ناحية الفكرة أو الهيكل، لكنه **غير متسق بين مسار التثبيت المعلن ومسار التشغيل الفعلي على الخادم**.

### الحكم

> **جاهز كتجربة تقنية على VPS تحت إشراف مباشر، وغير جاهز بعد ليُعلن عن نفسه كـ Production Installer مكتمل دون إصلاحات تشغيلية محددة.**

### التقييم العام

| البعد | التقييم |
|---|---:|
| تصميم مراحل التثبيت والاستئناف | 8/10 |
| إدارة الحالة والأسرار | 7.5/10 |
| Docker/Compose deployment | 7.5/10 |
| Cloudflare | 6.5/10 |
| Release/update safety | 6.5/10 |
| Backup/restore wiring | 3/10 |
| Monitoring/alerting wiring | 5/10 |
| قابلية العمل مع إعدادات مخصصة | 5/10 |
| جودة اختبارات السكربتات | 7.5/10 |
| **التقييم الكلي** | **6.5/10** |

أخطر نقطة ليست خطأ Bash بسيطًا، بل أن التثبيت يمكن أن يصل إلى حالة `READY` بينما لا تكون **النسخ الاحتياطية المجدولة أو المراقبة الخارجية أو الوصول العام** جاهزة فعليًا.

---

## 2. كيف يعمل المسار الحالي

المسار المعلن هو:

```text
install.sh
  ↓
/usr/local/bin/ticketty
  ↓
ticketty install
  ↓
PACKAGES → CHECKOUT → PREFLIGHT → ENV → DOMAIN
  ↓
TELEGRAM → CLOUDFLARE → COMPOSE → DEPLOY → OPS → VERIFY
```

### الملفات الأساسية

| الملف | الدور |
|---|---|
| `install.sh` | Bootstrap أولي، تثبيت Git/Curl، clone، تثبيت أوامر Ticketty |
| `ops/deployment/ticketty` | مدير التثبيت والتحديث والاستئناف والـ status والـ doctor |
| `ops/deployment/bootstrap.sh` | Bootstrap تفاعلي بديل |
| `ops/deployment/cloudflare.sh` | إعداد Cloudflare Tunnel وDNS |
| `ops/deployment/release-gate.sh` | التحقق من GitHub Release وCI |
| `ops/deployment/resource-preflight.sh` | فحص الموارد وقبول Resource Profile |
| `compose.yaml` | تشغيل PostgreSQL وBackend وWeb والمراقبة وTelegram |
| `ops/systemd/*` | وحدات systemd بديلة، لكن معظمها غير مربوط بالـ Installer الحالي |
| `ops/backup-*.sh` | النسخ والاستعادة والـ watchdog، لكنها غير مفعلة تلقائيًا |

---

## 3. المميزات الموجودة فعلًا

## 3.1 الاستئناف وإدارة المراحل

في `ticketty` توجد حالات لكل مرحلة:

```text
PENDING / RUNNING / DONE / FAILED
```

وتُخزن في:

```text
/var/lib/ticketty/deployment/state.env
```

كما أن `resume` يعيد استخدام الحالة، ويتحقق من المرحلة المنجزة قبل تجاوزها. هذه فكرة صحيحة لتقليل أثر انقطاع SSH أو فشل شبكة أثناء التثبيت.

## 3.2 قفل العمليات المتزامنة

استخدام `flock` على:

```text
/run/lock/ticketty-deploy.lock
```

يمنع تشغيل عمليتي تحديث أو تثبيت في الوقت نفسه. هذه حماية مهمة خصوصًا مع وجود Telegram Remote Ops.

## 3.3 حفظ الأسرار خارج Git

يتم إنشاء الأسرار في:

```text
/etc/ticketty/secrets/
/etc/ticketty/ticketty.env
```

مع `umask 077` وصلاحيات مقيدة. كما أن بيانات الإنتاج لا تُكتب إلى المستودع.

## 3.4 Release Gate بدل الاعتماد على master للإنتاج

مسار التحديث يستخدم GitHub Releases ويستدعي:

```text
ops/deployment/release-gate.sh
```

ويتحقق من:

- وجود Release للوسم.
- وصول tag إلى commit محدد.
- وجود GitHub Actions run.
- اكتمال CI ونجاح jobs.

هذه أفضل بكثير من `git pull` عشوائي في الإنتاج.

## 3.5 حماية الـ Migration والـ Rollback

الـ Installer لا ينفذ Database Rollback تلقائيًا بعد تطبيق migration، ويحوّل الحالة إلى:

```text
RECOVERY_REQUIRED
```

هذا قرار صحيح لنظام محاسبي؛ لأن إعادة كود قديم فوق قاعدة بيانات جديدة قد تسبب تلفًا أو عدم توافق.

## 3.6 فحص الموارد

`resource-preflight.sh` و`resource-profile.sh` يفحصان:

- RAM الفعلية أو حد cgroup.
- CPU quota.
- مساحة Docker أو القرص.
- مستوى الموارد.

كما يطلبان تأكيدًا صريحًا عند قبول الخطة، ويمنعان الطبقة المقيدة جدًا.

## 3.7 التعامل الجيد مع فشل Docker

`stack_up` يلتقط فشل:

- بناء الصور.
- تشغيل الخدمات.

ولا يطبع `Services started` بعد فشل حقيقي. اختبارات `deployment-runtime.test.sh` تثبت هذا السلوك.

## 3.8 حماية Remote Ops

خدمة `ops-server.py` تستخدم:

- Unix Socket.
- HMAC-SHA256.
- Timestamp TTL.
- Nonce لمنع Replay.
- Allowlist للعمليات.
- Plan قصير العمر.
- Audit Log.
- منع تمرير Shell أو SQL من Telegram.

هذا تصميم جيد ومناسب لمسار تشغيل حساس.

## 3.9 وجود اختبارات Installer

تم تشغيل جميع اختبارات `ops/deployment/tests/*.test.sh`، وكانت النتيجة:

```text
TEST_FAILURES=0
```

كما نجح `bash -n` للسكربتات المفحوصة.

لكن طبيعة الاختبارات مهمة: معظمها Static/Contract Tests أو محاكاة لأجزاء صغيرة، وليست تثبيتًا كاملًا على VPS نظيف مع شبكة وDocker وDNS وCloudflare ونسخ خارجي.

---

# 4. العيوب والأخطاء المؤكدة

## P0 — النسخ الاحتياطي الإنتاجي غير مربوط بالـ Installer

### الدليل

الـ Installer ينشئ:

```text
/etc/ticketty/ticketty.env
```

لكنه لا يقوم بـ:

- إنشاء `/etc/ticketty/backup.env`.
- تثبيت أو تفعيل `ticketty-backup.service`.
- تثبيت أو تفعيل `ticketty-backup.timer`.
- تثبيت أو تفعيل `ticketty-backup-watchdog.timer`.
- تثبيت `rclone`.
- إنشاء مستخدم `ticketty` المطلوب في وحدات النسخ.
- طلب `RCLONE_REMOTE` من المشغّل.
- اختبار رفع نسخة إلى الوجهة الخارجية.

تم التحقق من عدم وجود هذه العمليات داخل `ops/deployment/ticketty`:

```text
ticketty-backup.service: False
backup.env: False
systemctl enable --now ticketty-backup: False
rclone: False
```

في المقابل، `backup-nightly.sh` يعتبر `RCLONE_REMOTE` إلزاميًا ويفشل إذا لم يكن موجودًا:

```text
RCLONE_REMOTE غير مضبوط — النسخة المحلية وحدها ليست نسخة استرداد كوارث
```

### الأثر

قد ينتهي التثبيت برسالة:

```text
Installation completed
DEPLOYMENT_STATUS=READY
```

بينما لا توجد نسخة احتياطية مجدولة أصلًا. هذا يجعل إعلان الجاهزية مضللًا وخطرًا عند وجود بيانات عملاء.

### الإصلاح المطلوب

يجب اختيار أحد مسارين واضحين:

1. **ربط النسخ بالـ Installer الحالي:**
   - تثبيت rclone.
   - طلب وجهة خارجية بشكل تفاعلي أو رفض Production بدونها.
   - إنشاء `/etc/ticketty/backup.env` بصلاحيات `0600`.
   - إنشاء مستخدم `ticketty` أو تغيير الوحدات لتستخدم مستخدمًا موجودًا.
   - تثبيت وحدات systemd وتفعيل الـ timers.
   - تشغيل Backup/Restore Smoke Test.
2. **أو تغيير الرسالة رسميًا:**
   - اعتبار النسخ الاحتياطي خطوة منفصلة.
   - منع `READY` الإنتاجية إلى أن يكتمل إعداد النسخ.
   - إظهار الحالة `READY_WITH_WARNINGS` بدل `READY`.

الأفضل هو المسار الأول.

---

## P0 — المراقبة الموجودة في Compose لا تكفي وحدها، ومسار Host Monitoring غير مفعّل

المستودع يحتوي على Prometheus وAlertmanager داخل `compose.yaml`، لكن الـ Installer لا يثبت أو يفعّل:

```text
ops/systemd/ticketty-monitoring.service
```

ولا ينسخ إعداد Host Monitoring إلى:

```text
/etc/ticketty/prometheus-host.yml
/etc/ticketty/alertmanager.yml
/etc/ticketty/blackbox.yml
```

كما أن `run-host-monitoring.sh` يتوقع ملفات ومسارات لا ينشئها `ticketty install`، ويستخدم Backend على `127.0.0.1:4000` بينما مسار Compose الحالي يستخدم Backend على `3001`.

### الأثر

هناك مساران متوازيان غير موحدين:

```text
Compose Monitoring: backend:3001 / web:3000
Host Monitoring:    127.0.0.1:4000 / 127.0.0.1:3000
```

وجود ملفات المراقبة لا يضمن أن أيًا منها يعمل على الخادم.

### الإصلاح المطلوب

اختيار نمط واحد للـ Pilot:

- **Compose-first:** تشغيل Prometheus وAlertmanager من Compose، وإضافة تحقق فعلي من scrape وAlert delivery.
- **Host-systemd-first:** تثبيت الوحدات والملفات والـ exporters والمسارات المطلوبة بالكامل.

لا ينبغي إبقاء المسارين كما هما ثم إعلان أن المراقبة جاهزة.

---

## P1 — فشل الوصول العام لا يمنع إعلان التثبيت ناجحًا

في `ticketty`:

```bash
if public_health; then
  ok "Public domain"
else
  warn "Public domain is not responding yet; run ticketty doctor."
fi
```

ثم يستمر التثبيت إلى `OPS` و`VERIFY`، بينما `verify_final` يفحص الصحة المحلية فقط:

```text
127.0.0.1:<backend>/api/health/liveness
127.0.0.1:<web>/api/health/live
```

### الأثر

يمكن أن يكون:

- Tunnel متوقفًا.
- DNS غير صحيح.
- TLS أو Cloudflare غير مكتمل.
- النطاق غير قابل للوصول.

ومع ذلك تصبح الحالة:

```text
DEPLOYMENT_STATUS=READY
```

### الإصلاح المطلوب

إذا كان Cloudflare مُفعّلًا، يجب جعل `public_health` شرطًا فاشلًا للمرحلة `VERIFY`، أو وضع الحالة:

```text
READY_LOCAL_ONLY
```

أما إذا كان Cloudflare مؤجلًا، فيجب قبول غياب الفحص العام صراحةً مع حالة واضحة.

---

## P1 — `setup-cloudflare` لا يشغل نمط Cloudflare المحلي بعد الإعداد التلقائي

الإعداد التلقائي عبر Browser Authorization ينشئ:

```text
/etc/ticketty/cloudflared/config.yml
/etc/ticketty/cloudflared/<id>.json
```

لكن `cmd_setup_cf` يشغل الخدمة فقط عند وجود:

```text
$CLOUDFLARE_TOKEN_FILE
```

ولا يحتوي على فرع لتشغيل:

```text
--profile cloudflare-local
cloudflared-local
```

### الأثر

قد ينجح إنشاء Tunnel وملف `config.yml`، لكن عند تشغيل:

```bash
sudo ticketty setup-cloudflare
```

لا تبدأ خدمة `cloudflared-local`، ويظل النطاق غير متاح.

### الإصلاح المطلوب

إضافة منطق واضح:

```bash
if [[ -s "$CLOUDFLARED_DIR/config.yml" ]]; then
  docker compose ... --profile cloudflare-local up -d cloudflared-local
elif [[ -s "$CLOUDFLARE_TOKEN_FILE" ]]; then
  docker compose ... --profile cloudflare up -d cloudflared
fi
```

ويجب أن يطابق `verify_phase` و`doctor` هذا الاختيار.

---

## P1 — `doctor` يعطي نتيجة غير صحيحة لنمط Cloudflare المحلي

`cmd_doctor` يفحص Cloudflare عبر:

```bash
[[ -s "$CLOUDFLARE_TOKEN_FILE" ]] && ok Cloudflare || warn Cloudflare
```

ولا يعتبر وجود:

```text
/etc/ticketty/cloudflared/config.yml
```

إعدادًا صالحًا.

### الأثر

الإعداد التلقائي الصحيح يظهر كتحذير، بينما قد تكون الخدمة المحلية موجودة وتعمل.

### الإصلاح المطلوب

فحص أحد الشرطين:

```text
token file + cloudflared running
أو
config.yml + cloudflared-local running
```

مع التحقق من `docker compose ps` وليس من وجود الملف فقط.

---

## P1 — عدم تطابق مصدر المستودع المخصص مع مدير النشر

`install.sh` يسمح بـ:

```bash
TICKETTY_REPOSITORY_URL=...
```

ويستعمله في `git clone` أو `git fetch`.

لكن `ticketty` يستخدم افتراضيًا:

```bash
DEFAULT_REPO="https://github.com/mogahedadamy/ticketty-recovery.git"
```

ولا يقرأ `TICKETTY_REPOSITORY_URL` مباشرة. في التثبيت الجديد، يتم تخزين `REPOSITORY` داخل state من قيمة داخلية في `ticketty`، وليس بالضرورة من نفس المصدر الذي استخدمه `install.sh`.

### الأثر

عند استخدام Fork أو Repository داخلي:

- يتم clone من المصدر المخصص.
- قد يبحث Release Gate في المستودع الرسمي.
- قد تأتي التحديثات من مستودع مختلف.
- قد تختلط tags وCI بين مستودعين.

### الإصلاح المطلوب

يجب تمرير المصدر صراحةً من `install.sh` إلى `ticketty`، مثلًا عبر:

```text
TICKETTY_REPOSITORY_URL
```

أو `--repository`، ثم حفظه في state، واستخدامه في:

- `checkout`.
- `latest_json`.
- `release-gate`.
- `git fetch`.
- update/resume.

ويجب أيضًا دعم الفرع الافتراضي بدل افتراض `master`.

---

## P1 — `install.sh` يثبت أدوات bootstrap من `master` حتى في سياق إنتاجي

في حالة وجود تثبيت سابق، يقوم `install.sh` بـ:

```bash
git -C "$ROOT" fetch --force "$REPO" master
git -C "$ROOT" show FETCH_HEAD:ops/deployment/ticketty > /usr/local/bin/ticketty
git -C "$ROOT" show FETCH_HEAD:ops/deployment/bootstrap.sh > /usr/local/bin/ticketty-bootstrap
```

### المشاكل

1. يجلب `master` غير المثبت بدل Release.
2. لا يحدّث working tree داخل `$ROOT` إلى نفس النسخة.
3. يجعل `/usr/local/bin/ticketty` من نسخة، و`$ROOT/ops/...` من نسخة أخرى.
4. خدمة `ticketty-ops` قد تستخدم `ops-server.py` من نسخة مختلفة عن CLI.
5. قد يتجاوز Release Gate دون قصد.

### الأثر

Version Skew بين:

```text
/usr/local/bin/ticketty
/srv/ticketty/ops/deployment/*
/etc/systemd/system/ticketty-ops.service
```

وهذا قد يفسر سلوكًا متناقضًا عند الاستئناف أو التحديث.

### الإصلاح المطلوب

- اجعل bootstrap أداة ثابتة صغيرة لا تتغير من `master` أثناء وجود تثبيت إنتاجي.
- أو حدّث كل المكونات إلى نفس Release commit.
- لا تستخدم `master` لتحديث أدوات Production.
- بعد fetch، تحقق من commit واحد وطبّقه على جميع أجزاء النشر.

---

## P1 — سباق زمني في Release Gate بين التحقق وcheckout

`release-gate.sh` يتحقق من commit الخاص بالـ tag عبر GitHub API، ثم يعود `ticketty` إلى:

```bash
git fetch --tags --force origin
git checkout --detach "$target"
```

لكن لا تتم مقارنة commit الذي تم checkout له مع `commit_sha` الذي اجتاز Release Gate.

### الأثر

إذا تغير tag بين فحص GitHub و`git fetch`، يمكن نظريًا نشر commit مختلف عن الذي تم التحقق من CI الخاص به.

هذا احتمال منخفض، لكنه مهم في Installer إنتاجي يعتمد على tags غير محمية.

### الإصلاح المطلوب

يجب أن يعيد `release-gate.sh` الـ commit المقبول بشكل قابل للاستهلاك، ثم بعد fetch:

```bash
actual="$(git rev-parse "refs/tags/$target^{commit}")"
[[ "$actual" == "$gated_commit" ]] || die "Release tag moved after gate verification"
```

والأفضل استخدام commit SHA ثابت في checkout بعد التحقق بدل الاعتماد على tag مرة ثانية.

---

## P2 — تثبيت cloudflared إجباري حتى عند اختيار Configure Later

دالة `packages()` تثبت `cloudflared` قبل أن يصل المسار إلى مرحلة `CLOUDFLARE`، حيث يمكن للمستخدم اختيار:

```text
3) Configure later
```

### الأثر

- إبطاء التثبيت.
- إضافة اعتماد خارجي غير مطلوب.
- فشل التثبيت إذا كان مستودع Cloudflare غير قابل للوصول، رغم أن المستخدم لا يريد Cloudflare الآن.

### الإصلاح المطلوب

إما:

- تأجيل تثبيت cloudflared حتى اختيار Cloudflare فعلًا.
- أو جعل فشل تثبيته تحذيرًا إذا كان Cloudflare مؤجلًا.

---

## P2 — إعداد النسخ الاحتياطي فارغ، لكن لا توجد حالة واضحة

`write_env` ينشئ:

```text
RCLONE_REMOTE=
RCLONE_WEEKLY_REMOTE=
RCLONE_MONTHLY_REMOTE=
BACKUP_RETENTION_DAYS=0
```

وهذا مقبول كإعداد أولي فقط، لكن لا يتم عرضه كـ `BACKUP_NOT_CONFIGURED`، ولا يمنع Production Ready.

### الإصلاح المطلوب

إضافة حالة مستقلة:

```text
BACKUP_STATUS=NOT_CONFIGURED
MONITORING_STATUS=NOT_VERIFIED
PUBLIC_ACCESS_STATUS=NOT_VERIFIED
```

ويجب أن يظهر `status` و`doctor` هذه الحالات بوضوح.

---

## P2 — `doctor` لا يفحص عناصر تشغيلية حرجة

الفحص الحالي يتحقق من أشياء مثل:

- Docker.
- Compose.
- Environment.
- Telegram secret.
- Cloudflare token.
- Ops service.
- Local health.

لكنه لا يتحقق من:

- آخر Backup ناجح.
- وجود Backup Timer.
- صلاحية `RCLONE_REMOTE`.
- وصول النسخة إلى الوجهة الخارجية.
- Prometheus scrape state.
- Alertmanager routing.
- تراكم Accounting Events.
- حالة `cloudflared-local`.
- توافق Release مع commit الموثق.
- صلاحيات database runtime role.
- توفر مساحة backup.

### الإصلاح المطلوب

تحويل `doctor` من فحص وجود ملفات إلى فحص حالات تشغيلية حقيقية، مع مخرجات مثل:

```text
[OK] Backend liveness
[OK] Web liveness
[OK] Database readiness
[FAIL] Backup timer is not installed
[FAIL] No verified off-site backup
[WARN] Public domain not verified
[OK] Accounting queue depth: 0
```

---

## P2 — لا توجد فحوص كافية قبل تثبيت Docker/Compose

الفحص الحالي يركز على RAM وCPU ومساحة القرص، لكنه لا يفحص قبل التنفيذ بشكل صريح:

- المنافذ 3000 و3001 و9090 و9093.
- تعارض أسماء الحاويات.
- DNS للـ domain.
- الوصول إلى GitHub وDocker Hub وCloudflare.
- مساحة inode.
- صلاحيات `/var/lib/docker`.
- وجود swap أو ضغط الذاكرة.
- الوقت/NTP، وهو مهم للـ JWT وHMAC وCloudflare.
- firewall/security group.

### الأثر

يفشل التثبيت في مراحل متأخرة بدل إعطاء خطة واضحة قبل بدء العمليات ذات الأثر.

---

## P2 — عدم وجود Retry Policy للعمليات الشبكية

العمليات التالية تعتمد على محاولة واحدة غالبًا:

- `apt-get update`.
- `curl` إلى Docker/Cloudflare/GitHub.
- `git clone`.
- `git fetch`.
- Docker image pulls.
- Cloudflare API/CLI.

### الأثر

انقطاع مؤقت في الشبكة يترك المرحلة `FAILED` ويجبر المشغل على Resume يدويًا، وقد يترك موارد جزئية مثل repository أو Docker keyring.

### الإصلاح المطلوب

إضافة wrapper موحد:

```text
retry 5 10s 30s 60s command
```

مع تسجيل سبب الفشل، وعدم إعادة تنفيذ عمليات غير idempotent مثل إنشاء Tunnel دون فحص الحالة السابقة.

---

# 5. فجوات غير مكتملة وليست بالضرورة Bugs

## 5.1 المسار البديل systemd غير مكتمل كمنتج مستقل

الوحدات التالية موجودة في المستودع:

```text
ticketty-backend.service
ticketty-web.service
ticketty-monitoring.service
ticketty-backup.service
ticketty-backup.timer
ticketty-backup-watchdog.timer
```

لكن لا يوجد Installer يثبتها أو يهيئ كل الملفات التي تعتمد عليها.

إضافة إلى ذلك، بعض الوحدات تستخدم مسارات ثابتة:

```text
/srv/ticketty
```

حتى لو كان المستخدم قد اختار `TICKETTY_INSTALL_ROOT` مختلفًا.

**القرار المطلوب:** إما حذف المسار البديل من Installer ووثائقه، أو إكماله بالكامل مع Template/Install/Enable/Verify.

## 5.2 لا يوجد عقد واضح بين Compose Monitoring وHost Monitoring

يجب تحديد هل المراقبة:

- جزء من Compose Stack.
- أم خدمة Host مستقلة.
- أم كلاهما لكن مع اختيار صريح.

الوضع الحالي يجعل التشخيص صعبًا، خصوصًا إذا كان المستخدم يرى ملفات systemd ويتوقع أن Installer فعّلها.

## 5.3 لا يوجد اختبار VPS نظيف كامل داخل CI

الاختبارات الحالية ممتازة لتثبيت عقود السكربتات، لكنها لا تغطي بالكامل:

```text
VPS نظيف → install.sh → Docker → Compose → Domain → Backup → Alert → Restart → Resume → Update → Restore
```

ينبغي إضافة اختبار Integration/Acceptance على VM أو بيئة ephemeral قريبة من VPS.

## 5.4 لا يوجد تحقق كامل من Restore بعد التثبيت

وجود `restore-postgres.sh` و`verify-restore.sh` جيد، لكن الـ Installer لا يربطهما كـ Gate إلزامي قبل `READY`.

## 5.5 التثبيت لا يفرض استراتيجية Backup قبل بيانات العملاء

هذه فجوة في سياسة التشغيل أكثر من كونها خطأ تقنيًا، لكنها يجب أن تصبح شرطًا صريحًا.

---

# 6. أشياء لا أنصح بتغييرها عشوائيًا

هذه أجزاء جيدة ويجب الحفاظ عليها أثناء الإصلاح:

1. نموذج `Plan → Confirm → Execute → Verify`.
2. حفظ حالة كل مرحلة.
3. منع Rollback تلقائي بعد Migration.
4. استخدام Runtime Database Role محدود الصلاحيات.
5. عدم وضع الأسرار داخل Git.
6. استخدام Unix Socket وHMAC لـ Remote Ops.
7. تشغيل Backend واحد طالما Workers داخل العملية.
8. Release Gate قبل التحديث.
9. فحوص Invariants أثناء migration.
10. منع تشغيل Docker على `0.0.0.0` للمنافذ الداخلية؛ حاليًا ports مربوطة على loopback.

---

# 7. خطة الإصلاح ذات الأولوية

## المرحلة A — منع الإعلان الكاذب عن الجاهزية

1. إضافة `BACKUP_STATUS` و`MONITORING_STATUS` و`PUBLIC_ACCESS_STATUS`.
2. منع `DEPLOYMENT_STATUS=READY` إذا كان Cloudflare مفعّلًا لكنه غير قابل للوصول.
3. منع `READY` الإنتاجية إذا لم يوجد Backup خارجي ناجح.
4. تحديث `doctor` ليعطي حالات تشغيلية لا مجرد وجود ملفات.

## المرحلة B — إكمال النسخ الاحتياطي

1. تحديد وجهة rclone.
2. تثبيت rclone.
3. إنشاء مستخدم backup أو تعديل systemd units.
4. إنشاء `/etc/ticketty/backup.env`.
5. تثبيت وتمكين timers.
6. تنفيذ نسخة أولى.
7. تنفيذ `pg_restore --list`.
8. تنفيذ Restore Drill على قاعدة مؤقتة.
9. تسجيل آخر Backup في status وMetrics.

## المرحلة C — توحيد المراقبة

1. اختيار Compose أو Host Monitoring.
2. إزالة المسار غير المستخدم أو إكماله.
3. اختبار Prometheus targets.
4. اختبار Alertmanager إلى Telegram/receiver حقيقي.
5. اختبار worker stale وbackup stale.
6. جعل الفشل ظاهرًا في `doctor`.

## المرحلة D — إصلاح Cloudflare وRelease

1. إصلاح تشغيل `cloudflared-local` بعد Browser Authorization.
2. إصلاح `doctor` ليدعم token وconfig modes.
3. مقارنة commit بعد `git fetch` مع commit الذي اجتاز gate.
4. إزالة التحديث التلقائي من `master` في تثبيت Production.
5. تمرير repository/branch المخصصين إلى كل المسارات.

## المرحلة E — تحسين قابلية التشغيل

1. إضافة فحوص المنافذ وDNS وNTP والمساحة.
2. إضافة Retry/Backoff للشبكة.
3. اختبار Resume بعد قتل العملية في كل مرحلة.
4. اختبار تثبيت متكرر Idempotent.
5. اختبار update وmigration failure وforward recovery.

---

# 8. بوابة القبول المقترحة قبل إعلان Installer إنتاجيًا

لا يُسمح بعبارة `Installation completed / READY` إلا بعد نجاح:

```text
[ ] Docker Engine وCompose
[ ] Resource profile مقبول
[ ] Release commit مثبت ومتحقق
[ ] Backend liveness
[ ] Web liveness
[ ] Database readiness
[ ] Runtime DB least privilege
[ ] Cloudflare public health إن كان مفعّلًا
[ ] Prometheus scrape
[ ] Alertmanager delivery
[ ] Backup timer enabled
[ ] Off-site backup verified
[ ] Restore smoke test
[ ] Ops socket + HMAC
[ ] Resume test أو state verification
[ ] لا توجد مرحلة FAILED
```

والحالات المقترحة:

```text
READY
READY_LOCAL_ONLY
READY_WITH_WARNINGS
RECOVERY_REQUIRED
NOT_READY
```

---

# الخلاصة

الـ Installer لديه أساس ممتاز من ناحية:

- مراحل التثبيت.
- الاستئناف.
- حماية الأسرار.
- Docker deployment.
- Release Gate.
- منع Rollback غير الآمن.
- Remote Ops.

لكن المشكلات الحالية تتركز في أن **بعض مكونات الإنتاج موجودة في المستودع فقط وليست موصولة بمسار التثبيت**.

أخطر فجوة هي:

> **الـ Installer يمكن أن ينتهي كـ READY دون تثبيت Backup Timer أو التحقق من نسخة خارجية أو التأكد من وصول النطاق العام.**

لذلك قراري المهني هو:

> **لا تعِد كتابة الـ Installer كاملًا. أصلح wiring والـ readiness gates أولًا، ثم اختبره على VPS نظيف.**

الأولوية العملية:

```text
Backup wiring
  → Monitoring verification
  → Public health gate
  → Cloudflare local-mode fix
  → Release/source consistency
  → Clean VPS acceptance test
```
