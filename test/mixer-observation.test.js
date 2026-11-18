import test from 'node:test';
import assert from 'node:assert/strict';
import { createMixerObservation } from '../src/mixer-observation.js';

test('observa somente valores recebidos e válidos da conexão atual', () => {
  const data = createMixerObservation({ now: () => new Date('2026-11-17T12:00:00Z') });
  data.receive('SETD^i.0.mute^1');
  assert.deepEqual(data.snapshot(), { connected: false, channels: {} });
  data.reset(true);
  for (const input of ['SETD^i.24.mute^1', 'SETD^i.0.mute^2', 'SETD^i.0.mix^NaN',
    'SETD^i.0.mix^1.1', 'SETD^i.0.mix^', 'SETD^i.0.mix^0.5^extra', 'SETS^i.0.name^test']) data.receive(input);
  assert.deepEqual(data.snapshot().channels, {});
  data.receive('SETD^i.0.mute^1');
  data.receive('SETD^i.23.mix^0.25');
  const snapshot = data.snapshot();
  assert.deepEqual(snapshot.channels['1'].mute, { value: true, observedAt: '2026-11-17T12:00:00.000Z' });
  assert.equal(snapshot.channels['24'].faderLinear.value, 0.25);
  snapshot.channels['1'].mute.value = false;
  assert.equal(data.snapshot().channels['1'].mute.value, true);
  data.reset(false);
  data.reset(true);
  assert.deepEqual(data.snapshot(), { connected: true, channels: {} });
});
