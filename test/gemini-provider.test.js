import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider, GeminiProviderError } from '../src/gemini-provider.js';

const validInterpretation = {
  intent: 'command',
  target: 'violão',
  action: 'adjust_level',
  value: -5,
  relative: true,
  clarification: null,
};

function response(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async json() {
      if (options.jsonError) throw new Error('bad body');
      return payload;
    },
  };
}

function successPayload(value = validInterpretation) {
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] };
}

function provider(fetchImpl, options = {}) {
  return createGeminiProvider({
    enabled: true,
    fetchImpl,
    env: { GEMINI_API_KEY: 'secret-test-key' },
    ...options,
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof GeminiProviderError && error.code === code);
}

test('exige habilitação e consentimento sem fazer requisição', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(successPayload()); };
  await expectCode(createGeminiProvider({ fetchImpl }).interpret({ text: 'abaixa', consent: true }), 'disabled');
  await expectCode(provider(fetchImpl).interpret({ text: 'abaixa', consent: false }), 'consent_required');
  await expectCode(provider(fetchImpl).interpret({ text: '  ', consent: true }), 'invalid_input');
  await expectCode(provider(fetchImpl, { env: {} }).interpret({ text: 'abaixa', consent: true }), 'missing_api_key');
  assert.equal(calls, 0);
});

test('envia somente texto e contexto aprovados, exige JSON e retorna proposta validada', async () => {
  let request;
  const result = await provider(async (url, options) => {
    request = { url, ...options };
    return response(successPayload());
  }).interpret({ text: '  abaixa meu violão  ', context: 'Canal identificado: violão', consent: true });

  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(request.headers['x-goog-api-key'], 'secret-test-key');
  assert.equal(request.body.includes('secret-test-key'), false);
  const body = JSON.parse(request.body);
  assert.equal(body.contents[0].parts[0].text.includes('abaixa meu violão'), true);
  assert.equal(body.contents[0].parts[0].text.includes('Canal identificado: violão'), true);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 512);
  assert.equal(body.tools, undefined);
  assert.deepEqual(result, validInterpretation);
  assert.equal(Object.isFrozen(result), true);
});

test('não inclui contexto quando não foi informado e classifica a interpretação como dado', async () => {
  let body;
  const result = await provider(async (_url, options) => {
    body = JSON.parse(options.body);
    return response(successPayload({ ...validInterpretation, intent: 'clarify', action: 'none', value: null, relative: false, clarification: 'Qual canal?' }));
  }).interpret({ text: 'abaixa um pouco', consent: true });
  assert.equal(body.contents[0].parts[0].text.includes('Contexto permitido:'), false);
  assert.equal(result.intent, 'clarify');
});

test('mapeia falhas de rede, timeout, quota e HTTP sem retentativa', async () => {
  let calls = 0;
  const input = { text: 'abaixa', consent: true };
  await expectCode(provider(async () => { calls += 1; throw new Error('network secret-test-key'); }).interpret(input), 'network');
  await expectCode(provider((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), { timeoutMs: 5 }).interpret(input), 'timeout');
  await expectCode(provider((_url, { signal }) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  }), { timeoutMs: 5 }).interpret(input), 'timeout');
  await expectCode(provider(async () => { calls += 1; return response({}, { ok: false, status: 429 }); }).interpret(input), 'quota');
  await expectCode(provider(async () => { calls += 1; return response({}, { ok: false, status: 500 }); }).interpret(input), 'http');
  assert.equal(calls, 3);
});

test('rejeita corpo inválido, JSON inválido e estrutura não permitida sem vazar chave', async () => {
  const input = { text: 'abaixa', consent: true };
  await expectCode(provider(async () => response(null, { jsonError: true })).interpret(input), 'invalid_response_json');
  await expectCode(provider(async () => response({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })).interpret(input), 'invalid_response_json');
  await expectCode(provider(async () => response(successPayload({ ...validInterpretation, admin: true }))).interpret(input), 'invalid_response_schema');
  await expectCode(provider(async () => response(successPayload({ ...validInterpretation, intent: 'run_command' }))).interpret(input), 'invalid_response_schema');
});

test('rejeita contexto excessivo e configuração de timeout inválida localmente', async () => {
  let calls = 0;
  await expectCode(provider(async () => { calls += 1; }).interpret({ text: 'ok', context: 'x'.repeat(1_001), consent: true }), 'invalid_context');
  assert.equal(calls, 0);
  assert.throws(() => createGeminiProvider({ timeoutMs: 60_001 }), /timeoutMs/);
});

test('classifica envelopes e partes malformados', async () => {
  for (const parts of [{}, [null], [{ text: 42 }], 'texto']) {
    await expectCode(provider(async () => response({ candidates: [{ content: { parts } }] }))
      .interpret({ text: 'pedido', consent: true }), 'invalid_response_json');
  }
});
