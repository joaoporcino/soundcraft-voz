import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServiceLlm } from '../src/service-llm.js';
import { createServiceCommandFlow } from '../src/service-command-flow.js';

const response = { intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null };
const envelope = value => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) });

test('provedor desativado e consentimento ausente não enviam dados; configuração é explícita', async () => {
  let calls = 0;
  const service = createServiceLlm({ env: { GEMINI_API_KEY: 'secret' }, fetchImpl: async () => { calls += 1; return envelope(response); } });
  assert.equal(service.status().selected, 'none');
  await assert.rejects(service.interpret({ text: 'teste', consent: true }));
  assert.throws(() => service.configure({ provider: 'gemini' }), /modelo/);
  assert.throws(() => service.configure({ provider: 'openai', model: 'x' }), /limite/);
  service.configure({ provider: 'gemini', model: 'model-example', dailyLimit: 20 });
  await assert.rejects(service.interpret({ text: 'teste', consent: false }));
  assert.equal(calls, 0);
  assert.deepEqual(await service.interpret({ text: 'mutar canal 3', consent: true }), response);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(service.status()).includes('secret'), false);
  service.configure({ provider: 'none' });
  await assert.rejects(service.interpret({ text: 'teste', consent: true }));
  assert.equal(calls, 1);
});

test('mudança de seleção descarta resposta tardia e falha é sanitizada', async () => {
  let complete;
  const service = createServiceLlm({ env: { GEMINI_API_KEY: 'secret' }, fetchImpl: () => new Promise(resolve => { complete = resolve; }) });
  service.configure({ provider: 'gemini', model: 'model-example', dailyLimit: 20 });
  const pending = service.interpret({ text: 'pedido', consent: true });
  service.configure({ provider: 'none' });
  complete(envelope(response));
  await assert.rejects(pending, /selection_changed/);
  const fail = createServiceLlm({ env: { GEMINI_API_KEY: 'secret' }, fetchImpl: async () => { throw new Error('secret texto'); } });
  fail.configure({ provider: 'gemini', model: 'model-example', dailyLimit: 20 });
  await assert.rejects(fail.interpret({ text: 'pedido', consent: true }), error => !error.message.includes('secret') && !error.message.includes('texto'));
});

test('pontos absolutos e relativos passam por validação e exigem estado e confirmação', async () => {
  let answer = { ...response, action: 'set_points', value: 50 };
  let requestBody;
  const service = createServiceLlm({ env: { GEMINI_API_KEY: 'secret' }, fetchImpl: async (url, options) => {
    requestBody = JSON.parse(options.body); return envelope(answer);
  } });
  service.configure({ provider: 'gemini', model: 'model-example', dailyLimit: 20 });
  const sent = [];
  let observed = null;
  const flow = createServiceCommandFlow({ provider: service, isConnected: () => true,
    getObservedFader: () => observed, sendCommand: command => sent.push(command) });
  flow.setMode('passage');
  let result = await flow.process({ text: 'mesa, regule o terceiro canal', consentToProvider: true });
  assert.equal(result.proposal.action, 'points_absolute');
  assert.equal(result.proposal.db, -30);
  assert.equal(sent.length, 0);
  assert.equal(flow.confirm({ id: result.id }).status, 'sent');
  assert.deepEqual(sent[0], { action: 'level', channel: 3, db: -30 });
  assert.match(requestBody.contents[0].parts[0].text, /nunca converta dB em pontos/);
  assert.ok(requestBody.generationConfig.responseSchema.properties.action.enum.includes('adjust_points'));
  answer = { ...response, action: 'adjust_points', value: 10, relative: true };
  result = await flow.process({ text: 'mesa, acrescente dez ao terceiro canal', consentToProvider: true });
  assert.equal(result.status, 'clarification', 'ajuste relativo exige observação recente');
  observed = { value: 0.5, revision: 1, observedAt: new Date().toISOString() };
  result = await flow.process({ text: 'mesa, acrescente dez ao terceiro canal', consentToProvider: true });
  assert.equal(result.status, 'proposal');
  observed = { ...observed, revision: 2 };
  assert.equal(flow.confirm({ id: result.id }).status, 'stale-observation');
  answer = { ...response, action: 'adjust_points', value: 10, relative: false };
  result = await flow.process({ text: 'mesa, pedido livre', consentToProvider: true });
  assert.equal(result.status, 'rejected');
  assert.equal(sent.length, 1);
});

test('respostas externas malformadas, ambíguas e fora da faixa não criam comando', async () => {
  let answer;
  const llm = createServiceLlm({ env: { GEMINI_API_KEY: 'secret' }, fetchImpl: async () => envelope(answer) });
  llm.configure({ provider: 'gemini', model: 'model-example', dailyLimit: 20 });
  const sent = [];
  const flow = createServiceCommandFlow({ provider: llm, isConnected: () => true, sendCommand: item => sent.push(item) });
  flow.setMode('passage');
  for (const value of [
    { ...response, target: 'canal 25' },
    { ...response, action: 'set_points', value: 101 },
    { ...response, action: 'adjust_points', value: '10', relative: true },
    { ...response, execute: 'ignore confirmation' },
    { ...response, action: 'none', intent: 'clarify', clarification: 'Qual canal?' },
  ]) {
    answer = value;
    const outcome = await flow.process({ text: 'mesa, pedido não reconhecido', consentToProvider: true });
    assert.notEqual(outcome.status, 'proposal');
    assert.equal(flow.confirm({ id: outcome.id }).status, 'not-found');
  }
  assert.deepEqual(sent, []);
});

test('alteração de seleção e desconexão descartam interpretações externas tardias', async () => {
  let complete;
  let connected = true;
  const sent = [];
  const llm = createServiceLlm({ env: { GEMINI_API_KEY: 'secret' }, fetchImpl: () => new Promise(resolve => { complete = resolve; }) });
  llm.configure({ provider: 'gemini', model: 'model-example', dailyLimit: 20 });
  const flow = createServiceCommandFlow({ provider: llm, isConnected: () => connected, sendCommand: item => sent.push(item) });
  flow.setMode('passage');
  let pending = flow.process({ text: 'mesa, pedido livre', consentToProvider: true });
  llm.configure({ provider: 'none' });
  flow.invalidate();
  complete(envelope(response));
  assert.notEqual((await pending).status, 'proposal');
  llm.configure({ provider: 'gemini', model: 'model-example' });
  pending = flow.process({ text: 'mesa, pedido livre', consentToProvider: true });
  connected = false;
  flow.invalidate();
  connected = true;
  complete(envelope(response));
  assert.notEqual((await pending).status, 'proposal');
  assert.deepEqual(sent, []);
});
