import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createConnection } from 'node:net';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, listModels, validateApiKey } from './ai-provider.mjs';
import { dirname } from 'node:path';
import { extractBearerToken, intentFromText } from './core.mjs';

const config = {
  botTokenFile: process.env.TELEGRAM_BOT_TOKEN_FILE ?? '',
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  pairingCode: process.env.TELEGRAM_PAIRING_CODE ?? '',
  opsSocket: process.env.TICKETTY_OPS_SOCKET ?? '/run/ticketty/ops.sock',
  opsHmacFile: process.env.TICKETTY_OPS_HMAC_FILE ?? '',
  remoteOpsEnabled: process.env.TICKETTY_REMOTE_OPS_ENABLED === 'true',
  prometheusUrl: process.env.PROMETHEUS_URL ?? 'http://prometheus:9090',
  alertmanagerUrl:
    process.env.ALERTMANAGER_URL ?? 'http://alertmanager:9093',
  alertWebhookTokenFile: required('TELEGRAM_ALERT_WEBHOOK_TOKEN_FILE'),
  stateFile:
    process.env.TELEGRAM_STATE_FILE ??
    '/var/lib/ticketty/telegram/state.json',
  providerKeyFile:
    process.env.TELEGRAM_AI_KEY_FILE ??
    '/var/lib/ticketty/telegram/apmix-api-key',
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

if (!config.botToken) {
  config.botToken = config.botTokenFile
    ? (await readFile(config.botTokenFile, 'utf8')).trim()
    : '';
}
if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN_FILE is required');

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
      provider: parsed.provider && parsed.provider.name === 'apmix'
        ? { name: 'apmix', baseUrl: DEFAULT_BASE_URL, model: typeof parsed.provider.model === 'string' ? parsed.provider.model : DEFAULT_MODEL }
        : null,
      pendingProviderSetup: parsed.pendingProviderSetup &&
        typeof parsed.pendingProviderSetup.chatId === 'string' &&
        typeof parsed.pendingProviderSetup.userId === 'string' &&
        Number.isFinite(parsed.pendingProviderSetup.expiresAt)
          ? parsed.pendingProviderSetup : null,
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

async function saveProviderKey(apiKey) {
  await mkdir(dirname(config.providerKeyFile), { recursive: true, mode: 0o700 });
  await writeFile(config.providerKeyFile, apiKey + '\\n', { encoding: 'utf8', mode: 0o600 });
  await chmod(config.providerKeyFile, 0o600);
}

async function readProviderKey() {
  try { return validateApiKey(await readFile(config.providerKeyFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
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


async function remoteOps(operation, payload, actor) {
  if (!config.remoteOpsEnabled || !config.opsHmacFile) {
    throw new Error('Remote operations are not enabled');
  }

  const secret = (await readFile(config.opsHmacFile, 'utf8')).trim();
  if (!secret) throw new Error('Remote operations secret is empty');

  const message = {
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomUUID(),
    operation,
    actor,
    payload: payload ?? {},
    request_id: randomUUID(),
  };
  const canonical = JSON.stringify({
    timestamp: message.timestamp,
    nonce: message.nonce,
    operation: message.operation,
    actor: message.actor,
    payload: message.payload,
  });
  message.signature = createHmac('sha256', secret)
    .update(canonical)
    .digest('hex');

  return await new Promise((resolve, reject) => {
    const socket = createConnection(config.opsSocket);
    let data = '';

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Remote operations timeout'));
    }, config.requestTimeoutMs);

    socket.on('connect', () => {
      socket.write(JSON.stringify(message) + '\n');
    });
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      const index = data.indexOf('\n');
      if (index === -1) return;
      clearTimeout(timer);
      socket.end();
      try {
        const response = JSON.parse(data.slice(0, index));
        if (!response.ok) reject(new Error(response.error ?? 'Remote operation failed'));
        else resolve(response.result);
      } catch (error) {
        reject(error);
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('close', () => clearTimeout(timer));
  });
}

function operatorActor(message) {
  return {
    telegram_user_id: String(message?.from?.id ?? ''),
    telegram_chat_id: String(message?.chat?.id ?? ''),
  };
}

function isPrivateChat(message) {
  return message?.chat?.type === 'private';
}

function deploymentStatusMessage(result) {
  const operations = Array.isArray(result?.remote_operations)
    ? result.remote_operations
    : [];

  if (!operations.length) {
    return [
      '🚀 حالة النشر',
      '',
      'لا توجد عملية نشر مسجلة حاليًا.',
      'يمكنك كتابة: هل يوجد تحديث؟',
    ].join('\n');
  }

  const latest = [...operations]
    .sort((a, b) => Number(b.started_at ?? 0) - Number(a.started_at ?? 0))[0];

  const status = latest.status;
  const statusText =
    status === 'running'
      ? '🟠 جارٍ التنفيذ'
      : status === 'success'
        ? '🟢 اكتمل بنجاح'
        : status === 'failed'
          ? '🔴 فشل'
          : status === 'executing'
            ? '🟠 جارٍ التنفيذ'
            : status === 'cancelled'
              ? '⚪ أُلغي'
              : status ?? 'غير معروفة';

  return [
    '🚀 حالة آخر عملية نشر',
    '',
    'الإصدار: ' + (latest.ref ?? 'غير معروف'),
    'الحالة: ' + statusText,
    'معرّف العملية: ' + (latest.plan_id ?? 'غير معروف'),
    latest.started_at
      ? 'بدأت: ' +
        new Date(Number(latest.started_at) * 1000).toLocaleString('ar-SA', {
          timeZone: 'Africa/Khartoum',
        })
      : '',
    latest.finished_at
      ? 'انتهت: ' +
        new Date(Number(latest.finished_at) * 1000).toLocaleString('ar-SA', {
          timeZone: 'Africa/Khartoum',
        })
      : '',
    latest.status === 'failed'
      ? 'راجع سجل النشر من السيرفر أو استخدم: حالة النظام'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function monitorDeployment(chatId, actor, planId) {
  const maxChecks = 360;
  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      const result = await remoteOps(
        'OPERATION_STATUS',
        { plan_id: planId },
        actor,
      );

      if (result.status === 'success') {
        await sendMessage(
          chatId,
          [
            '🟢 اكتمل تحديث Ticketty',
            '',
            'الإصدار: ' + (result.ref ?? 'غير معروف'),
            'الحالة: تم التحديث بنجاح ✅',
            'معرّف العملية: ' + planId,
            '',
            'اكتب: حالة النظام',
            'للتأكد من حالة الخدمات.',
          ].join('\n'),
        );
        return;
      }

      if (result.status === 'failed') {
        await sendMessage(
          chatId,
          [
            '🔴 فشل تحديث Ticketty',
            '',
            'الإصدار المطلوب: ' + (result.ref ?? 'غير معروف'),
            'لم يتم اعتماد التحديث.',
            'معرّف العملية: ' + planId,
            '',
            'استخدم «حالة التحديث» لمراجعة آخر حالة، ثم راجع سجل النشر من السيرفر.',
          ].join('\n'),
        );
        return;
      }
    } catch (error) {
      console.error('Deployment status polling failed', error);
      // Keep polling. A transient control-plane or Telegram issue must not
      // change the actual deployment state.
    }
  }

  await sendMessage(
    chatId,
    [
      '🟠 التحديث ما زال قيد التنفيذ.',
      '',
      'معرّف العملية: ' + planId,
      'لم أصل إلى النتيجة النهائية بعد.',
      '',
      'اكتب: حالة التحديث',
    ].join('\n'),
  );
}

function updatePlanMessage(plan) {
  const body = [
    '📦 يوجد إصدار جديد من Ticketty',
    '',
    'الإصدار الحالي: ' + (plan.current ?? 'غير معروف'),
    'الإصدار الجديد: ' + (plan.latest ?? 'غير معروف'),
    '',
    plan.name ? 'اسم الإصدار: ' + plan.name : '',
    plan.published_at
      ? 'تاريخ الإصدار: ' +
        new Date(plan.published_at).toLocaleString('ar-SA', {
          timeZone: 'Africa/Khartoum',
        })
      : '',
    '',
    plan.body
      ? plan.body.slice(0, 1200)
      : 'تم إعداد خطة التحديث على السيرفر.',
    '',
    'الخطة مؤقتة وصالحة لمدة 10 دقائق.',
    '',
    'اختر الإجراء:',
  ].filter(Boolean).join('\n');

  return {
    text: body,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ تنفيذ التحديث', callback_data: 'deploy:execute:' + plan.plan_id },
          { text: '❌ إلغاء', callback_data: 'deploy:cancel:' + plan.plan_id },
        ],
      ],
    },
  };
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

async function sendMessage(chatId, messageText, replyMarkup) {
  const text =
    messageText.length > MAX_TELEGRAM_MESSAGE
      ? messageText.slice(0, MAX_TELEGRAM_MESSAGE - 80) +
        '\n\n[تم اختصار الرسالة]'
      : messageText;

  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) body.reply_markup = replyMarkup;

  await telegram('sendMessage', body);
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
    '• هل يوجد تحديث؟',
    '• /settings إعدادات الذكاء الاصطناعي',
    '• /apmix إعداد مفتاح APMIX',
    '',
    'يمكنني أيضًا تجهيز تحديث منشور على GitHub قبل التنفيذ.',
    'التحديث لا يبدأ إلا بعد تأكيد صريح منك.',

  ].join('\n');
}

async function handleCallbackQuery(query) {
  const message = query?.message;
  const chatId = String(message?.chat?.id ?? '');
  const userId = String(query?.from?.id ?? '');

  if (!chatId || !userId) return;

  if (!isAuthorized(chatId, userId)) {
    await telegram('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'هذا الحساب غير مصرح له.',
      show_alert: true,
    });
    return;
  }

  const data = typeof query.data === 'string' ? query.data : '';
  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== 'deploy') {
    await telegram('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'طلب غير صالح.',
      show_alert: true,
    });
    return;
  }

  const action = parts[1];
  const planId = parts[2];
  const actor = operatorActor(message);

  try {
    if (action === 'cancel') {
      await remoteOps('CANCEL_PLAN', { plan_id: planId }, actor);
      await telegram('answerCallbackQuery', {
        callback_query_id: query.id,
        text: 'تم إلغاء خطة التحديث.',
      });
      await sendMessage(chatId, '❌ تم إلغاء خطة التحديث. لن يتم تنفيذ أي تغيير.');
      return;
    }

    if (action === 'execute') {
      const result = await remoteOps(
        'EXECUTE_UPDATE',
        { plan_id: planId },
        actor,
      );
      await telegram('answerCallbackQuery', {
        callback_query_id: query.id,
        text: 'بدأ تنفيذ التحديث.',
      });
      await sendMessage(
        chatId,
        [
          '🟠 بدأ تحديث Ticketty',
          '',
          'الإصدار: ' + (result.ref ?? 'غير معروف'),
          'معرّف العملية: ' + planId,
          '',
          'جاري تنفيذ النسخة الاحتياطية والتحديث والفحوص.',
          '',
          'سأخبرك تلقائيًا عند اكتمال العملية أو فشلها.',
        ].join('\n'),
      );
      void monitorDeployment(chatId, actor, planId);
      return;
    }

    await telegram('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'الإجراء غير معروف.',
      show_alert: true,
    });
  } catch (error) {
    console.error('Telegram callback operation failed', error);
    await telegram('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'تعذر تنفيذ العملية.',
      show_alert: true,
    });
    await sendMessage(
      chatId,
      '🔴 تعذر تنفيذ الطلب الآن. راجع حالة النظام أو أعد المحاولة.',
    );
  }
}

async function sendStatusOverview(chatId, actor) {
  const [runtime, deployment] = await Promise.all([
    systemStatus(),
    remoteOps('STATUS', {}, actor).catch(() => null),
  ]);

  if (!deployment) {
    await sendMessage(chatId, runtime);
    return;
  }

  await sendMessage(
    chatId,
    [
      runtime,
      '',
      '🚀 النشر',
      'الإصدار الحالي: ' + (deployment.release ?? 'غير معروف'),
      'حالة النشر: ' + (deployment.status ?? 'غير معروفة'),
      'الدومين: ' + (deployment.domain ?? 'غير مضبوط'),
      'Remote Ops: ' + (deployment.remote_ops ?? 'غير معروف'),
    ].join('\n'),
  );
}

async function handleProviderSettings(message, chatId, userId, textValue) {
  if (textValue === '/settings' || textValue === '/provider') {
    const configured = state.provider?.name === 'apmix' && await readProviderKey();
    await sendMessage(chatId, [
      '⚙️ إعدادات الذكاء الاصطناعي', '',
      'المزوّد: ' + (configured ? 'APMIX مضبوط' : 'غير مضبوط'),
      'النموذج: ' + (state.provider?.model ?? 'غير محدد'),
      '', 'لإعداد APMIX اكتب: /apmix',
      'سيُطلب منك إرسال المفتاح في رسالة خاصة واحدة. لا ترسله في مجموعة.',
      'سيحاول البوت حذف رسالة المفتاح بعد استلامها، لكن ذلك لا يضمن حذفها من سجل جهازك.'
    ].join('\\n'));
    return true;
  }
  if (textValue === '/apmix') {
    if (!isPrivateChat(message)) { await sendMessage(chatId, 'أرسل أمر الإعداد في محادثة خاصة مع البوت.'); return true; }
    state.pendingProviderSetup = { chatId, userId, expiresAt: Date.now() + 5 * 60 * 1000 };
    await persistState();
    await sendMessage(chatId, 'أرسل مفتاح APMIX الآن كرسالة خاصة خلال 5 دقائق. لن أطلبه مرة أخرى بعد حفظه.');
    return true;
  }
  const pending = state.pendingProviderSetup;
  if (pending && pending.chatId === chatId && pending.userId === userId) {
    if (Date.now() > pending.expiresAt) {
      state.pendingProviderSetup = null; await persistState();
      await sendMessage(chatId, 'انتهت مهلة إعداد المزوّد. اكتب /apmix للبدء من جديد.');
      return true;
    }
    if (!isPrivateChat(message) || textValue.startsWith('/')) return false;
    try {
      const apiKey = validateApiKey(textValue);
      const models = await listModels({ apiKey, baseUrl: DEFAULT_BASE_URL });
      const desired = models.find((item) => item.id === 'claude-sonnet-4-6-free');
      if (!desired) {
        state.pendingProviderSetup = null; await persistState();
        await sendMessage(chatId, 'تم التحقق من الوصول إلى APMIX، لكن النموذج claude-sonnet-4-6-free غير موجود ضمن قائمة النماذج المتاحة لهذا المفتاح. لم أستبدله تلقائيًا. النماذج المتاحة: ' + models.slice(0, 20).map((item) => item.id).join(', '));
        return true;
      }
      await saveProviderKey(apiKey);
      state.provider = { name: 'apmix', baseUrl: DEFAULT_BASE_URL, model: desired.id };
      state.pendingProviderSetup = null;
      await persistState();
      await sendMessage(chatId, '✅ تم التحقق من مفتاح APMIX وحفظه في ملف سري على السيرفر. النموذج المحدد: ' + desired.id + '.');
    } catch (error) {
      state.pendingProviderSetup = null; await persistState();
      await sendMessage(chatId, 'تعذر إعداد APMIX: ' + (error.message || 'فشل التحقق') + '. لم يتم حفظ المفتاح.');
    } finally {
      try { await telegram('deleteMessage', { chat_id: chatId, message_id: message.message_id }); }
      catch { /* Telegram deletion is best-effort; never log message content. */ }
    }
    return true;
  }
  return false;
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
      isPrivateChat(message) &&
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

  if (await handleProviderSettings(message, chatId, userId, textValue)) return;

  if (textValue === '/status') {
    await sendStatusOverview(chatId, operatorActor(message));
    return;
  }

  if (textValue === '/update' || textValue === '/deploy') {
    try {
      const plan = await remoteOps('PLAN_UPDATE', {}, operatorActor(message));
      if (!plan.update) {
        await sendMessage(chatId, '🟢 لا يوجد إصدار أحدث منشور حاليًا.');
        return;
      }
      const rendered = updatePlanMessage(plan);
      await sendMessage(chatId, rendered.text, rendered.reply_markup);
    } catch (error) {
      console.error('Telegram update plan failed', error);
      await sendMessage(chatId, 'تعذر تجهيز خطة التحديث الآن. راجع حالة السيرفر وحاول مرة أخرى.');
    }
    return;
  }

  const intent = intentFromText(textValue);

  try {
    if (intent === 'help') {
      await sendMessage(chatId, helpMessage());
    } else if (intent === 'status') {
      await sendStatusOverview(chatId, operatorActor(message));
    } else if (intent === 'accounting') {
      await sendMessage(chatId, await accountingStatus());
    } else if (intent === 'backup') {
      await sendMessage(chatId, await backupStatus());
    } else if (intent === 'alerts') {
      await sendMessage(chatId, await alertsStatus());
    } else if (intent === 'summary') {
      await sendMessage(chatId, await operationalSummary());
    } else if (intent === 'deployment_status') {
      const result = await remoteOps(
        'STATUS',
        {},
        operatorActor(message),
      );
      await sendMessage(chatId, deploymentStatusMessage(result));
    } else if (intent === 'update') {
      const plan = await remoteOps(
        'PLAN_UPDATE',
        {},
        operatorActor(message),
      );
      if (!plan.update) {
        await sendMessage(chatId, '🟢 لا يوجد إصدار أحدث منشور حاليًا.');
      } else {
        const rendered = updatePlanMessage(plan);
        await sendMessage(chatId, rendered.text, rendered.reply_markup);
      }
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
        allowed_updates: ['message', 'callback_query'],
      });

      for (const update of updates) {
        try {
          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
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

    if (request.method === 'POST' && request.url) {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname !== '/alerts') {
        response.writeHead(404);
        response.end();
        return;
      }

      if (
        !sameSecret(
          alertWebhookToken,
          extractBearerToken(request.headers.authorization),
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

    await telegram('setMyCommands', {
      commands: [
        { command: 'status', description: 'حالة النظام' },
        { command: 'update', description: 'فحص التحديثات' },
        { command: 'help', description: 'المساعدة' },
        { command: 'settings', description: 'إعدادات الذكاء الاصطناعي' },
        { command: 'apmix', description: 'إعداد مزود APMIX' },
      ],
    });

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
