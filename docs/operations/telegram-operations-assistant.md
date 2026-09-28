# Ticketty Telegram Operations Assistant

## 1. الهدف

إضافة واجهة تشغيل وإدارة عبر Telegram فوق طبقة المراقبة الحالية، بحيث يستطيع المشغّل معرفة حالة Ticketty بسرعة باللغة العربية الطبيعية، واستلام التنبيهات بصياغة بشرية، ثم تنفيذ مجموعة محددة من الإجراءات التشغيلية بعد تأكيد صريح.

هذه الميزة لا تستبدل لوحة التحكم ولا تمنح Telegram وصولًا عامًا إلى REST API أو قاعدة البيانات.

## 2. نقطة البداية

الفرع مبني من:

- `FORK/master`
- commit: `ebf81d70062a75bc3ae79e54143ceff55233a201`

الـmaster نفسه لا يُعدّل مباشرة.

## 3. ما هو موجود مسبقًا

طبقة المراقبة الأساسية موجودة بالفعل في المشروع:

- Prometheus
- Alertmanager
- postgres-exporter
- node-exporter
- blackbox-exporter
- مقاييس backend
- قواعد تنبيه عربية
- webhook receiver path

لذلك التنفيذ الجديد يجب أن يبني فوق هذه الطبقة، لا أن يعيد بناءها.

## 4. المعمارية المعتمدة

```
                    ┌─────────────────────┐
                    │       Telegram      │
                    │  chat / notifications│
                    └──────────┬──────────┘
                               │
                    HTTPS / Bot API
                               │
                  ┌────────────▼────────────┐
                  │ Telegram Operations     │
                  │ Assistant               │
                  │                         │
                  │ - authentication        │
                  │ - Arabic intent parser  │
                  │ - alert formatter       │
                  │ - confirmation engine   │
                  │ - command allowlist     │
                  │ - audit correlation      │
                  └──────┬───────────┬──────┘
                         │           │
            alert webhook │           │ signed internal request
                         │           │
                  ┌──────▼───┐   ┌───▼─────────────────┐
                  │Alertmanager│   │ Ticketty Backend   │
                  └──────────┘   │ dedicated Ops API   │
                                 └────────┬────────────┘
                                          │
                                      existing
                                   business services
                                          │
                                      PostgreSQL
```

## 5. قاعدة أمنية رئيسية

المساعد لا ينفذ أوامر shell، ولا يستقبل SQL، ولا يمرر طلبات عامة إلى `/api/proxy`, ولا يقبل مسارات أو أسماء methods من رسالة Telegram.

كل طلب يتحول أولًا إلى عملية داخل قائمة ثابتة، مثل:

- `SYSTEM_STATUS`
- `ACCOUNTING_STATUS`
- `QUEUE_STATUS`
- `BACKUP_STATUS`
- `RECENT_INCIDENTS`
- `DAILY_SUMMARY`

والإجراءات التشغيلية اللاحقة تكون قائمة ثابتة أيضًا، مثل:

- `RETRY_FAILED_ACCOUNTING`
- `RUN_BACKUP_CHECK`
- `RESTART_ACCOUNTING_WORKER`

ولا ينفذ أي إجراء حساس إلا بعد تأكيد صريح.

## 6. المصادقة

المرحلة الأولى تسمح فقط بالحسابات/المحادثات التي تمت إضافتها إلى allowlist في إعدادات التشغيل.

الربط المقترح:

- Telegram chat ID
- Telegram user ID عندما يتوفر
- اسم المالك/المشغّل
- حالة الحساب: active/revoked

يجب أن يكون إلغاء صلاحية حساب Telegram فوريًا من جهة النظام.

أسرار Bot API لا تُحفظ في Git.

## 7. الاتصال بين Assistant وBackend

لا تستخدم طبقة Telegram توكن مستخدم إداري طويل العمر.

نستخدم قناة داخلية موقعة بين الخدمة والـbackend، وتحتوي على:

- shared secret منفصل
- timestamp
- nonce
- HTTP method
- path
- hash للطلب

الـbackend يرفض الطلبات القديمة، غير الموقعة، أو المعاد استخدامها.

ويكون الـOps API مخصصًا لمجموعة عمليات معروفة، وليس proxy عامًا.

## 8. اللغة وتجربة المستخدم

الردود كلها بالعربية البشرية، لا بلغة Prometheus أو logs.

مثال:

```
🔴 تنبيه مهم — المحاسبة متأخرة

هناك 17 عملية مالية لم تُرحّل محاسبيًا حتى الآن.

آخر معالجة ناجحة: منذ 23 دقيقة.

التأثير:
المبيعات مستمرة، لكن تسجيلها المحاسبي متأخر.

الإجراء:
فحص خدمة المحاسبة مطلوب.
```

وتستخدم الرسائل بنية ثابتة:

1. ماذا حدث؟
2. هل يؤثر على العمل؟
3. حجم المشكلة
4. ماذا نحتاج أن نفعل؟
5. وقت الحدث
6. مرجع تقني مختصر عند الحاجة

## 9. تفسير اللغة الطبيعية

في المرحلة الأولى لا نعتمد على نموذج لغوي لتنفيذ الأوامر.

يُحوّل parser اللغة العربية الشائعة إلى intent محدد.

أمثلة:

- "النظام شغال؟" → `SYSTEM_STATUS`
- "كيف وضع المحاسبة؟" → `ACCOUNTING_STATUS`
- "في مشاكل الآن؟" → `ACTIVE_INCIDENTS`
- "كم عملية معلقة؟" → `ACCOUNTING_QUEUE_STATUS`
- "ماذا حدث اليوم؟" → `DAILY_SUMMARY`

عند وجود غموض، المساعد يطلب توضيحًا بدل التخمين.

أي استخدام مستقبلي لـLLM يكون في طبقة فهم اللغة فقط، مع إخراج schema محدود ومتحقق منه، ولا يسمح للنموذج بإنشاء SQL أو HTTP paths أو shell commands.

## 10. مراحل التنفيذ

### المرحلة 1 — Notifications

- استقبال Alertmanager webhook
- تحويل alert إلى رسالة Telegram عربية
- دعم `firing` و`resolved`
- تجميع التنبيهات المتشابهة
- منع تكرار الرسائل
- الاحتفاظ بالمعرف التقني داخليًا

### المرحلة 2 — Read-only Assistant

- حالة النظام
- حالة backend/web/database
- Accounting Worker
- طابور المحاسبة
- الاشتراكات
- آخر المشاكل
- النسخ الاحتياطي
- ملخص اليوم

### المرحلة 3 — Safe Operations

إجراءات قليلة منخفضة المخاطر، مع تأكيد واضح وسجل تدقيق.

### المرحلة 4 — Controlled Financial Operations

لا يتم فتح هذه المرحلة تلقائيًا. أي عملية مالية حساسة تحتاج مراجعة منفصلة، وحدودًا وصلاحيات إضافية، وسجل تدقيق واضح.

## 11. التنبيهات

الأولوية ليست لكثرة الرسائل، بل لقابلية الفهم.

القنوات:

- `critical` → فوري
- `warning` → مجمع ومختصر عند التكرار
- `info` → لا يُرسل افتراضيًا إلا إذا كان ذا قيمة تشغيلية

كل alert يجب أن يملك رسالتين:

- رسالة بشرية للمشغّل
- تفاصيل تقنية للمهندس

## 12. Confirmation UX

مثال:

المشغّل:
"أعد معالجة العمليات المحاسبية الفاشلة"

المساعد:
```
⚠️ إجراء يحتاج تأكيد

سيتم إعادة معالجة 14 عملية محاسبية فاشلة.

قد يستغرق ذلك عدة دقائق.

هل تريد المتابعة؟
[✅ نعم، نفّذ] [❌ إلغاء]
```

الزر نفسه يحمل operation ID قصير العمر. لا نعتمد على النص الحر وحده لتأكيد الإجراء.

## 13. Audit

كل طلب إداري عبر Telegram يُسجل:

- actor
- Telegram user ID
- chat ID
- operation
- target
- result
- timestamp
- correlation/request ID
- reason عندما يكون مطلوبًا

ولا تُسجل أسرار Bot API أو كلمات المرور أو محتوى حساس غير لازم.

## 14. الاختبارات المطلوبة

### Unit

- Arabic intent parsing
- message formatting
- severity translation
- confirmation tokens
- signed request verification
- replay/nonce protection

### Integration

- Alertmanager payload → Telegram message
- Telegram command → backend Ops API
- unauthorized chat → rejected
- revoked chat → rejected
- expired confirmation → rejected
- duplicate confirmation → rejected safely

### Security

- forged Telegram user/chat ID
- forged internal signature
- replayed signed request
- arbitrary endpoint injection
- shell/SQL command injection
- prompt-injection-like text treated as plain user input

### Operational

- Alert firing
- Alert resolving
- Telegram delivery failure
- Telegram rate limits
- backend unavailable
- assistant restart and recovery

## 15. ما لن نفعله

- لن نعطي Telegram وصولًا مباشرًا إلى PostgreSQL.
- لن نسمح بتنفيذ shell commands من Telegram.
- لن نجعل Telegram proxy عامًا.
- لن نسمح لمحلل اللغة بتنفيذ أمر غير موجود في allowlist.
- لن نضع الأسرار في المستودع.
- لن نغيّر RLS أو accounting invariants لمجرد إضافة Telegram.
- لن نحول لوحة الإدارة كاملة إلى Telegram.

## 16. تعريف النجاح

النسخة الأولى تعتبر مكتملة عندما يستطيع المشغّل، من Telegram وحده:

- معرفة ما إذا كان Ticketty يعمل.
- معرفة ما إذا كانت المحاسبة تعمل.
- معرفة عدد العمليات المعلقة.
- معرفة آخر نسخة احتياطية وحالتها.
- فهم أي تنبيه بدون معرفة Prometheus.
- معرفة ما إذا كان التنبيه ما زال قائمًا أو انتهى.
- استخدام أوامر القراءة باللغة العربية الطبيعية.
- الحصول على رفض واضح عند عدم امتلاك صلاحية.

## 17. بوابة ما قبل الإنتاج

قبل تفعيل أي أمر إداري:

1. نجاح CI الكامل.
2. اختبار Alert delivery حقيقي إلى قناة Telegram المعتمدة.
3. اختبار authorization لحسابات Telegram.
4. اختبار replay protection.
5. اختبار audit trail.
6. اختبار فشل Telegram ثم عودة الخدمة.
7. اختبار عدم وجود أسرار داخل Git.
8. مراجعة مستقلة لأي أمر يغير حالة أو بيانات.

## 18. قرار الفريق

نبدأ بـ:

**Arabic human-readable alerts + read-only Operations Assistant**

ثم نفتح الإجراءات التشغيلية الآمنة بعد نجاح المرحلة الأولى.

المعيار الأساسي: Telegram يجب أن يزيد وضوح النظام وسرعة الإدارة، لا أن يصبح بابًا جديدًا واسعًا للوصول إلى النظام.


### Remote deployment boundary

The Telegram service talks to the host deployment control plane over
`/run/ticketty/ops.sock`. Requests are HMAC-SHA256 signed and contain a timestamp,
nonce, actor and request ID. The host accepts only `STATUS`, `PLAN_UPDATE`,
`CANCEL_PLAN`, and `EXECUTE_UPDATE`.

The release ref is never trusted from callback data. A plan created on the host
stores the release ref and expires after 10 minutes. The callback carries only the
opaque plan ID.

Deployment execution is asynchronous. Telegram immediately reports that the
operation started; the host records its state and audit event under
`/var/lib/ticketty/deployment`.
