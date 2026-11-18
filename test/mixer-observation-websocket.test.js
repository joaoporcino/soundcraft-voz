import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket, WebSocketServer } from 'ws';
import { SoundcraftUI } from 'soundcraft-ui-connection';
import { MixerConnection } from '../src/mixer-connection.js';
import { createMixerObservation } from '../src/mixer-observation.js';

function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Tempo esgotado aguardando observação'));
      globalThis.setTimeout(poll, 10);
    };
    poll();
  });
}

test('peer silencioso não produz valores de canais observados', { timeout: 5000 }, async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  let accepted = false;
  server.on('connection', () => { accepted = true; });
  const observation = createMixerObservation();
  const connection = new MixerConnection({ targetIP: `127.0.0.1:${server.address().port}`,
    createMixer: ip => new SoundcraftUI({ targetIP: ip, webSocketCtor: WebSocket }),
    onStatus: status => observation.reset(status === 'conectada'),
    onInbound: message => observation.receive(message),
  });
  t.after(async () => {
    await connection.stop();
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  connection.start();
  await waitFor(() => accepted);
  assert.deepEqual(observation.snapshot().channels, {});
});

test('recepção real do WebSocket simulado não confunde envio, queda e reconexão parcial', { timeout: 10000 }, async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  let connections = 0, current, muteCommand = false;
  server.on('connection', socket => {
    current = socket;
    connections += 1;
    if (connections === 1) {
      socket.send('3:::SETD^i.0.mute^0');
      socket.send('3:::SETD^i.0.mix^0.5');
    } else socket.send('3:::SETD^i.1.mute^1');
    socket.on('message', data => { if (data.toString() === '3:::SETD^i.0.mute^1') muteCommand = true; });
  });
  const observation = createMixerObservation();
  const statusSnapshots = [];
  const connection = new MixerConnection({ targetIP: `127.0.0.1:${server.address().port}`, retryMs: 30,
    createMixer: ip => new SoundcraftUI({ targetIP: ip, webSocketCtor: WebSocket }),
    onStatus: status => { observation.reset(status === 'conectada'); statusSnapshots.push({ status, snapshot: observation.snapshot() }); },
    onInbound: message => observation.receive(message),
  });
  t.after(async () => {
    await connection.stop();
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  connection.start();
  await waitFor(() => observation.snapshot().channels['1']?.faderLinear);
  let state = observation.snapshot();
  assert.equal(state.channels['1'].mute.value, false);
  assert.equal(state.channels['1'].faderLinear.value, 0.5);
  assert.ok(!Number.isNaN(Date.parse(state.channels['1'].mute.observedAt)));
  connection.mixer.master.input(1).mute();
  await waitFor(() => muteCommand);
  assert.equal(observation.snapshot().channels['1'].mute.value, false);
  current.send('3:::SETD^i.0.mute^2');
  current.send('3:::SETD^i.0.mix^NaN');
  current.send('3:::SETD^i.0.mute^1');
  await waitFor(() => observation.snapshot().channels['1']?.mute.value === true);
  assert.equal(observation.snapshot().channels['1'].faderLinear.value, 0.5);
  current.terminate();
  await waitFor(() => connections >= 2 && observation.snapshot().channels['2']?.mute.value === true);
  state = observation.snapshot();
  assert.equal(state.channels['1'], undefined);
  assert.deepEqual(Object.keys(state.channels), ['2']);
  assert.ok(statusSnapshots.some(item => item.status === 'desconectada' && !item.snapshot.connected && Object.keys(item.snapshot.channels).length === 0));
});
