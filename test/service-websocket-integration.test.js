import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { SoundcraftUI } from 'soundcraft-ui-connection';
import { createUi24rServer } from '../src/simulator/websocket-server.js';
import { MixerConnection } from '../src/mixer-connection.js';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli, getStatus } from '../src/local-service-cli.js';

async function waitFor(predicate, description, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Tempo esgotado aguardando ${description}.`);
}

test('serviço exige confirmação antes de enviar mute e fader à biblioteca e ao peer simulado', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-service-websocket-'));
  const peer = await createUi24rServer();
  let service;
  const output = [];
  let connection;
  const cli = (...args) => runLocalServiceCli(args, { directory, stdout: text => output.push(text), stderr: text => output.push(text) });
  const sentControls = () => peer.commands.filter(command => command.startsWith('SETD^'));
  try {
    service = await createLocalService({
      port: 0,
      runtimeDirectory: directory,
      readConfig: async () => ({ ip: peer.targetIP }),
      createConnection: ({ targetIP, onStatus }) => (connection = new MixerConnection({
        targetIP,
        onStatus,
        createMixer: ip => new SoundcraftUI({ targetIP: ip, webSocketCtor: WebSocket }),
      })),
    });
    await waitFor(() => connection.isConnected(), 'conexão ao peer');
    assert.equal((await getStatus(directory)).status.mixer.connected, true);
    assert.equal(await cli('modo', 'passagem'), 0);

    assert.equal(await cli('texto', 'mesa, mute canal 3'), 0);
    let proposal = JSON.parse(output.at(-1));
    assert.equal(proposal.status, 'proposal');
    assert.equal(peer.mixerState.getChannel(3).mute, false);
    assert.deepEqual(sentControls(), []);
    assert.equal(await cli('confirmar', proposal.id), 0);
    assert.equal(JSON.parse(output.at(-1)).confirmed, false);
    await waitFor(() => peer.mixerState.getChannel(3).mute, 'mute do canal 3');
    assert.ok(sentControls().includes('SETD^i.2.mute^1'));
    assert.equal(peer.mixerState.getChannel(2).mute, false);

    assert.equal(await cli('texto', 'mesa, canal 4 em menos 6 db'), 0);
    proposal = JSON.parse(output.at(-1));
    assert.equal(proposal.status, 'proposal');
    assert.equal(peer.mixerState.getChannel(4).faderDb, 0);
    assert.equal(sentControls().some(command => command.startsWith('SETD^i.3.mix^')), false);
    assert.equal(await cli('confirmar', proposal.id), 0);
    await waitFor(() => sentControls().some(command => command.startsWith('SETD^i.3.mix^')), 'fader do canal 4');
    assert.ok(Math.abs(peer.mixerState.getChannel(4).faderDb + 6) < 0.1);
    assert.equal(peer.mixerState.getChannel(3).faderDb, 0);
    assert.equal(await cli('confirmar', proposal.id), 1);
    assert.equal(sentControls().filter(command => command.startsWith('SETD^i.3.mix^')).length, 1);
  } finally {
    await service?.close();
    await peer.close();
    await rm(directory, { recursive: true, force: true });
  }
});
