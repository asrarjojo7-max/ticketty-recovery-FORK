import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBearerToken, intentFromText, normalizeArabic } from './core.mjs';

test('normalizes common Arabic punctuation and whitespace', () => {
  assert.equal(normalizeArabic('  حالة النظام؟  '), 'حالة النظام');
});

test('understands natural Arabic status questions', () => {
  assert.equal(intentFromText('النظام شغال؟'), 'status');
  assert.equal(intentFromText('كيف وضع المحاسبة؟'), 'accounting');
  assert.equal(intentFromText('هل توجد مشاكل الآن؟'), 'alerts');
  assert.equal(intentFromText('هل أخذ النظام نسخة احتياطية؟'), 'backup');
  assert.equal(intentFromText('ماذا حدث اليوم؟'), 'summary');
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
