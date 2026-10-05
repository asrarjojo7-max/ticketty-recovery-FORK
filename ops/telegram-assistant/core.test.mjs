import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBearerToken,
  extractStartPairingCode,
  intentFromText,
  normalizeArabic,
} from './core.mjs';

test('normalizes common Arabic punctuation and whitespace', () => {
  assert.equal(normalizeArabic('  حالة النظام؟  '), 'حالة النظام');
});

test('understands natural Arabic status questions', () => {
  assert.equal(intentFromText('النظام شغال؟'), 'status');
  assert.equal(intentFromText('كيف وضع المحاسبة؟'), 'accounting');
  assert.equal(intentFromText('هل توجد مشاكل الآن؟'), 'alerts');
  assert.equal(intentFromText('هل أخذ النظام نسخة احتياطية؟'), 'backup');
  assert.equal(intentFromText('ماذا حدث اليوم؟'), 'summary');
  assert.equal(intentFromText('هل يوجد تحديث؟'), 'update');
  assert.equal(intentFromText('يوجد إصدار جديد؟'), 'update');
  assert.equal(intentFromText('ارجع للإصدار السابق'), 'rollback');
  assert.equal(intentFromText('rollback'), 'rollback');
  assert.equal(intentFromText('حالة التحديث'), 'deployment_status');
  assert.equal(intentFromText('هل انتهى التحديث؟'), 'deployment_status');
});

test('parses only valid Telegram /start pairing commands', () => {
  assert.equal(extractStartPairingCode('/start'), '');
  assert.equal(extractStartPairingCode('/start abc123'), 'abc123');
  assert.equal(extractStartPairingCode('/start@ticketty_bot abc123'), 'abc123');
  assert.equal(extractStartPairingCode(' /start   abc123  '), 'abc123');
  assert.equal(extractStartPairingCode('/started abc123'), null);
  assert.equal(extractStartPairingCode('/start abc123 extra'), null);
});

test('does not guess unknown requests', () => {
  assert.equal(intentFromText('احذف كل البيانات'), null);
});

test('extracts only a bearer authorization token', () => {
  assert.equal(
    extractBearerToken('Bearer secret-value'),
    'secret-value',
  );
  assert.equal(extractBearerToken('Basic secret-value'), null);
  assert.equal(extractBearerToken('Bearer '), null);
  assert.equal(extractBearerToken(undefined), null);
});

test('AI request limiter enforces per-key windows and bounded key count', () => {
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2 });
  assert.equal(allow('operator-a', 100), true);
  assert.equal(allow('operator-a', 200), true);
  assert.equal(allow('operator-a', 300), false);
  assert.equal(allow('operator-a', 1200), true);
  assert.equal(allow('', 1200), false);
  assert.throws(() => createRateLimiter({ limit: 0 }), /invalid/);
});
