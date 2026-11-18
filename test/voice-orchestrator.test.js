import test from 'node:test';
import assert from 'node:assert/strict';
import { createModePolicy } from '../src/mode-policy.js';
import { createVoiceOrchestrator } from '../src/voice-orchestrator.js';

const terminal = { type: 'terminal', authorized: true };
const allow = () => true;
const proposal = (overrides = {}) => ({
  intent: 'command', target: 'canal 3', action: 'mute', value: null,
  relative: false, clarification: null, ...overrides,
});

function activePolicy(inputs = ['mic-a']) {
  const policy = createModePolicy({ passageInputs: inputs, masterInputId: inputs[0] });
  policy.setMode('passage', terminal);
  return policy;
}

test('mode gate blocks before activation, local parser, or provider', async () => {
  const paused = createModePolicy({ passageInputs: ['mic-a'] });
  let parses = 0;
  let calls = 0;
  const orchestrator = createVoiceOrchestrator({
    modePolicy: paused,
    parseLocal: () => { parses += 1; throw new Error('must not run'); },
    provider: { interpret: async () => { calls += 1; return proposal(); } },
  });

  assert.deepEqual(await orchestrator.process({ inputId: 'mic-a', text: 'mesa pedido', consentToProvider: true }), {
    status: 'blocked', reason: 'mode_or_input_not_allowed',
  });
  assert.deepEqual(await orchestrator.process({ inputId: 'unknown', text: 'mesa pedido', consentToProvider: true }), {
    status: 'blocked', reason: 'mode_or_input_not_allowed',
  });
  assert.equal(parses, 0);
  assert.equal(calls, 0);
});

test('activation, waiting, cancellation, and ambiguity never call provider', async () => {
  let calls = 0;
  const orchestrator = createVoiceOrchestrator({
    modePolicy: activePolicy(),
    provider: { interpret: async () => { calls += 1; return proposal(); } },
    authorizeCommand: allow,
  });
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'pedido sem gatilho' })).status, 'inactive');
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa' })).status, 'waiting');
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'cancelar', consentToProvider: true })).status, 'cancelled');
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa, mesa, mute canal 3' })).status, 'ambiguous');
  assert.equal(calls, 0);
});

test('local parser proposal avoids provider and requires confirmation', async () => {
  let calls = 0;
  const orchestrator = createVoiceOrchestrator({
    modePolicy: activePolicy(),
    provider: { interpret: async () => { calls += 1; return proposal(); } },
    authorizeCommand: (command) => command.action === 'mute' && command.channel === 3,
  });
  const result = await orchestrator.process({ inputId: 'mic-a', text: 'Mesa, mute canal 3' });
  assert.deepEqual(result, {
    status: 'proposal', inputId: 'mic-a', source: 'local',
    proposal: { action: 'mute', channel: 3 }, mode: 'simulation',
    requiresConfirmation: true, confirmed: false,
  });
  assert.equal(calls, 0);
});

test('validated proposal remains simulation data and does not grant live execution', async () => {
  const orchestrator = createVoiceOrchestrator({ modePolicy: activePolicy(), authorizeCommand: allow });
  const result = await orchestrator.process({ inputId: 'mic-a', text: 'mesa, mute canal 3' });
  assert.equal(result.status, 'proposal');
  assert.equal(result.mode, 'simulation');
  assert.equal(result.confirmed, false);
  assert.equal(result.requiresConfirmation, true);
  assert.equal(Object.hasOwn(result, 'connected'), false);
});

test('provider is used only after local unrecognized text and explicit consent', async () => {
  let calls = 0;
  const provider = { interpret: async (input) => { calls += 1; assert.equal(input.consent, true); return proposal(); } };
  const orchestrator = createVoiceOrchestrator({ modePolicy: activePolicy(), provider, authorizeCommand: allow });

  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa, abaixa a guitarra' })).status, 'consent-required');
  assert.equal(calls, 0);
  const result = await orchestrator.process({ inputId: 'mic-a', text: 'mesa, abaixa a guitarra', consentToProvider: true });
  assert.equal(result.status, 'proposal');
  assert.equal(result.source, 'provider');
  assert.equal(result.requiresConfirmation, true);
  assert.equal(calls, 1);
});

test('provider ambiguity, missing or invalid channel, and unsupported actions are rejected safely', async () => {
  const cases = [
    [proposal({ intent: 'clarify', action: 'none', clarification: 'Qual canal?' }), 'clarification', 'provider_requested_clarification'],
    [proposal({ target: null }), 'rejected', 'explicit_channel_required'],
    [proposal({ target: 'canal 2 e canal 3' }), 'rejected', 'explicit_channel_required'],
    [proposal({ action: 'adjust_level', value: 2, relative: true }), 'rejected', 'unsupported_action'],
  ];
  for (const [interpreted, expectedStatus, reason] of cases) {
    const orchestrator = createVoiceOrchestrator({
      modePolicy: activePolicy(),
      provider: { interpret: async () => interpreted },
      authorizeCommand: allow,
    });
    const result = await orchestrator.process({ inputId: 'mic-a', text: 'mesa, abaixa a guitarra', consentToProvider: true });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.reason, reason);
    assert.equal(result.proposal, undefined);
  }
});

test('missing or denied command authorization fails closed', async () => {
  for (const authorizeCommand of [undefined, () => false, () => { throw new Error('denied'); }]) {
    const orchestrator = createVoiceOrchestrator({ modePolicy: activePolicy(), authorizeCommand });
    const result = await orchestrator.process({ inputId: 'mic-a', text: 'mesa, mute canal 3' });
    assert.equal(result.status, 'rejected');
    assert.ok(['authorization_unavailable', 'not_authorized', 'authorization_failed'].includes(result.reason));
  }
});

test('invalid explicit local channel does not get silently retried by provider', async () => {
  let calls = 0;
  const orchestrator = createVoiceOrchestrator({
    modePolicy: activePolicy(),
    provider: { interpret: async () => { calls += 1; return proposal(); } },
    authorizeCommand: allow,
  });
  const result = await orchestrator.process({ inputId: 'mic-a', text: 'mesa, mute canal 25', consentToProvider: true });
  assert.equal(result.status, 'clarification');
  assert.equal(calls, 0);
});

test('permission is checked again before a pending follow-up can be interpreted', async () => {
  const policy = activePolicy();
  let calls = 0;
  const orchestrator = createVoiceOrchestrator({
    modePolicy: policy,
    provider: { interpret: async () => { calls += 1; return proposal(); } },
    authorizeCommand: allow,
  });
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa' })).status, 'waiting');
  policy.setMode('paused', terminal);
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3', consentToProvider: true })).status, 'blocked');
  assert.equal(calls, 0);
});

test('blocked input clears its pending activation before later re-enablement', async () => {
  const policy = activePolicy();
  const orchestrator = createVoiceOrchestrator({ modePolicy: policy, authorizeCommand: allow });
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa' })).status, 'waiting');
  policy.setMode('paused', terminal);
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'blocked');
  policy.setMode('passage', terminal);
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'inactive');
});

test('policy exceptions fail closed and the blocked event clears activation state', async () => {
  let failPolicy = false;
  let enabled = true;
  const policy = { isInputAllowed() { if (failPolicy) throw new Error('policy unavailable'); return enabled; } };
  const orchestrator = createVoiceOrchestrator({ modePolicy: policy, authorizeCommand: allow });
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa' })).status, 'waiting');
  failPolicy = true;
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'blocked');
  failPolicy = false;
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'inactive');
});

test('mode is revalidated after provider await before a proposal is returned', async () => {
  const policy = activePolicy();
  let releaseProvider;
  const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
  const orchestrator = createVoiceOrchestrator({
    modePolicy: policy,
    provider: { interpret: async () => providerResult },
    authorizeCommand: allow,
  });
  const pending = orchestrator.process({ inputId: 'mic-a', text: 'mesa, abaixa a guitarra', consentToProvider: true });
  policy.setMode('paused', terminal);
  releaseProvider(proposal());
  const result = await pending;
  assert.equal(result.status, 'blocked');
  assert.equal(result.proposal, undefined);
});

test('activation authorization is revalidated after provider await', async () => {
  let authorized = true;
  let releaseProvider;
  const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
  const orchestrator = createVoiceOrchestrator({
    modePolicy: activePolicy(),
    authorizeActivation: () => authorized,
    provider: { interpret: async () => providerResult },
    authorizeCommand: allow,
  });
  const pending = orchestrator.process({ inputId: 'mic-a', text: 'mesa, abaixa a guitarra', consentToProvider: true });
  authorized = false;
  releaseProvider(proposal());
  const result = await pending;
  assert.equal(result.status, 'denied');
  assert.equal(result.proposal, undefined);
});

test('cancel and policy changes invalidate late provider results and old activations', async () => {
  const policy = activePolicy(['mic-a', 'mic-b']);
  let release;
  const orchestrator = createVoiceOrchestrator({ modePolicy: policy, authorizeCommand: allow,
    provider: { interpret: () => new Promise(resolve => { release = resolve; }) } });
  let pending = orchestrator.process({ inputId: 'mic-a', text: 'mesa, pedido livre', consentToProvider: true });
  await orchestrator.process({ inputId: 'mic-a', text: 'cancelar' });
  release(proposal());
  assert.equal((await pending).status, 'cancelled');
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mesa' })).status, 'waiting');
  policy.setMode('paused', terminal);
  policy.setMode('passage', terminal);
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'inactive');
  pending = orchestrator.process({ inputId: 'mic-a', text: 'mesa, pedido livre', consentToProvider: true });
  policy.setMode('paused', terminal);
  policy.setMode('passage', terminal);
  release(proposal());
  assert.equal((await pending).status, 'cancelled');
});

test('observed or explicitly notified authorization revocation clears only its input', async () => {
  let permitted = true;
  const orchestrator = createVoiceOrchestrator({ modePolicy: activePolicy(['mic-a', 'mic-b']), authorizeCommand: allow,
    authorizeActivation: id => id !== 'mic-a' || permitted });
  await orchestrator.process({ inputId: 'mic-a', text: 'mesa' });
  await orchestrator.process({ inputId: 'mic-b', text: 'mesa' });
  permitted = false;
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'algo' })).status, 'denied');
  permitted = true;
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'inactive');
  assert.equal((await orchestrator.process({ inputId: 'mic-b', text: 'mute canal 3' })).status, 'proposal');
  await orchestrator.process({ inputId: 'mic-a', text: 'mesa' });
  orchestrator.invalidate('mic-a');
  assert.equal((await orchestrator.process({ inputId: 'mic-a', text: 'mute canal 3' })).status, 'inactive');
});
