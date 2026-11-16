import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MixerState } from '../src/simulator/mixer-state.js';

test('inicializa 24 canais com mute desligado e fader em 0 dB', () => {
  const mixer = new MixerState();
  const snapshot = mixer.snapshot();
  assert.equal(snapshot.channels.length, 24);
  assert.deepEqual(snapshot.channels[0], { channel: 1, mute: false, faderDb: 0 });
  assert.deepEqual(snapshot.channels[23], { channel: 24, mute: false, faderDb: 0 });
});

test('altera mute e fader independentemente e emite evento para mudanças efetivas', () => {
  const mixer = new MixerState();
  const changes = [];
  mixer.on('change', change => changes.push(change));

  mixer.setMute(3, true);
  mixer.setFader(3, -12.5);
  mixer.setMute(3, true);

  assert.deepEqual(mixer.getChannel(3), { channel: 3, mute: true, faderDb: -12.5 });
  assert.deepEqual(changes, [
    { channel: 3, property: 'mute', value: true, previousValue: false },
    { channel: 3, property: 'faderDb', value: -12.5, previousValue: 0 },
  ]);
});

test('retornos e snapshots são cópias defensivas', () => {
  const mixer = new MixerState();
  const channel = mixer.getChannel(1);
  const snapshot = mixer.snapshot();
  channel.mute = true;
  snapshot.channels[0].faderDb = -40;
  snapshot.channels.push({ channel: 25, mute: true, faderDb: 0 });

  assert.deepEqual(mixer.getChannel(1), { channel: 1, mute: false, faderDb: 0 });
  assert.equal(mixer.snapshot().channels.length, 24);
});

test('instâncias simuladas mantêm estados independentes', () => {
  const primeira = new MixerState();
  const segunda = new MixerState();
  primeira.setMute(24, true);
  primeira.setFader(24, -60);
  assert.deepEqual(segunda.getChannel(24), { channel: 24, mute: false, faderDb: 0 });
});

test('rejeita canal, tipo de mute e valores de fader inválidos sem alterar estado', () => {
  const mixer = new MixerState();
  for (const channel of [0, 25, 1.5, '1', NaN]) {
    assert.throws(() => mixer.getChannel(channel), RangeError);
    assert.throws(() => mixer.setMute(channel, true), RangeError);
  }
  assert.throws(() => mixer.setMute(1, 1), TypeError);
  for (const value of [NaN, Infinity, '−6', null]) assert.throws(() => mixer.setFader(1, value), TypeError);
  for (const value of [-60.1, 0.1]) assert.throws(() => mixer.setFader(1, value), RangeError);
  assert.deepEqual(mixer.getChannel(1), { channel: 1, mute: false, faderDb: 0 });
});
