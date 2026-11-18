import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCommandFlow } from '../src/service-command-flow.js';

test('origens independentes mantêm propostas e recusam confirmação de controle já alterado', async () => {
  const sent = [];
  const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: command => sent.push(command),
    modeConfig: { passageInputs: ['a', 'b', 'c'], masterInputId: 'a' } });
  flow.setMode('passage');
  const a = await flow.process({ inputId: 'a', text: 'mesa, mute canal 3' });
  const b = await flow.process({ inputId: 'b', text: 'mesa, desmutar canal 3' });
  const c = await flow.process({ inputId: 'c', text: 'mesa, mute canal 4' });
  assert.equal(flow.confirm({ id: a.id }).status, 'sent');
  assert.equal(flow.confirm({ id: b.id }).status, 'stale');
  assert.equal(flow.confirm({ id: c.id }).status, 'sent');
  assert.deepEqual(sent.map(item => item.channel), [3, 4]);
});

test('interpretação tardia de controle alterado e revogação não executam pedidos', async () => {
  let release;
  const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: () => {},
    modeConfig: { passageInputs: ['a', 'b'], masterInputId: 'a' },
    provider: { interpret: () => new Promise(resolve => { release = resolve; }) } });
  flow.setMode('passage');
  const slow = flow.process({ inputId: 'a', text: 'mesa, pedido livre', consentToProvider: true });
  const fast = await flow.process({ inputId: 'b', text: 'mesa, mute canal 3' });
  assert.equal(flow.confirm({ id: fast.id }).status, 'sent');
  release({ intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null });
  const old = await slow;
  assert.equal(flow.confirm({ id: old.id }).status, 'stale');
  const next = await flow.process({ inputId: 'a', text: 'mesa, mute canal 4' });
  flow.configureMode({ passageInputs: ['b'], masterInputId: 'b' });
  assert.equal(flow.confirm({ id: next.id }).status, 'not-found');
});

test('cancelar em uma entrada não cancela proposta de outra', async () => {
  const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: () => {},
    modeConfig: { passageInputs: ['a', 'b'], masterInputId: 'a' } });
  flow.setMode('passage');
  const a = await flow.process({ inputId: 'a', text: 'mesa, mute canal 3' });
  const b = await flow.process({ inputId: 'b', text: 'mesa, mute canal 4' });
  await flow.process({ inputId: 'a', text: 'cancelar' });
  assert.equal(flow.confirm({ id: a.id }).status, 'not-found');
  assert.equal(flow.confirm({ id: b.id }).status, 'sent');
});

test('provedor desabilitado retorna indisponível sem solicitar consentimento nem enviar dados', async () => {
  let calls = 0;
  let available = false;
  const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: () => {},
    modeConfig: { passageInputs: ['a'], masterInputId: 'a' },
    provider: { status: () => ({ available }), interpret: async () => { calls++; throw new Error('rede'); } } });
  flow.setMode('passage');
  assert.equal((await flow.process({ inputId: 'a', text: 'mesa, pedido desconhecido' })).status, 'unavailable');
  assert.equal(calls, 0);
  available = true;
  assert.equal((await flow.process({ inputId: 'a', text: 'mesa, pedido desconhecido' })).status, 'consent-required');
  assert.equal(calls, 0);
  assert.equal((await flow.process({ inputId: 'a', text: 'mesa, pedido desconhecido', consentToProvider: true })).status, 'interpretation-failed');
  assert.equal(calls, 1);
});
