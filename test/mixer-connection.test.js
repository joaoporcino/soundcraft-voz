import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { SoundcraftUI } from 'soundcraft-ui-connection';
import { MixerConnection } from '../src/mixer-connection.js';
import { createUi24rServer } from '../src/simulator/websocket-server.js';

function waitFor(predicate, timeoutMs = 2500) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error('Tempo esgotado aguardando estado da conexão'));
      setTimeout(poll, 15);
    };
    poll();
  });
}

function connectTo(targetIP, onStatus) {
  return new MixerConnection({
    targetIP,
    onStatus,
    createMixer: ip => new SoundcraftUI({ targetIP: ip, webSocketCtor: WebSocket }),
  });
}

test('conecta ao simulador loopback e emite estado conectado uma vez', { timeout: 5000 }, async t => {
  const peer = await createUi24rServer();
  const states = [];
  const connection = connectTo(peer.targetIP, status => states.push(status));
  t.after(async () => { await connection.stop(); await peer.close(); });

  assert.equal(connection.start(), undefined);
  assert.equal(connection.start(), undefined);
  await waitFor(() => connection.isConnected());
  assert.equal(connection.status, 'conectada');
  assert.equal(states.filter(status => status === 'conectada').length, 1);
  assert.equal(connection.mixer.conn.status, 'OPEN');
});

test('reconecta após quedas abrupta e normal sem conexões duplicadas', { timeout: 9000 }, async t => {
  const peer = await createUi24rServer();
  let factoryCalls = 0;
  const statuses = [];
  const connection = new MixerConnection({
    targetIP: peer.targetIP,
    onStatus: status => statuses.push(status),
    createMixer: ip => { factoryCalls += 1; return new SoundcraftUI({ targetIP: ip, webSocketCtor: WebSocket }); },
  });
  t.after(async () => { await connection.stop(); await peer.close(); });
  connection.start();
  await waitFor(() => connection.isConnected());
  const client = [...peer.server.clients][0];
  client.terminate();
  await waitFor(() => statuses.includes('tentando novamente'));
  await waitFor(() => factoryCalls >= 2);
  await waitFor(() => connection.isConnected());
  [...peer.server.clients][0].close();
  await waitFor(() => factoryCalls >= 3);
  await waitFor(() => connection.isConnected());
  assert.equal(factoryCalls, 3);
  assert.equal(peer.server.clients.size, 1);
  assert.ok(statuses.includes('desconectada') || statuses.includes('tentando novamente'));
  assert.equal(connection.status, 'conectada');
});

test('stop encerra a conexão e também retorna quando não conseguiu conectar', { timeout: 4000 }, async () => {
  const statuses = [];
  let disconnected = 0;
  const connection = new MixerConnection({
    targetIP: '127.0.0.1:1',
    onStatus: status => statuses.push(status),
    createMixer: () => ({
      status$: { subscribe: () => ({ unsubscribe() {} }) },
      conn: { status: 'CLOSE' },
      connect: () => new Promise(() => {}),
      disconnect: async () => { disconnected += 1; },
    }),
  });
  connection.start();
  await connection.stop();
  await connection.stop();
  assert.equal(disconnected, 1);
  assert.equal(connection.isConnected(), false);
  assert.equal(connection.status, 'desconectada');
  assert.deepEqual(statuses, ['conectando']);
});

test('inicia offline e conecta quando o simulador sobe na mesma porta', { timeout: 9000 }, async t => {
  const reservation = await createUi24rServer();
  const port = Number(reservation.targetIP.split(':').at(-1));
  await reservation.close();
  const targetIP = `127.0.0.1:${port}`;
  const statuses = [];
  const connection = new MixerConnection({
    targetIP,
    retryMs: 150,
    onStatus: status => statuses.push(status),
    createMixer: ip => new SoundcraftUI({ targetIP: ip, webSocketCtor: WebSocket }),
  });
  t.after(async () => { await connection.stop(); });
  connection.start();
  await waitFor(() => statuses.includes('tentando novamente'));
  const peer = await createUi24rServer({ port });
  t.after(async () => { await peer.close(); });
  await waitFor(() => connection.isConnected(), 7000);
  assert.equal(connection.status, 'conectada');
});

test('parada offline com a biblioteca real cancela futuras tentativas', { timeout: 5000 }, async () => {
  const reservation = await createUi24rServer();
  const targetIP = reservation.targetIP;
  await reservation.close();
  const statuses = [];
  const connection = connectTo(targetIP, status => statuses.push(status));
  connection.start();
  await waitFor(() => statuses.includes('tentando novamente'));
  await connection.stop();
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(connection.isConnected(), false);
  assert.equal(connection.status, 'desconectada');
  assert.equal(statuses.includes('conectada'), false);
});
