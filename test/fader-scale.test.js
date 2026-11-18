import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DBToFaderValue } from 'soundcraft-ui-connection';
import { parseFaderPoints, pointsToDb, observationToPoints, prepareRelativePoints, relativeObservationUnchanged } from '../src/fader-scale.js';
import { createMixerObservation } from '../src/mixer-observation.js';
import { validateToolProposal } from '../src/tool-validation.js';
import { createVoiceOrchestrator } from '../src/voice-orchestrator.js';
import { createModePolicy } from '../src/mode-policy.js';
import { createServiceCommandFlow } from '../src/service-command-flow.js';

const now = Date.parse('2026-11-18T12:00:00.000Z');
const observed = (db, revision = 1, time = now) => ({ value: DBToFaderValue(db), observedAt: new Date(time).toISOString(), revision });

test('pontos usam a faixa provisória de -60 a 0 dB e curva inversa da biblioteca', () => {
  for (const [points, db] of [[0, -60], [50, -30], [100, 0]]) {
    assert.equal(pointsToDb(points), db);
    assert.ok(Math.abs(observationToPoints(observed(db), now) - points) < 1e-6);
  }
  for (const n of [-1, 101, NaN, Infinity, '50']) assert.throws(() => pointsToDb(n));
  assert.throws(() => observationToPoints(observed(5), now));
});

test('sintaxe separa pontos absolutos, relativos e dB legado', () => {
  assert.deepEqual(parseFaderPoints('Coloca canal 3 em cinquenta pontos'), { action: 'points_absolute', channel: 3, points: 50 });
  assert.deepEqual(parseFaderPoints('Abaixa o canal vinte e quatro dez pontos'), { action: 'points_relative', channel: 24, points: -10 });
  assert.deepEqual(parseFaderPoints('sobe canal 1 por 10'), { action: 'points_relative', channel: 1, points: 10 });
  assert.equal(parseFaderPoints('canal 3 em 0 dB'), null);
  assert.deepEqual(parseFaderPoints('coloca canal 3 em 50'), { action: 'points_absolute', channel: 3, points: 50 });
  assert.throws(() => parseFaderPoints('coloca canal 3 em 0'));
  assert.deepEqual(parseFaderPoints('coloca canal 3 em 0 pontos'), { action: 'points_absolute', channel: 3, points: 0 });
  assert.throws(() => parseFaderPoints('abaixa canal 25 10 pontos'));
  assert.throws(() => parseFaderPoints('coloca canal 3 em 101 pontos'));
});

test('pedido relativo é calculado para revisão e só vale com a mesma observação recente', () => {
  const state = observed(-30);
  const prepared = prepareRelativePoints(-10, state, now);
  assert.ok(Math.abs(prepared.points - 40) < 1e-7);
  assert.ok(Math.abs(prepared.db - (-36)) < 1e-7);
  assert.equal(relativeObservationUnchanged(prepared, state, now + 5000), true);
  assert.equal(relativeObservationUnchanged(prepared, state, now + 5001), false);
  assert.equal(relativeObservationUnchanged(prepared, observed(-30, 2), now), false);
  assert.equal(relativeObservationUnchanged(prepared, observed(-20, 1), now), false);
  assert.equal(relativeObservationUnchanged(prepared, null, now), false);
  assert.throws(() => prepareRelativePoints(60, state, now));
  assert.throws(() => prepareRelativePoints(-1, null, now));
  assert.throws(() => prepareRelativePoints(10, observed(-30, 1, now + 1), now));
});

test('observações consecutivas recebem revisões diferentes mesmo no mesmo instante e são invalidadas', () => {
  const tracker = createMixerObservation({ now: () => new Date(now) });
  tracker.reset(true);
  tracker.receive('SETD^i.2.mix^0.26935541984');
  const first = tracker.getFader(3);
  const prepared = prepareRelativePoints(10, first, now);
  tracker.receive('SETD^i.2.mix^0.26935541984');
  assert.equal(relativeObservationUnchanged(prepared, tracker.getFader(3), now), false);
  tracker.invalidateFader(3);
  assert.equal(tracker.getFader(3), null);
  tracker.receive('SETD^i.2.mix^0.26935541984');
  assert.ok(tracker.getFader(3).revision > first.revision);
  tracker.reset(false);
  assert.equal(tracker.getFader(3), null);
});

test('orquestrador reconhece pontos e validador recusa tipo, limites e ambiguidade', async () => {
  const policy = createModePolicy({ passageInputs: ['mic'] });
  policy.setMode('passage', { type: 'terminal', authorized: true });
  const flow = createVoiceOrchestrator({ modePolicy: policy, authorizeCommand: () => true });
  const result = await flow.process({ inputId: 'mic', text: 'mesa, abaixa canal 3 dez pontos' });
  assert.equal(result.status, 'proposal');
  assert.deepEqual(result.proposal, { action: 'points_relative', channel: 3, points: -10 });
  const ambiguous = await flow.process({ inputId: 'mic', text: 'mesa, coloca canal 3 em 0' });
  assert.equal(ambiguous.status, 'clarification');
  assert.match(ambiguous.clarification, /pontos ou dB/);
  const base = { intent: 'command', target: 'canal 3', action: 'adjust_points', value: -10, relative: true, clarification: null };
  assert.deepEqual(validateToolProposal(base, { authorize: () => true }).command, result.proposal);
  for (const proposal of [{ ...base, relative: false }, { ...base, value: 101 }, { ...base, value: 0 },
    { ...base, value: '10' }, { ...base, clarification: 'qual?' }]) {
    assert.throws(() => validateToolProposal(proposal, { authorize: () => true }));
  }
});

test('serviço revalida observação ao confirmar e invalida a base antes de enviar fader', async () => {
  const tracker = createMixerObservation();
  tracker.reset(true);
  const sent = [];
  const flow = createServiceCommandFlow({ isConnected: () => true, getObservedFader: channel => tracker.getFader(channel),
    invalidateFader: channel => tracker.invalidateFader(channel), sendCommand: command => sent.push(command) });
  flow.setMode('passage');
  assert.equal((await flow.process({ text: 'mesa, abaixa canal 3 dez pontos' })).status, 'clarification');
  const inbound = () => tracker.receive(`SETD^i.2.mix^${DBToFaderValue(-30)}`);
  inbound();
  let result = await flow.process({ text: 'mesa, abaixa canal 3 dez pontos' });
  assert.equal(result.status, 'proposal');
  assert.ok(Math.abs(result.proposal.previousPoints - 50) < 1e-7);
  assert.deepEqual(sent, []);
  inbound();
  assert.equal(flow.confirm({ id: result.id }).status, 'stale-observation');
  result = await flow.process({ text: 'mesa, abaixa canal 3 dez pontos' });
  const response = flow.confirm({ id: result.id });
  assert.equal(response.status, 'sent');
  assert.equal(response.confirmed, false);
  assert.ok(Math.abs(sent[0].db - (-36)) < 1e-7);
  assert.equal(tracker.getFader(3), null);
  assert.equal((await flow.process({ text: 'mesa, abaixa canal 3 dez pontos' })).status, 'clarification');
  result = await flow.process({ text: 'mesa, coloca canal 3 em 50' });
  assert.equal(flow.confirm({ id: result.id }).status, 'sent');
  assert.equal(sent[1].db, -30);
});
