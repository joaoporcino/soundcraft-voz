import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicProvider } from '../src/anthropic-provider.js';
import { createLlmProviderSelector } from '../src/llm-provider-selector.js';

const VALID = { intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null };
const validPayload = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] });
const response = payload => ({ ok: true, json: async () => payload });
const settings = { enabled: true, model: 'claude-test', env: { ANTHROPIC_API_KEY: 'segredo-de-teste' } };
const errorCode = code => error => error.code === code && !error.message.includes('segredo-de-teste');

test('envia contrato estruturado e aceita apenas consentimento explícito com credencial no ambiente', async () => {
  let request;
  const provider = createAnthropicProvider({ ...settings, fetchImpl: async (url, init) => { request = { url, init }; return response(validPayload(VALID)); } });
  await assert.rejects(provider.interpret({ text: 'mesa' }), errorCode('consent_required'));
  assert.equal(request, undefined);
  assert.deepEqual(await provider.interpret({ text: 'muta canal 3', context: 'teste', consent: true }), VALID);
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.init.headers['x-api-key'], 'segredo-de-teste');
  assert.equal(request.init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, 'claude-test');
  assert.equal(body.max_tokens, 512);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.match(body.messages[0].content, /muta canal 3/);
  assert.match(body.messages[0].content, /Contexto permitido: teste/);
  assert.doesNotMatch(request.init.body, /segredo-de-teste/);
  const selector = createLlmProviderSelector({ adapters: { anthropic: provider } });
  selector.select('anthropic');
  assert.deepEqual(await selector.interpret({ text: 'mute', consent: true }), VALID);
});

test('valida configuração, texto, credencial e habilitação antes da rede', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(validPayload(VALID)); };
  assert.throws(() => createAnthropicProvider({ model: '../a' }), /model/);
  assert.throws(() => createAnthropicProvider({ model: 'a', timeoutMs: 0 }), /timeout/);
  assert.throws(() => createAnthropicProvider({ model: 'a', apiKeyEnv: 'com espaço' }), /environment/);
  const disabled = createAnthropicProvider({ ...settings, enabled: false, fetchImpl });
  await assert.rejects(disabled.interpret({ text: 'oi', consent: true }), errorCode('disabled'));
  const provider = createAnthropicProvider({ ...settings, fetchImpl });
  for (const input of [{ text: '', consent: true }, { text: 'a'.repeat(2001), consent: true },
    { text: 'oi', context: 'a'.repeat(1001), consent: true }]) await assert.rejects(provider.interpret(input), errorCode('invalid_input'));
  await assert.rejects(createAnthropicProvider({ ...settings, env: {}, fetchImpl }).interpret({ text: 'oi', consent: true }), errorCode('missing_api_key'));
  assert.equal(calls, 0);
});

test('classifica quota, HTTP, exceção externa e timeout sem vazar conteúdo', async () => {
  const call = fetchImpl => createAnthropicProvider({ ...settings, fetchImpl }).interpret({ text: 'oi', consent: true });
  await assert.rejects(call(async () => ({ ok: false, status: 429 })), errorCode('quota'));
  await assert.rejects(call(async () => ({ ok: false, status: 400 })), errorCode('http'));
  await assert.rejects(call(async () => { throw Error('segredo-de-teste'); }), errorCode('network'));
  await assert.rejects(createAnthropicProvider({ ...settings, timeoutMs: 10, fetchImpl: () => new Promise(() => {}) })
    .interpret({ text: 'oi', consent: true }), errorCode('timeout'));
  await assert.rejects(createAnthropicProvider({ ...settings, timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) })
    .interpret({ text: 'oi', consent: true }), errorCode('timeout'));
});

test('recusas, truncamento, envelopes inesperados e dados malformados falham fechados', async () => {
  const call = payload => createAnthropicProvider({ ...settings, fetchImpl: async () => response(payload) })
    .interpret({ text: 'oi', consent: true });
  await assert.rejects(call({ stop_reason: 'refusal', content: [{ type: 'text', text: 'não posso' }] }), errorCode('refusal'));
  for (const payload of [{}, { stop_reason: 'max_tokens', content: [] }, { stop_reason: null }]) await assert.rejects(call(payload), errorCode('model_incomplete'));
  for (const content of [[], [{ type: 'tool_use', text: '{}' }], [{ type: 'text', text: '{}' }, { type: 'text', text: '{}' }], [{ type: 'text', text: '{' }]]) {
    await assert.rejects(call({ stop_reason: 'end_turn', content }), errorCode('invalid_response_json'));
  }
  for (const value of [{ ...VALID, action: 'shell' }, { ...VALID, extra: true }, { ...VALID, value: '0' },
    { ...VALID, intent: 'clarify' }, { ...VALID, target: null, relative: 'false' }, { ...VALID, clarification: 'a'.repeat(501) }]) {
    await assert.rejects(call(validPayload(value)), errorCode('invalid_response_schema'));
  }
});
