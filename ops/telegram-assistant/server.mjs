import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { intentFromText } from './core.mjs';

const config = {
  botToken: required('TELEGRAM_BOT_TOKEN'),
  pairingCode: process.env.TELEGRAM_PAIRING_CODE ?? '',
  prometheusUrl: process.env.PROMETHEUS_URL ?? 'http://prometheus:9090',
  alertmanagerUrl:
    process.env.ALERTMANAGER_URL ?? 'http://alertmanager:9093',
  alertWebhookTokenFile: required('TELEGRAM_ALERT_WEBHOOK_TOKEN_FILE'),
  stateFile:
    process.env.TELEGRAM_STATE_FILE ??
    '/var/lib/ticketty/telegram/state.json',
  port: toPort(process.env.TELEGRAM_PORT ?? '8090', 8090),
  pollTimeoutSeconds: toInt(
    process.env.TELEGRAM_POLL_TIMEOUT_SECONDS ?? '25',
    25,
  ),
  requestTimeoutMs: toInt(
    process.env.TELEGRAM_REQUEST_TIMEOUT_MS ?? '15000',
    15000,
  ),
};

const MAX_ALERT_BODY_BYTES = 512 * 1024;
const MAX_TELEGRAM_MESSAGE = 3900;
const state = await loadState();
const alertWebhookToken = (await readFile(config.alertWebhookTokenFile, 'utf8')).trim();
if (!alertWebhookToken) throw new Error('Telegram alert webhook token file is empty');

if (!config.pairingCode && state.operators.length === 0) {
  throw new Error(
    'TELEGRAM_PAIRING_CODE or an existing paired operator is required',
  );
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(config.stateFile, 'utf8'));
    return {
      updateOffset:
        Number.isInteger(parsed.updateOffset) && parsed.updateOffset >= 0
          ? parsed.updateOffset
          : 0,
      operators: Array.isArray(parsed.operators)
        ? parsed.operators
            .filter(
              (item) =>
                item &&
                typeof item.chatId === 'string' &&
                typeof item.userId === 'string',
            )
            .map((item) => ({
              chatId: item.chatId,
              userId: item.userId,
              pairedAt:
                typeof item.pairedAt === 'string'
                  ? item.pairedAt
                  : new Date(0).toISOString(),
            }))
        : [],
    };
  } catch {
    return { updateOffset: 0, operators: [] };
  }
}

let stateWritePromise = Promise.resolve();

function persistState() {
  stateWritePromise = stateWritePromise.then(async () => {
    await mkdir(dirname(config.stateFile), { recursive: true });
    await writeFile(
      config.stateFile,
      JSON.stringify(state, null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 },
    );
  });
  return stateWritePromise;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(name + ' is required');
  }
  return value;
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535
    ? parsed
    : fallback;
}

function sameSecret(expected, actual) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function isAuthorized(chatId, userId) {
  return state.operators.some(
    (operator) => operator.chatId === chatId && operator.userId === userId,
  );
}

function pair(chatId, userId) {
  if (isAuthorized(chatId, userId)) return false;
  state.operators.push({
    chatId,
    userId,
    pairedAt: new Date().toISOString(),
  });
  return true;
}

async function telegram(method, body) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs,
  );

  try {
    const response = await fetch(
      'https://api.telegram.org/bot' + config.botToken + '/' + method,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      },
    );
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(
        'Telegram ' +
          method +
          ' failed: ' +
          (payload.description ?? response.status),
      );
    }

    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function promQuery(query) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs,
  );

  try {
    const response = await fetch(
      config.prometheusUrl +
        '/api/v1/query?query=' +
        encodeURIComponent(query),
      { signal: controller.signal },
    );

    if (!response.ok) {
      throw new Error('Prometheus returned ' + response.status);
    }

    const payload = await response.json();

    if (payload.status !== 'success') {
      throw new Error('Prometheus query failed');
    }

    return payload.data.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function promValue(query) {
  const result = await promQuery(query);
  if (!result.length) return null;

  const raw = result[0]?.value?.[1];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function activeAlerts() {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs,
  );

  try {
    const url =
      config.alertmanagerUrl +
      '/api/v2/alerts?active=true&silenced=false&inhibited=false';
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error('Alertmanager unavailable');
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function sendMessage(chatId, messageText) {
  const text =
    messageText.length > MAX_TELEGRAM_MESSAGE
      ? messageText.slice(0, MAX_TELEGRAM_MESSAGE - 80) +
        '\n\n[تم اختصار الرسالة]'
      : messageText;

  await telegram('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function formatAge(seconds) {
  if (seconds == null || seconds < 0) return 'غير معروف';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes < 60) return minutes + ' دقيقة';

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' ساعة';

  const days = Math.floor(hours / 24);
  return days + ' يوم';
}

function statusWord(value) {
  return value === 1 ? 'يعمل ✅' : 'غير متاح 🔴';
}

function severityPresentation(severity) {
  if (severity === 'critical') {
    return { icon: '🔴', word: 'مهم جدًا' };
  }

  if (severity === 'warning') {
    return { icon: '🟠', word: 'يحتاج متابعة' };
  }

  return { icon: '🟡', word: 'تنبيه' };
}

const alertMessages = {
  AccountingWorkerStale: [
    'خدمة المحاسبة توقفت عن الاستجابة.',
    'قد تستمر المبيعات، لكن تسجيلها المحاسبي متأخر.',
    'الإجراء: فحص خدمة المحاسبة.',
  ],
  AccountingWorkerFailing: [
    'خدمة المحاسبة تواجه أخطاء متكررة.',
    'قد تتأخر معالجة بعض العمليات المالية.',
    'الإجراء: فحص سجل خدمة المحاسبة.',
  ],
  AccountingEventsFailing: [
    'توجد عمليات محاسبية فشلت أثناء المعالجة.',
    'الإجراء: مراجعة العمليات الفاشلة ومعرفة سببها.',
  ],
  AccountingQueueBacklog: [
    'طابور المحاسبة أصبح مزدحمًا.',
    'العمليات المالية تنتظر أطول من المعتاد.',
    'الإجراء: فحص سرعة المعالجة وخدمة المحاسبة.',
  ],
  AccountingStalePending: [
    'توجد عمليات مالية معلقة ولم تتم معالجتها.',
    'خدمة المحاسبة لا تعالجها حاليًا.',
    'الإجراء: تدخل عاجل وفحص الخدمة.',
  ],
  SubscriptionSweepStale: [
    'خدمة متابعة الاشتراكات لم تعمل في موعدها.',
    'قد تتأخر بعض تحديثات الاشتراكات.',
    'الإجراء: فحص الخدمة.',
  ],
  SubscriptionSweepErroring: [
    'آخر تشغيل لخدمة متابعة الاشتراكات فشل.',
    'الإجراء: فحص سجل الخدمة.',
  ],
  Backend5xxRate: [
    'الخادم يواجه عددًا مرتفعًا من الأخطاء.',
    'قد تتأثر بعض طلبات المستخدمين.',
    'الإجراء: فحص الخادم والأخطاء الأخيرة.',
  ],
  AuthenticationFailureSurge: [
    'ارتفعت محاولات الدخول غير الناجحة بشكل غير معتاد.',
    'قد يكون السبب أخطاء مستخدمين أو محاولات دخول غير طبيعية.',
    'الإجراء: مراجعة المحاولات الأخيرة.',
  ],
  ApplicationDown: [
    'الخادم الرئيسي للنظام غير متاح.',
    'قد تتوقف عمليات النظام.',
    'الإجراء: فحص خدمة الخادم فورًا.',
  ],
  WebApplicationDown: [
    'واجهة Ticketty غير متاحة حاليًا.',
    'المستخدمون قد لا يستطيعون فتح النظام.',
    'الإجراء: فحص خدمة الواجهة.',
  ],
  DatabaseExporterDown: [
    'مراقبة قاعدة البيانات غير متاحة.',
    'لا يعني ذلك بالضرورة أن قاعدة البيانات نفسها متوقفة.',
    'الإجراء: فحص قاعدة البيانات وخدمة المراقبة.',
  ],
  DatabaseConnectionsNearLimit: [
    'قاعدة البيانات اقتربت من الحد المسموح للاتصالات.',
    'قد تبدأ الطلبات بالفشل إذا استمر الضغط.',
    'الإجراء: فحص الاتصالات والخدمات.',
  ],
  DatabaseDeadlocks: [
    'حدث تعارض داخل قاعدة البيانات وتم اكتشافه.',
    'الإجراء: مراجعة العمليات التي كانت تعمل في نفس الوقت.',
  ],
  BackupLastRunFailed: [
    'النسخة الاحتياطية الأخيرة فشلت.',
    'بيانات جديدة قد لا تكون محفوظة في النسخة الخارجية.',
    'الإجراء: فحص النسخ الاحتياطي وتشغيله من جديد.',
  ],
  BackupStale: [
    'آخر نسخة احتياطية قديمة أكثر من اللازم.',
    'هذا يعني أن حماية البيانات ليست عند المستوى المطلوب.',
    'الإجراء: التأكد من تشغيل النسخ وإرسال نسخة جديدة.',
  ],
  HostHighCpu: [
    'استخدام معالج السيرفر مرتفع لفترة متواصلة.',
    'قد يؤدي ذلك إلى بطء النظام.',
    'الإجراء: فحص الخدمات الأكثر استهلاكًا.',
  ],
  HostHighMemory: [
    'استخدام ذاكرة السيرفر مرتفع.',
    'قد يؤدي استمرار ذلك إلى بطء أو توقف بعض الخدمات.',
    'الإجراء: فحص استهلاك الذاكرة.',
  ],
  HostDiskLow: [
    'المساحة المتبقية على السيرفر منخفضة.',
    'إذا استمر الانخفاض قد تتأثر قاعدة البيانات والنسخ الاحتياطية.',
    'الإجراء: فحص التخزين وتنظيف الملفات غير الضرورية.',
  ],
  HostFilesystemReadOnly: [
    'أحد أجزاء التخزين أصبح للقراءة فقط.',
    'هذا قد يمنع النظام من حفظ البيانات أو السجلات.',
    'الإجراء: فحص التخزين فورًا.',
  ],
  BackendHighLatency: [
    'النظام أصبح أبطأ من المعتاد في الاستجابة.',
    'الإجراء: فحص الخادم وقاعدة البيانات.',
  ],
  BackendRepeatedRestarts: [
    'الخادم يعيد التشغيل أكثر من مرة خلال فترة قصيرة.',
    'قد يكون هناك عطل متكرر يحتاج إلى فحص.',
    'الإجراء: مراجعة سجل الخدمة.',
  ],
};

const alertNamesArabic = {
  AccountingWorkerStale: 'خدمة المحاسبة',
  AccountingWorkerFailing: 'أخطاء المحاسبة',
  AccountingEventsFailing: 'عمليات محاسبية فاشلة',
  AccountingQueueBacklog: 'تراكم عمليات المحاسبة',
  AccountingStalePending: 'عمليات محاسبية معلقة',
  SubscriptionSweepStale: 'متابعة الاشتراكات',
  SubscriptionSweepErroring: 'خطأ في متابعة الاشتراكات',
  Backend5xxRate: 'أخطاء في الخادم',
  AuthenticationFailureSurge: 'محاولات دخول غير ناجحة',
  ApplicationDown: 'الخادم الرئيسي',
  WebApplicationDown: 'واجهة النظام',
  DatabaseExporterDown: 'مراقبة قاعدة البيانات',
  DatabaseConnectionsNearLimit: 'ضغط الاتصالات',
  DatabaseDeadlocks: 'تعارض في قاعدة البيانات',
  BackupLastRunFailed: 'النسخة الاحتياطية',
  BackupStale: 'النسخة الاحتياطية متأخرة',
  HostHighCpu: 'ضغط معالج السيرفر',
  HostHighMemory: 'ضغط ذاكرة السيرفر',
  HostDiskLow: 'المساحة التخزينية',
  HostFilesystemReadOnly: 'مشكلة في التخزين',
  BackendHighLatency: 'بطء النظام',
  BackendRepeatedRestarts: 'إعادة تشغيل متكررة',
};

function nameInArabic(name) {
  return alertNamesArabic[name] ?? 'مشكلة في النظام';
}

function alertMessage(alert) {
  const status = alert.status === 'resolved' ? 'resolved' : 'firing';
  const severity = severityPresentation(alert.labels?.severity);
  const name = alert.labels?.alertname ?? 'تنبيه';

  if (status === 'resolved') {
    return [
      '🟢 انتهت المشكلة — ' + nameInArabic(name),
      '',
      'عاد النظام إلى الحالة الطبيعية لهذا التنبيه.',
      '',
      'الحالة: تم الحل ✅',
    ].join('\n');
  }

  const custom =
    alertMessages[name] ?? [
      alert.annotations?.summary ?? 'تم اكتشاف مشكلة في النظام.',
      alert.annotations?.description ?? 'يرجى فحص النظام.',
    ];

  return [
    severity.icon + ' ' + severity.word + ' — ' + nameInArabic(name),
    '',
    ...custom,
    '',
    'وقت التنبيه: ' +
      new Date().toLocaleString('ar-SA', {
        timeZone: 'Africa/Khartoum',
      }),
  ].join('\n');
}

async function systemStatus() {
  const [
    backend,
    web,
    postgres,
    pending,
    failed,
    workerLast,
    backupLast,
    backupResult,
    alerts,
  ] = await Promise.all([
    promValue('up{job="ticketty-backend"}'),
    promValue('probe_success{job="ticketty-web"}'),
    promValue('up{job="postgres"}'),
    promValue('ticketty_accounting_queue_depth{status="PENDING"}'),
    promValue('ticketty_accounting_queue_depth{status="FAILED"}'),
    promValue('ticketty_accounting_worker_last_success_timestamp_seconds'),
    promValue('ticketty_backup_last_success_timestamp_seconds'),
    promValue('ticketty_backup_last_result'),
    activeAlerts(),
  ]);

  const workerAge =
    workerLast == null
      ? null
      : Math.max(0, Date.now() / 1000 - workerLast);

  const backupAge =
    backupLast == null
      ? null
      : Math.max(0, Date.now() / 1000 - backupLast);

  return [
    '🟢 حالة Ticketty الآن',
    '',
    'الخادم: ' + statusWord(backend),
    'الواجهة: ' + statusWord(web),
    'قاعدة البيانات: ' + statusWord(postgres),
    '',
    '📊 المحاسبة',
    'العمليات المنتظرة: ' + (pending ?? 'غير معروف'),
    'العمليات الفاشلة: ' + (failed ?? 'غير معروف'),
    'آخر دورة للمحاسبة: ' + formatAge(workerAge),
    '',
    '💾 النسخ الاحتياطي',
    'آخر نسخة ناجحة: ' + formatAge(backupAge),
    'حالة آخر محاولة: ' +
      (backupResult === 1
        ? 'نجحت ✅'
        : backupResult === 0
          ? 'فشلت 🔴'
          : 'غير معروفة'),
    '',
    '🚨 التنبيهات النشطة: ' + alerts.length,
    '',
    alerts.length === 0
      ? 'لا توجد مشكلة نشطة تحتاج تدخلاً الآن ✅'
      : 'يوجد تنبيه نشط. اكتب: مشاكل النظام',
  ].join('\n');
}

async function accountingStatus() {
  const [pending, failed, workerLast] = await Promise.all([
    promValue('ticketty_accounting_queue_depth{status="PENDING"}'),
    promValue('ticketty_accounting_queue_depth{status="FAILED"}'),
    promValue('ticketty_accounting_worker_last_success_timestamp_seconds'),
  ]);

  const workerAge =
    workerLast == null
      ? null
      : Math.max(0, Date.now() / 1000 - workerLast);

  const healthy =
    pending === 0 &&
    failed === 0 &&
    workerAge !== null &&
    workerAge < 900;

  return [
    '📒 حالة المحاسبة',
    '',
    'العمليات المنتظرة: ' + (pending ?? 'غير معروف'),
    'العمليات الفاشلة: ' + (failed ?? 'غير معروف'),
    'آخر تشغيل ناجح: ' + formatAge(workerAge),
    '',
    healthy ? 'الوضع طبيعي ✅' : 'توجد ملاحظة تحتاج متابعة ⚠️',
  ].join('\n');
}

async function backupStatus() {
  const [last, result] = await Promise.all([
    promValue('ticketty_backup_last_success_timestamp_seconds'),
    promValue('ticketty_backup_last_result'),
  ]);

  const age =
    last == null ? null : Math.max(0, Date.now() / 1000 - last);

  const healthy = result === 1 && age !== null && age < 90000;

  return [
    '💾 حالة النسخ الاحتياطي',
    '',
    'آخر نسخة ناجحة: ' + formatAge(age),
    'آخر محاولة: ' +
      (result === 1
        ? 'نجحت ✅'
        : result === 0
          ? 'فشلت 🔴'
          : 'غير معروف'),
    '',
    healthy
      ? 'النسخ الاحتياطي ضمن الوضع المطلوب ✅'
      : 'النسخ الاحتياطي يحتاج متابعة ⚠️',
  ].join('\n');
}

async function alertsStatus() {
  const alerts = await activeAlerts();

  if (!alerts.length) {
    return '🚨 لا توجد تنبيهات نشطة الآن ✅';
  }

  const lines = ['🚨 المشاكل والتنبيهات الحالية', ''];

  for (const alert of alerts.slice(0, 10)) {
    const severity = severityPresentation(alert.labels?.severity);
    lines.push(
      severity.icon +
        ' ' +
        nameInArabic(alert.labels?.alertname ?? 'تنبيه'),
    );
    lines.push(alertMessage(alert));
    lines.push('', '────────────', '');
  }

  if (alerts.length > 10) {
    lines.push('وهناك ' + (alerts.length - 10) + ' تنبيهات أخرى.');
  }

  return lines.join('\n');
}

async function operationalSummary() {
  const [requests, errors, processed, failed, alerts] =
    await Promise.all([
      promValue('sum(increase(ticketty_http_requests_total[24h]))'),
      promValue(
        'sum(increase(ticketty_http_requests_total{status=~"5.."}[24h]))',
      ),
      promValue(
        'increase(ticketty_accounting_events_processed_total[24h])',
      ),
      promValue(
        'increase(ticketty_accounting_events_failed_total[24h])',
      ),
      activeAlerts(),
    ]);

  return [
    '📊 ملخص تشغيل Ticketty خلال آخر 24 ساعة',
    '',
    'طلبات النظام: ' + formatNumber(requests),
    'أخطاء الخادم: ' + formatNumber(errors),
    'عمليات محاسبية تمت: ' + formatNumber(processed),
    'عمليات محاسبية فشلت: ' + formatNumber(failed),
    'التنبيهات النشطة الآن: ' + alerts.length,
    '',
    'هذا ملخص تشغيلي وليس تقريرًا ماليًا رسميًا.',
  ].join('\n');
}

function formatNumber(value) {
  if (value == null) return 'غير معروف';
  return new Intl.NumberFormat('ar').format(Math.round(value));
}

function helpMessage() {
  return [
    '👋 أنا مساعد Ticketty التشغيلي.',
    '',
    'يمكنك أن تكتب لي بالعربية بطريقة طبيعية، مثل:',
    '',
    '• حالة النظام',
    '• كيف وضع المحاسبة؟',
    '• كم عملية معلقة؟',
    '• هل توجد مشاكل؟',
    '• هل أخذ النظام نسخة احتياطية؟',
    '• ماذا حدث اليوم؟',
    '',
    'حاليًا أنا للمراقبة والاستعلام فقط.',
    'لن أنفذ أي إجراء حساس من تلقاء نفسي.',
  ].join('\n');
}

async function handleMessage(message) {
  const chatId = String(message.chat?.id ?? '');
  const userId = String(message.from?.id ?? '');
  const textValue =
    typeof message.text === 'string' ? message.text.trim() : '';

  if (!chatId || !userId || !textValue) return;

  if (textValue.startsWith('/start')) {
    const parts = textValue.split(/\\s+/);
    const candidateCode = parts[1] ?? '';

    if (
      config.pairingCode &&
      state.operators.length === 0 &&
      sameSecret(config.pairingCode, candidateCode)
    ) {
      pair(chatId, userId);
      await persistState();
      await sendMessage(
        chatId,
        '🔐 تم ربط حساب Telegram بنجاح.\n\nأصبح بإمكانك الآن متابعة Ticketty من هنا بأمان ✅',
      );
      return;
    }

    if (!isAuthorized(chatId, userId)) {
      await sendMessage(
        chatId,
        'هذا الحساب غير مرتبط بمساعد Ticketty.\nاطلب تفعيل هذا الحساب من مسؤول النظام.',
      );
      return;
    }

    await sendMessage(chatId, helpMessage());
    return;
  }

  if (!isAuthorized(chatId, userId)) return;

  if (textValue === '/status') {
    await sendMessage(chatId, await systemStatus());
    return;
  }

  const intent = intentFromText(textValue);

  try {
    if (intent === 'help') {
      await sendMessage(chatId, helpMessage());
    } else if (intent === 'status') {
      await sendMessage(chatId, await systemStatus());
    } else if (intent === 'accounting') {
      await sendMessage(chatId, await accountingStatus());
    } else if (intent === 'backup') {
      await sendMessage(chatId, await backupStatus());
    } else if (intent === 'alerts') {
      await sendMessage(chatId, await alertsStatus());
    } else if (intent === 'summary') {
      await sendMessage(chatId, await operationalSummary());
    } else {
      await sendMessage(
        chatId,
        [
          'لم أفهم المطلوب بشكل واضح.',
          '',
          'جرّب مثلًا:',
          '«حالة النظام»',
          '«كيف وضع المحاسبة؟»',
          '«هل توجد مشاكل؟»',
          '«هل أخذ النظام نسخة احتياطية؟»',
          '«ماذا حدث اليوم؟»',
        ].join('\n'),
      );
    }
  } catch (error) {
    console.error('Telegram assistant request failed', error);
    await sendMessage(
      chatId,
      'تعذر الحصول على المعلومات الآن. توجد مشكلة في الوصول إلى خدمة المراقبة، ويمكنك المحاولة مرة أخرى بعد قليل.',
    );
  }
}

async function telegramPollingLoop() {
  while (true) {
    try {
      const updates = await telegram('getUpdates', {
        offset: state.updateOffset,
        timeout: config.pollTimeoutSeconds,
        allowed_updates: ['message'],
      });

      for (const update of updates) {
        try {
          await handleMessage(update.message);
        } catch (error) {
          console.error('Telegram message handling failed', error);
        }

        state.updateOffset = update.update_id + 1;
        await persistState();
      }
    } catch (error) {
      console.error('Telegram polling failed', error);
      await sleep(5000);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverAlertGroup(payload) {
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
  if (!alerts.length || state.operators.length === 0) return;

  const firing = alerts.filter((item) => item.status !== 'resolved');
  const resolved = alerts.filter((item) => item.status === 'resolved');
  const lines = [];

  if (firing.length) {
    lines.push('🚨 تنبيه من Ticketty', '');

    for (const alert of firing.slice(0, 8)) {
      lines.push(alertMessage(alert), '', '────────────', '');
    }

    if (firing.length > 8) {
      lines.push(
        'هناك ' +
          (firing.length - 8) +
          ' تنبيهات أخرى ضمن نفس المجموعة.',
      );
    }
  }

  if (resolved.length) {
    if (lines.length) lines.push('');
    lines.push('🟢 تحديث', '');

    for (const alert of resolved.slice(0, 8)) {
      lines.push(alertMessage(alert), '', '────────────', '');
    }
  }

  const messageText = lines.join('\n').trim();
  if (!messageText) return;

  let delivered = 0;

  for (const operator of state.operators) {
    try {
      await sendMessage(operator.chatId, messageText);
      delivered += 1;
    } catch (error) {
      console.error(
        'Telegram alert delivery failed for chat ' +
          operator.chatId,
        error,
      );
    }
  }

  if (delivered === 0) {
    throw new Error('Telegram alert delivery failed for all operators');
  }
}

async function readBody(request) {
  let body = '';

  for await (const chunk of request) {
    body += chunk;

    if (Buffer.byteLength(body, 'utf8') > MAX_ALERT_BODY_BYTES) {
      throw new Error('Alert payload too large');
    }
  }

  return body;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health/live') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (request.method === 'POST' && request.url?.startsWith('/alerts')) {
      const url = new URL(request.url, 'http://127.0.0.1');

      if (
        !sameSecret(
          alertWebhookToken,
          url.searchParams.get('token'),
        )
      ) {
        response.writeHead(401);
        response.end();
        return;
      }

      const body = await readBody(request);
      const payload = JSON.parse(body);
      await deliverAlertGroup(payload);
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404);
    response.end();
  } catch (error) {
    console.error('Telegram assistant HTTP handler failed', error);
    response.writeHead(500);
    response.end();
  }
});

server.listen(config.port, '0.0.0.0', async () => {
  try {
    const webhook = await telegram('getWebhookInfo');

    if (webhook?.url) {
      throw new Error(
        'Telegram webhook is already configured. Remove it before using long polling.',
      );
    }

    const me = await telegram('getMe');

    console.log(
      'Ticketty Telegram Assistant started as @' +
        (me.username ?? me.id),
    );
    console.log('Operators paired: ' + state.operators.length);
    void telegramPollingLoop();
  } catch (error) {
    console.error('Telegram assistant startup check failed', error);
    process.exitCode = 1;
  }
});
