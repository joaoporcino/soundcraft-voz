import test from 'node:test';
import assert from 'node:assert/strict';
import { createModePolicy } from '../src/mode-policy.js';
import { createSimulatedCommandFlow } from '../src/simulated-command-flow.js';

const terminal = { type: 'terminal', authorized: true };
const external = { intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null };
function setup(overrides = {}) {
  const policy = createModePolicy({ passageInputs: ['a', 'b'], masterInputId: 'a' });
  policy.setMode('passage', terminal);
  const flow = createSimulatedCommandFlow({ modePolicy: policy, authorizeActivation: () => true,
    authorizeCommand: () => true, authorizeConfirmation: ({ origin }) => origin?.authorized === true, ...overrides });
  flow.setConnected(true);
  return { flow, policy };
}
const send = (flow, text, inputId = 'a') => flow.process({ inputId, text });
const confirm = (flow, proposal, inputId = 'a', origin = terminal) => flow.confirm({ inputId, id: proposal.id, origin });

test('local activation creates a one-use proposal, bound to input and explicit confirmation', async () => {
  const { flow } = setup();
  assert.equal((await send(flow, 'mesa')).status, 'waiting');
  const proposal = await send(flow, 'mute canal 3');
  assert.equal(proposal.status, 'proposal');
  assert.equal(flow.getChannel(3).mute, false);
  assert.equal(confirm(flow, proposal, 'b').status, 'not-found');
  assert.equal(confirm(flow, proposal).status, 'executed');
  assert.equal(flow.getChannel(3).mute, true);
  assert.equal(confirm(flow, proposal).status, 'not-found');
  const level = await send(flow, 'mesa, canal 2 em menos 6 db');
  assert.equal(confirm(flow, level).state.faderDb, -6);
  assert.equal(flow.getChannel(3).faderDb, 0);
});

test('denial consumes proposal and revalidates authorization before applying', async () => {
  let allowed = true;
  const { flow } = setup({ authorizeCommand: () => allowed });
  let proposal = await send(flow, 'mesa, mute canal 3');
  assert.equal(confirm(flow, proposal, 'a', {}).status, 'denied');
  assert.equal(confirm(flow, proposal).status, 'not-found');
  proposal = await send(flow, 'mesa, mute canal 3');
  allowed = false;
  assert.equal(confirm(flow, proposal).status, 'rejected');
  assert.equal(flow.getChannel(3).mute, false);
});

test('cancel, pause, explicit revocation and disconnect invalidate old requests without replay', async () => {
  const { flow, policy } = setup();
  for (const action of [
    async () => send(flow, 'cancelar'),
    () => { policy.setMode('paused', terminal); policy.setMode('passage', terminal); },
    () => flow.invalidate('a'),
    () => { flow.setConnected(false); flow.setConnected(true); },
  ]) {
    const proposal = await send(flow, 'mesa, mute canal 3');
    await action();
    assert.equal(confirm(flow, proposal).status, 'not-found');
    assert.equal(flow.getChannel(3).mute, false);
  }
});

test('late provider and concurrent requests cannot restore invalidated proposals', async () => {
  let release;
  const { flow } = setup({ provider: { interpret: () => new Promise(resolve => { release = resolve; }) } });
  for (const cancel of [() => send(flow, 'cancelar'), () => { flow.setConnected(false); flow.setConnected(true); },
    () => send(flow, 'mesa, mute canal 2')]) {
    const old = flow.process({ inputId: 'a', text: 'mesa, pedido livre', consentToProvider: true });
    const newer = await cancel();
    release(external);
    assert.equal((await old).status, 'cancelled');
    if (newer?.status === 'proposal') assert.equal(confirm(flow, newer).status, 'executed');
    assert.equal(flow.getChannel(3).mute, false);
  }
});

test('provider ambiguity and malformed proposals never reach mixer', async () => {
  for (const proposal of [ { ...external, target: 'canal 25' }, { ...external, action: 'adjust_level', relative: true },
    { ...external, intent: 'clarify', clarification: 'Qual canal?' } ]) {
    const { flow } = setup({ provider: { interpret: async () => proposal } });
    const result = await flow.process({ inputId: 'a', text: 'mesa, pedido livre', consentToProvider: true });
    assert.ok(['rejected', 'clarification'].includes(result.status));
    assert.equal(flow.getChannel(3).mute, false);
  }
});

test('provider-simulated proposal requires consent and confirmation', async () => {
  let calls = 0;
  const { flow } = setup({ provider: { interpret: async () => { calls += 1; return external; } } });
  assert.equal((await send(flow, 'mesa, pedido livre')).status, 'consent-required');
  assert.equal(calls, 0);
  const proposal = await flow.process({ inputId: 'a', text: 'mesa, pedido livre', consentToProvider: true });
  assert.equal(proposal.source, 'provider');
  assert.equal(flow.getChannel(3).mute, false);
  assert.equal(confirm(flow, proposal).status, 'executed');
  assert.equal(flow.getChannel(3).mute, true);
  assert.equal(calls, 1);
});

test('policy mutation during authorization fails closed', async () => {
  let change = false;
  let policy;
  const setupResult = setup({ authorizeCommand: () => {
    if (change) { policy.setMode('paused', terminal); policy.setMode('passage', terminal); }
    return true;
  } });
  policy = setupResult.policy;
  const { flow } = setupResult;
  const proposal = await send(flow, 'mesa, mute canal 3');
  change = true;
  assert.equal(confirm(flow, proposal).status, 'denied');
  assert.equal(flow.getChannel(3).mute, false);
});
