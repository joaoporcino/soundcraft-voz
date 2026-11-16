import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { DBToFaderValue, faderValueToDB, SoundcraftUI } from 'soundcraft-ui-connection';
import { createUi24rServer } from '../src/simulator/websocket-server.js';
import { MixerState } from '../src/simulator/mixer-state.js';

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Tempo esgotado aguardando simulador');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('servidor compartilha 24 canais e aceita comandos válidos', { timeout: 5000 }, async (t) => {
  const state = new MixerState();
  const peer = await createUi24rServer({ mixerState: state });
  t.after(() => peer.close());
  assert.match(peer.targetIP, /^127\.0\.0\.1:\d+$/);
  const client = new WebSocket(`ws://${peer.targetIP}`);
  t.after(() => client.terminate());
  const frames = [];
  client.on('message', data => frames.push(data.toString()));
  await once(client, 'open');
  await waitFor(() => frames.length >= 48);
  assert.ok(frames.includes(`3:::SETD^i.23.mix^${DBToFaderValue(0)}`));
  assert.ok(frames.includes('3:::SETD^i.23.mute^0'));

  client.send('3:::SETD^i.7.mute^1');
  await waitFor(() => state.getChannel(8).mute);
  assert.ok(frames.includes('3:::SETD^i.7.mute^1'));
  const framesBeforeRepeat = frames.length;
  client.send('3:::SETD^i.7.mute^1');
  await waitFor(() => frames.length > framesBeforeRepeat);
  assert.equal(frames.at(-1), '3:::SETD^i.7.mute^1');
  client.send('3:::SETD^i.7.mix^0.5');
  await waitFor(() => state.getChannel(8).faderDb === faderValueToDB(0.5));
  state.setFader(5, -12);
  await waitFor(() => frames.includes(`3:::SETD^i.4.mix^${DBToFaderValue(-12)}`));

  client.send('3:::SETD^i.7.mute^2');
  await waitFor(() => peer.rejected.includes('SETD^i.7.mute^2'));
  assert.equal(state.getChannel(8).mute, true);
});

test('biblioteca real controla o mesmo estado exibido no terminal', { timeout: 5000 }, async (t) => {
  const state = new MixerState();
  const peer = await createUi24rServer({ mixerState: state });
  const ui = new SoundcraftUI({ targetIP: peer.targetIP, webSocketCtor: WebSocket });
  t.after(async () => {
    await Promise.race([ui.disconnect(), new Promise(resolve => setTimeout(resolve, 500))]);
    await peer.close();
  });
  await ui.connect();
  ui.master.input(24).mute();
  await waitFor(() => state.getChannel(24).mute);
  ui.master.input(24).setFaderLevelDB(-6);
  await waitFor(() => Math.abs(state.getChannel(24).faderDb - (-6)) < 0.2);
  assert.equal(state.getChannel(1).mute, false);
});
