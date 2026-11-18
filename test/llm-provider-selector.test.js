import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmProviderSelector } from '../src/llm-provider-selector.js';
import { validateToolProposal } from '../src/tool-validation.js';
import { createGeminiProvider } from '../src/gemini-provider.js';

const valid = { intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null };
const expectCode = code => error => error.code === code && !error.message.includes('segredo');

test('seleciona Gemini, OpenAI ou Anthropic sem encaminhar a outro adaptador', async () => {
  const calls = [];
  const adapters = Object.fromEntries(['gemini', 'openai', 'anthropic'].map(name => [name, {
    interpret: async input => { calls.push({ name, input }); return valid; },
  }]));
  const selector = createLlmProviderSelector({ adapters });
  assert.equal(selector.status().selected, 'none');
  await assert.rejects(selector.interpret({ text: 'teste', consent: true }), expectCode('provider_unavailable'));
  for (const name of ['gemini', 'openai', 'anthropic']) {
    assert.equal(selector.select(name).available, true);
    assert.deepEqual(await selector.interpret({ text: 'mute canal 3', context: 'sessão', consent: true }), valid);
  }
  assert.deepEqual(calls.map(item => item.name), ['gemini', 'openai', 'anthropic']);
  assert.deepEqual(calls[0].input, { text: 'mute canal 3', context: 'sessão', consent: true });
});

test('recusa sem consentimento, configuração válida ou adaptador, sem chamar rede', async () => {
  let calls = 0;
  const selector = createLlmProviderSelector({ adapters: { gemini: { interpret: async () => { calls++; return valid; } } } });
  assert.equal(selector.select('openai').available, false);
  await assert.rejects(selector.interpret({ text: 'pedido', consent: true }), expectCode('provider_unavailable'));
  selector.select('gemini');
  await assert.rejects(selector.interpret({ text: 'pedido' }), expectCode('consent_required'));
  await assert.rejects(selector.interpret({ text: '', consent: true }), expectCode('invalid_input'));
  await assert.rejects(selector.interpret({ text: 'pedido', context: {}, consent: true }), expectCode('invalid_input'));
  assert.throws(() => selector.select('desconhecido'), /desconhecido/);
  assert.equal(calls, 0);
});

test('falhas e respostas malformadas não vazam dados nem contornam validação determinística', async () => {
  let response = { ...valid, extra: 'segredo' };
  const selector = createLlmProviderSelector({ adapters: { gemini: { interpret: async () => response } } });
  selector.select('gemini');
  await assert.rejects(selector.interpret({ text: 'pedido', consent: true }), expectCode('invalid_response'));
  response = { ...valid, target: 'canal 999' };
  const proposal = await selector.interpret({ text: 'pedido', consent: true });
  assert.throws(() => validateToolProposal(proposal, { authorize: () => true }));
  const failed = createLlmProviderSelector({ adapters: { anthropic: { interpret: async () => { throw new Error('segredo'); } } } });
  failed.select('anthropic');
  await assert.rejects(failed.interpret({ text: 'pedido', consent: true }), expectCode('provider_failed'));
});

test('troca durante pedido descarta resposta anterior e nunca reenvia automaticamente', async () => {
  let release, otherCalls = 0;
  const selector = createLlmProviderSelector({ adapters: {
    gemini: { interpret: () => new Promise(resolve => { release = resolve; }) },
    openai: { interpret: async () => { otherCalls++; return valid; } },
  } });
  selector.select('gemini');
  const pending = selector.interpret({ text: 'pedido', consent: true });
  selector.select('openai');
  release(valid);
  await assert.rejects(pending, expectCode('selection_changed'));
  assert.equal(otherCalls, 0);
  assert.deepEqual(await selector.interpret({ text: 'novo', consent: true }), valid);
  assert.equal(otherCalls, 1);
});

test('adaptador Gemini existente cumpre o contrato com transporte simulado', async () => {
  let requests = 0;
  const gemini = createGeminiProvider({ enabled: true, apiKeyEnv: 'TEST_KEY', env: { TEST_KEY: 'fake' },
    fetchImpl: async () => { requests++; return { ok: true, json: async () => ({ candidates: [{
      finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(valid) }] },
    }] }) }; },
  });
  const selector = createLlmProviderSelector({ adapters: { gemini } });
  selector.select('gemini');
  assert.deepEqual(await selector.interpret({ text: 'mute canal 3', consent: true }), valid);
  assert.equal(requests, 1);
});
