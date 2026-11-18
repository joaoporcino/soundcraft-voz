import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIProvider, OpenAIProviderError } from '../src/openai-provider.js';

const proposal = { intent: 'command', target: 'canal 3', action: 'set_points', value: 50, relative: false, clarification: null };
const input = { text: 'mesa, canal 3 em 50', consent: true };
const envelope = (value = proposal) => ({ status: 'completed', output: [{
  type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }],
}] });
const response = (data, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => data });
const provider = (fetchImpl, options = {}) => createOpenAIProvider({ enabled: true, model: 'model-test', fetchImpl,
  env: { OPENAI_API_KEY: 'secret-test-key' }, ...options });
async function rejected(promise, code) {
  await assert.rejects(promise, error => error instanceof OpenAIProviderError && error.code === code && !error.message.includes('secret-test-key'));
}

test('exige seleção explícita, consentimento, entrada válida e chave antes da rede', async () => {
  let calls = 0;
  const fake = async () => { calls++; return response(envelope()); };
  assert.throws(() => createOpenAIProvider({ fetchImpl: fake }), /model/);
  await rejected(createOpenAIProvider({ model: 'model-test', fetchImpl: fake }).interpret(input), 'disabled');
  await rejected(provider(fake).interpret({ ...input, consent: false }), 'consent_required');
  await rejected(provider(fake).interpret({ ...input, text: ' ' }), 'invalid_input');
  await rejected(provider(fake).interpret({ ...input, context: 'a'.repeat(1001) }), 'invalid_context');
  await rejected(provider(fake, { env: {} }).interpret(input), 'missing_api_key');
  assert.equal(calls, 0);
});

test('solicita JSON estrito sem ferramentas ou histórico e retorna proposta imutável', async () => {
  let request;
  const result = await provider(async (url, options) => {
    request = { url, ...options };
    return response(envelope());
  }).interpret({ ...input, context: 'contexto permitido' });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.authorization, 'Bearer secret-test-key');
  assert.equal(request.body.includes('secret-test-key'), false);
  const body = JSON.parse(request.body);
  assert.equal(body.model, 'model-test');
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 512);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(body.tools, undefined);
  assert.deepEqual(JSON.parse(body.input), { pedido: input.text, contexto: 'contexto permitido' });
  assert.deepEqual(result, proposal);
  assert.equal(Object.isFrozen(result), true);
});

test('aceita esclarecimento e mensagem após metadado de raciocínio, sem executar ações', async () => {
  const clarification = { intent: 'clarify', target: null, action: 'none', value: null, relative: false, clarification: 'Qual canal?' };
  const data = envelope(clarification);
  data.output.unshift({ type: 'reasoning', id: 'discarded' });
  assert.deepEqual(await provider(async () => response(data)).interpret(input), clarification);
});

test('recusa falhas de envelope, recusa, resposta incompleta ou saída fora do contrato', async () => {
  const incomplete = { status: 'incomplete', output: [] };
  const refusal = { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'no' }] }] };
  await rejected(provider(async () => response(incomplete)).interpret(input), 'model_incomplete');
  await rejected(provider(async () => response(refusal)).interpret(input), 'refusal');
  const bad = [null, {}, { status: 'completed', output: [] }, { status: 'completed', output: [null] },
    { status: 'completed', output: [{ type: 'function_call' }] },
    { status: 'completed', output: [{ type: 'message', role: 'user', status: 'completed', content: [] }] }];
  for (const payload of bad) await rejected(provider(async () => response(payload)).interpret(input), 'invalid_response_envelope');
  const malformed = envelope(); malformed.output[0].content[0].text = '{';
  await rejected(provider(async () => response(malformed)).interpret(input), 'invalid_response_json');
  for (const value of [{ ...proposal, extra: 'unsafe' }, { ...proposal, action: 'shell' }, { ...proposal, value: '50' },
    { ...proposal, intent: 'clarify', action: 'mute' }, { ...proposal, clarification: 'x'.repeat(501) }]) {
    await rejected(provider(async () => response(envelope(value))).interpret(input), 'invalid_response_schema');
  }
});

test('falhas de rede, quota, HTTP e timeout são classificadas sem repetir nem expor segredo', async () => {
  let calls = 0;
  await rejected(provider(async () => { calls++; throw new Error('secret-test-key'); }).interpret(input), 'network');
  await rejected(provider(async () => { calls++; return response({}, { ok: false, status: 429 }); }).interpret(input), 'quota');
  await rejected(provider(async () => { calls++; return response({}, { ok: false, status: 500 }); }).interpret(input), 'http');
  await rejected(provider(async () => ({ ok: true, json: async () => { throw new Error('secret-test-key'); } })).interpret(input), 'invalid_response_json');
  await rejected(provider(() => new Promise(() => {}), { timeoutMs: 5 }).interpret(input), 'timeout');
  await rejected(provider(async () => ({ ok: true, json: () => new Promise(() => {}) }), { timeoutMs: 5 }).interpret(input), 'timeout');
  assert.equal(calls, 3);
  assert.throws(() => provider(async () => {}, { timeoutMs: 60_001 }), /timeout/);
  assert.throws(() => provider(async () => {}, { maxOutputTokens: 0 }), /maxOutputTokens/);
});
