import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DBToFaderValue } from 'soundcraft-ui-connection';
import { createLocalService } from '../src/local-service.js';
import { createServiceVoice } from '../src/service-voice.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';

test('queda invalida proposta e observação; reconexão silenciosa exige estado novo', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-recovery-'));
  let inbound, notify, connected = true;
  const sent = [];
  const service = await createLocalService({ port: 0, runtimeDirectory: dir,
    readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: options => {
      inbound = options.onInbound; notify = options.onStatus;
      return { status: 'conectada', start() { notify('conectada'); }, stop: async () => {},
        isConnected: () => connected, mixer: { master: { input: channel => ({ setFaderLevelDB: db => sent.push([channel, db]) }) } } };
    },
  });
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'local-service.json'), 'utf8'));
    const url = `http://127.0.0.1:${manifest.port}`;
    const headers = { 'content-type': 'application/json', 'x-soundcraft-token': manifest.token };
    const post = async (endpoint, body) => (await globalThis.fetch(url + endpoint,
      { method: 'POST', headers, body: JSON.stringify(body) })).json();
    const status = async () => (await globalThis.fetch(url + '/status', { headers })).json();
    await post('/commands/mode', { mode: 'passage' });
    const mix = `SETD^i.2.mix^${DBToFaderValue(-30)}`;
    inbound(mix);
    const prior = await post('/commands/text', { text: 'mesa, abaixa canal 3 dez pontos' });
    assert.equal(prior.status, 'proposal');
    connected = false; notify('desconectada');
    assert.deepEqual((await status()).observation.channels, {});
    assert.notEqual((await post('/commands/confirm', { id: prior.id })).status, 'sent');
    assert.equal((await post('/commands/text', { text: 'mesa, muta canal 3' })).status, 'disconnected');
    connected = true; notify('conectada');
    assert.deepEqual((await status()).observation.channels, {});
    assert.notEqual((await post('/commands/confirm', { id: prior.id })).status, 'sent');
    assert.notEqual((await post('/commands/text', { text: 'mesa, abaixa canal 3 dez pontos' })).status, 'proposal');
    assert.deepEqual(sent, []);
    inbound(mix);
    const next = await post('/commands/text', { text: 'mesa, abaixa canal 3 dez pontos' });
    assert.equal(next.status, 'proposal');
    assert.equal((await post('/commands/confirm', { id: next.id })).status, 'sent');
    assert.equal(sent.length, 1);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('retorno de outro dispositivo exige inspeção e aceite pelo terminal sem gravar automaticamente', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-recovery-'));
  const identities = [[0, 'Mic A', 0, 2], [0, 'Mic B', 0, 2], [0, 'Mic C', 0, 2], [0, 'Mic C', 0, 2], [0, 'Mic C', 0, 2]];
  let starts = 0, captures = 0;
  const service = await createLocalService({ port: 0, runtimeDirectory: dir,
    readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: options => ({ status: 'conectada', start: () => options.onStatus('conectada'),
      stop: async () => {}, isConnected: () => true }),
    createVoice: () => createServiceVoice({ createWorker: () => {
      const worker = { deviceIdentity: identities[starts++], state: 'idle',
        start: async () => { worker.state = 'ready'; }, close: async () => { worker.state = 'closed'; },
        transcribe: async () => { captures++; worker.state = 'failed'; throw new Error('USB removido'); } };
      return worker;
    } }),
  });
  const lines = [];
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: line => lines.push(line), stderr: line => lines.push(line) });
  try {
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('voz-iniciar'), 0);
    assert.equal(await cli('voz-capturar'), 1);
    assert.equal(await cli('voz-iniciar'), 1);
    const failed = JSON.parse(lines.at(-1));
    assert.deepEqual(failed.voice.deviceIdentity, identities[0]);
    assert.deepEqual(failed.voice.candidateIdentity, identities[1]);
    assert.equal(await cli('voz-iniciar'), 1);
    assert.deepEqual(JSON.parse(lines.at(-1)).voice.candidateIdentity, identities[2]);
    assert.equal(await cli('voz-aceitar-dispositivo', failed.voice.candidateRevision), 1);
    const current = JSON.parse(lines.at(-1));
    assert.deepEqual(current.voice.candidateIdentity, identities[3]);
    assert.equal(await cli('voz-aceitar-dispositivo', current.voice.candidateRevision), 0);
    assert.deepEqual(JSON.parse(lines.at(-1)).voice.deviceIdentity, identities[4]);
    assert.equal(captures, 1);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});
