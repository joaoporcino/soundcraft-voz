import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceActivation } from '../src/voice-activation.js';

function makeClock() {
  let time = 1_000;
  return { now: () => time, advance: (milliseconds) => { time += milliseconds; } };
}

test('revoking an input clears its waiting interaction', () => {
  let allowed = true;
  const machine = createVoiceActivation({ authorize: () => allowed });
  assert.equal(machine.processText('mic-a', 'mesa').status, 'waiting');
  allowed = false;
  assert.equal(machine.processText('mic-a', 'mute canal 3').status, 'denied');
  allowed = true;
  assert.equal(machine.processText('mic-a', 'mute canal 3').status, 'inactive');
});

test('accepts a whole-word activation at the beginning and a same-phrase request', () => {
  const machine = createVoiceActivation({ authorize: () => true });
  assert.deepEqual(machine.processText('mic-a', '  Mesa, abaixa o violão!  '), {
    status: 'request', inputId: 'mic-a', request: 'abaixa o violão!', source: 'same-phrase',
  });
});

test('waits for exactly a follow-up phrase on the same input', () => {
  const machine = createVoiceActivation({ authorize: () => true });
  assert.equal(machine.processText('mic-a', 'Mesa').status, 'waiting');
  assert.equal(machine.processText('mic-b', 'abaixa o violão').status, 'inactive');
  assert.deepEqual(machine.processText('mic-a', 'abaixa o violão'), {
    status: 'request', inputId: 'mic-a', request: 'abaixa o violão', source: 'follow-up',
  });
  assert.equal(machine.getState('mic-a'), 'inactive');
});

test('ignores occurrences outside the initial whole word, including sung text without the prefix', () => {
  const machine = createVoiceActivation({ authorize: () => true });
  for (const phrase of ['por favor, mesa abaixa', 'mesas abaixa', 'a mesada caiu', '♪ abaixa o violão ♪']) {
    assert.equal(machine.processText('mic-a', phrase).status, 'inactive', phrase);
  }
  assert.equal(machine.processText('mic-a', 'Mesa, mesa, abaixa').status, 'ambiguous');
  assert.equal(machine.getState('mic-a'), 'inactive');
});

test('cancels only the waiting conversation for its input', () => {
  const machine = createVoiceActivation({ authorize: () => true });
  machine.processText('mic-a', 'Mesa');
  machine.processText('mic-b', 'Mesa');
  assert.equal(machine.processText('mic-a', 'cancelar').status, 'cancelled');
  assert.equal(machine.getState('mic-a'), 'inactive');
  assert.equal(machine.getState('mic-b'), 'waiting');
});

test('expires using the injected clock and does not treat expired text as a request', () => {
  const clock = makeClock();
  const machine = createVoiceActivation({ authorize: () => true, now: clock.now, windowMs: 500 });
  machine.processText('mic-a', 'Mesa');
  clock.advance(500);
  assert.equal(machine.processText('mic-a', 'abaixa o violão').status, 'inactive');
  assert.equal(machine.processText('mic-a', 'Mesa, abaixa o violão').status, 'request');
});

test('handles interleaved input events independently, including different expiry times', () => {
  const clock = makeClock();
  const machine = createVoiceActivation({ authorize: () => true, now: clock.now, windowMs: 1_000 });
  machine.processText('mic-a', 'Mesa');
  clock.advance(400);
  machine.processText('mic-b', 'Mesa');
  clock.advance(600);
  assert.equal(machine.getState('mic-a'), 'inactive');
  assert.equal(machine.getState('mic-b'), 'waiting');
  assert.equal(machine.processText('mic-b', 'cancelar').status, 'cancelled');
  assert.equal(machine.getState('mic-a'), 'inactive');
});

test('fails closed when authorization is absent, denied, or throws', () => {
  const absent = createVoiceActivation();
  const denied = createVoiceActivation({ authorize: () => false });
  const broken = createVoiceActivation({ authorize: () => { throw new Error('unavailable'); } });
  for (const machine of [absent, denied, broken]) {
    assert.equal(machine.processText('mic-a', 'Mesa, altera o volume').status, 'denied');
    assert.equal(machine.getState('mic-a'), 'inactive');
  }
});

test('does not infer identity from an input identifier', () => {
  const seen = [];
  const machine = createVoiceActivation({ authorize: (inputId) => { seen.push(inputId); return true; } });
  machine.processText('microfone-da-ana', 'Mesa');
  assert.deepEqual(seen, ['microfone-da-ana']);
});
