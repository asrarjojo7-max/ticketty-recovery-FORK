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
    text.includes('حالة النظام') ||
    text.includes('النظام شغال') ||
    text.includes('النظام يعمل') ||
    text === 'النظام'
  ) {
    return 'status';
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

function extractBearerToken(authorization) {
  if (typeof authorization !== 'string') return null;
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

export { extractBearerToken, intentFromText, normalizeArabic };
