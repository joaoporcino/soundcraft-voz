import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { SoundcraftUI } from 'soundcraft-ui-connection';
import { WebSocket } from 'ws';
import { createUi24rServer } from './support/ui24r-server.js';
import { MixerState } from '../src/simulator/mixer-state.js';

function firstValue(observable, predicate = () => true) {
  return new Promise((resolve, reject) => {
    let subscription;
    const timeout = setTimeout(() => {
      subscription?.unsubscribe();
      reject(new Error('Tempo esgotado aguardando estado da mesa simulada'));
    }, 1500);
    subscription = observable.subscribe({
      next(value) {
        if (!predicate(value)) return;
        clearTimeout(timeout);
        Promise.resolve().then(() => subscription.unsubscribe());
        resolve(value);
      },
      error(error) {
        clearTimeout(timeout);
        reject(error);
      },
    });
  });
}

test('Soundcraft UI 7.0.3 conecta e envia mute/fader ao peer WebSocket local', { timeout: 5000 }, async (t) => {
  const state = new MixerState();
  const peer = await createUi24rServer({ mixerState: state });
  const ui = new SoundcraftUI({ targetIP: peer.targetIP, webSocketCtor: WebSocket });
  t.after(async () => {
    const disconnecting = ui.disconnect();
    await Promise.race([disconnecting, new Promise(resolve => setTimeout(resolve, 500))]);
    await peer.close();
  });

  await ui.connect();
  const channel = ui.master.input(1);

  assert.equal(await firstValue(channel.mute$), false);
  const muteChanged = new Promise(resolve => state.once('muteChanged', resolve));
  channel.mute();
  await muteChanged;
  assert.equal(await firstValue(channel.mute$, (value) => value === true), true);
  assert.equal(state.getChannel(1).mute, true);

  const faderChanged = new Promise(resolve => state.once('faderDbChanged', resolve));
  channel.setFaderLevel(0.42);
  await faderChanged;
  assert.ok(Math.abs(await firstValue(channel.faderLevel$, (value) => Math.abs(value - 0.42) < 0.001) - 0.42) < 0.001);
  assert.ok(Math.abs(state.getChannel(1).faderDb - (-16.7)) < 0.3);
  assert.ok(peer.commands.includes('SETD^i.0.mute^1'));
  assert.ok(peer.commands.some((command) => command.startsWith('SETD^i.0.mix^0.42')));
});

test('servidor registra comandos inválidos sem alterar o estado', { timeout: 5000 }, async (t) => {
  const state = new MixerState();
  let acceptedCommand;
  const received = new Promise(resolve => { acceptedCommand = resolve; });
  const peer = await createUi24rServer({ mixerState: state, onCommand: acceptedCommand });
  t.after(() => peer.close());
  const client = new WebSocket(`ws://${peer.targetIP}`);
  await once(client, 'open');
  client.send('3:::SETD^i.0.mute^2');
  await received;
  assert.deepEqual(peer.rejected, ['SETD^i.0.mute^2']);
  assert.equal(state.getChannel(1).mute, false);
  client.terminate();
});

test('a queda da conexão simulada é observada pela biblioteca', { timeout: 5000 }, async (t) => {
  const peer = await createUi24rServer();
  const ui = new SoundcraftUI({ targetIP: peer.targetIP, webSocketCtor: WebSocket });
  t.after(async () => {
    const disconnecting = ui.disconnect();
    await Promise.race([disconnecting, new Promise(resolve => setTimeout(resolve, 500))]);
    await peer.close();
  });
  await ui.connect();
  const disconnected = firstValue(ui.status$, value => value.type === 'CLOSE');
  for (const client of peer.server.clients) client.terminate();
  assert.equal((await disconnected).type, 'CLOSE');
});
