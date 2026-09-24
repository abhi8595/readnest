require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseChatResponse, normalizeAiBaseUrl, explainCacheKey, AiError,
  AI_DEFAULT_BASE_URL, AI_DEFAULT_MODEL,
} = require('../src/lib/explain');

test('explain F4: chat response parsing', () => {
  assert.equal(
    parseChatResponse({ choices: [{ message: { content: '  Plain meaning. ' } }] }),
    'Plain meaning.',
  );
  assert.throws(() => parseChatResponse({ choices: [] }), AiError);
  assert.throws(
    () => parseChatResponse({ error: { message: 'bad key' } }),
    /bad key/,
  );
});

test('explain F4: base url normalization', () => {
  assert.equal(normalizeAiBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.equal(normalizeAiBaseUrl('http://localhost:1234/v1'), 'http://localhost:1234/v1');
  assert.throws(() => normalizeAiBaseUrl('notaurl'), AiError);
});

test('explain F4: cache keys scoped per book+passage', () => {
  assert.equal(explainCacheKey('b1', 'x'), explainCacheKey('b1', 'x'));
  assert.notEqual(explainCacheKey('b1', 'x'), explainCacheKey('b1', 'y'));
  assert.notEqual(explainCacheKey('b1', 'x'), explainCacheKey('b2', 'x'));
});

test('explain F4: empty/garbage rejected before network', async () => {
  const { explainPassage } = require('../src/lib/explain');
  await assert.rejects(
    () => explainPassage('   ', 'T', { baseUrl: AI_DEFAULT_BASE_URL, model: AI_DEFAULT_MODEL, apiKey: 'k' }, 'b1'),
    AiError,
  );
  await assert.rejects(
    () => explainPassage('hi', 'T', { baseUrl: AI_DEFAULT_BASE_URL, model: AI_DEFAULT_MODEL, apiKey: '' }, 'b1'),
    /key/i,
  );
});
