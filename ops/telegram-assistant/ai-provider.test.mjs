import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL,
  chatCompletion,
  classifyIntent,
  listModels,
  normalizeBaseUrl,
  validateApiKey,
  validateModelAccess,
} from './ai-provider.mjs';

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test('pins APMIX to HTTPS approved API bases', () => {
  assert.equal(normalizeBaseUrl('https://api.apmix.ai/v1/'), 'https://api.apmix.ai/v1');
  assert.throws(() => normalizeBaseUrl('https://api.apmix.ai'));
  assert.throws(() => normalizeBaseUrl('http://api.apmix.ai/v1'));
  assert.throws(() => normalizeBaseUrl('https://evil.example/v1'));
  assert.throws(() => normalizeBaseUrl('https://user:pass@api.apmix.ai/v1'));
});

test('validates API keys without exposing them in errors', () => {
  assert.equal(validateApiKey('  apx_live_test  '), 'apx_live_test');
  assert.throws(() => validateApiKey(''));
  assert.throws(() => validateApiKey('key\nforged'));
});

test('lists only valid model identifiers from the key-scoped catalog', async () => {
  const models = await listModels({
    apiKey: 'apx_live_test',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.apmix.ai/v1/models');
      assert.equal(init.headers.authorization, 'Bearer apx_live_test');
      return response(200, { data: [{ id: 'claude-sonnet-4-6' }, {}, { id: 7 }] });
    },
  });
  assert.deepEqual(models, [{ id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' }]);
});

test('does not silently substitute a model absent from the account catalog', async () => {
  await assert.rejects(
    validateModelAccess({
      apiKey: 'apx_live_test',
      fetchImpl: async () => response(200, { data: [{ id: 'claude-sonnet-4-6' }] }),
    }, DEFAULT_MODEL),
    /No model substitution was made/,
  );
});

test('uses the selected model and bounds chat request content', async () => {
  let sent;
  const result = await chatCompletion({
    apiKey: 'apx_live_test',
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'مرحبا' }],
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.apmix.ai/v1/chat/completions');
      sent = JSON.parse(init.body);
      return response(200, { choices: [{ message: { content: 'أهلًا' } }] });
    },
  });
  assert.equal(sent.model, 'claude-sonnet-4-6');
  assert.equal(result.choices[0].message.content, 'أهلًا');
  await assert.rejects(chatCompletion({
    apiKey: 'apx_live_test',
    messages: [{ role: 'system', content: 'x'.repeat(12001) }],
    fetchImpl: async () => response(200, {}),
  }), /invalid or too large/);
});

test('maps quota and plan errors without retrying or paid fallback', async () => {
  await assert.rejects(listModels({
    apiKey: 'apx_live_test',
    fetchImpl: async () => response(429, { error: { code: 'allowance_exhausted' } }),
  }), /No paid or alternate-model fallback/);
  await assert.rejects(listModels({
    apiKey: 'apx_live_test',
    fetchImpl: async () => response(403, { error: { code: 'model_not_in_plan' } }),
  }), /not available on this APMIX plan/);
});

test('AI intent classifier accepts only the finite registered intent set', async () => {
  const classify = async (content) => classifyIntent({
    apiKey: 'apx_live_test',
    text: 'كيف وضع النظام؟',
    fetchImpl: async (_url, init) => {
      const sent = JSON.parse(init.body);
      assert.equal(sent.model, DEFAULT_MODEL);
      assert.equal(sent.messages.length, 2);
      assert.equal(sent.messages[1].content, 'كيف وضع النظام؟');
      return response(200, { choices: [{ message: { content } }] });
    },
  });
  assert.equal(await classify('{"intent":"status"}'), 'status');
  assert.equal(await classify('{"intent":"delete_database"}'), null);
  assert.equal(await classify('not-json'), null);
  assert.equal(await classify('{"intent":"update","arguments":{"shell":"rm -rf /"}}'), null);
});

test('AI classifier rejects oversized user input before network access', async () => {
  await assert.rejects(classifyIntent({
    apiKey: 'apx_live_test',
    text: 'x'.repeat(2001),
    fetchImpl: async () => { throw new Error('network must not be called'); },
  }), /too large/);
});
