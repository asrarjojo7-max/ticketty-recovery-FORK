function normalizeArabic(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/@\w+/g, '')
    .replace(/[؟?!.،,:;؛]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function intentFromText(input) {
  const text = normalizeArabic(input);

  if (
    text === '/help' ||
    text.includes('مساعدة') ||
    text.includes('ماذا تستطيع')
  ) {
    return 'help';
  }

  if (
    text.includes('حالة التحديث') ||
    text.includes('هل تم التحديث') ||
    text.includes('هل انتهى التحديث') ||
    text.includes('ما الذي يحدث في التحديث') ||
    text.includes('ماذا يحدث في التحديث')
  ) {
    return 'deployment_status';
  }

  if (
    text.includes('حالة النظام') ||
    text.includes('النظام شغال') ||
    text.includes('النظام يعمل') ||
    text === 'النظام'
  ) {
    return 'status';
  }

  if (
    text.includes('حالة التحديث') ||
    text.includes('هل انتهى التحديث') ||
    text.includes('ما الذي يحدث في التحديث') ||
    text.includes('ماذا يحدث في التحديث')
  ) {
    return 'deployment_status';
  }

  if (
    text.includes('المحاسبة') ||
    text.includes('المحاسبي') ||
    text.includes('العمليات المعلقة') ||
    text.includes('كم عملية معلقة')
  ) {
    return 'accounting';
  }

  if (
    text.includes('النسخ الاحتياطي') ||
    text.includes('نسخة احتياطية') ||
    text.includes('النسخة الاحتياطية')
  ) {
    return 'backup';
  }

  if (
    text.includes('المشاكل') ||
    text.includes('التنبيهات') ||
    text.includes('الإنذارات') ||
    text.includes('في مشكلة') ||
    text.includes('مشاكل')
  ) {
    return 'alerts';
  }

  if (
    text.includes('ارجع للإصدار السابق') ||
    text.includes('الرجوع للإصدار السابق') ||
    text.includes('تراجع عن التحديث') ||
    text.includes('rollback') ||
    text === 'رجوع'
  ) {
    return 'rollback';
  }

  if (
    text.includes('هل يوجد تحديث') ||
    text.includes('في تحديث') ||
    text.includes('التحديث') ||
    text.includes('إصدار جديد') ||
    text === 'تحديث'
  ) {
    return 'update';
  }

  if (
    text.includes('ملخص اليوم') ||
    text.includes('ملخص') ||
    text.includes('ماذا حدث اليوم')
  ) {
    return 'summary';
  }

  return null;
}

function extractStartPairingCode(input) {
  if (typeof input !== 'string') return null;

  const match = input.trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/i);
  return match ? match[1] ?? '' : null;
}

function extractBearerToken(authorization) {
  if (typeof authorization !== 'string') return null;
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function createRateLimiter({ limit = 10, windowMs = 60_000, maxKeys = 500 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1 ||
      !Number.isInteger(maxKeys) || maxKeys < 1) throw new Error('Rate limiter configuration is invalid');
  const entries = new Map();
  return function allow(key, now = Date.now()) {
    if (typeof key !== 'string' || !key) return false;
    const recent = (entries.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) { entries.set(key, recent); return false; }
    recent.push(now);
    entries.set(key, recent);
    if (entries.size > maxKeys) {
      for (const [candidate, timestamps] of entries) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) entries.delete(candidate);
        if (entries.size <= Math.floor(maxKeys * 0.8)) break;
      }
    }
    return true;
  };
}

export {
  extractBearerToken,
  extractStartPairingCode,
  intentFromText,
  normalizeArabic,
};
