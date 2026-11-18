import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';

test('terminal e voz geram proposta antes do envio, e pausa ou queda invalidam pedidos', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-service-flow-'));
  let connected = true, onStatus, resolveVoice;
  const sent = [];
  const voice = { start: async () => {}, getStatus: () => ({ state: 'ready', error: null }), stop: async () => {},
    transcribe: () => new Promise(resolve => { resolveVoice = resolve; }) };
  const service = await createLocalService({ port: 0, runtimeDirectory: dir, readConfig: async () => ({ ip: '192.0.2.1' }),
    createVoice: () => voice,
    createConnection: options => {
      onStatus = options.onStatus;
      return { status: 'conectada', start() {}, stop: async () => {}, isConnected: () => connected,
        mixer: { master: { input: channel => ({ mute: () => sent.push([channel, 'mute']),
          unmute: () => sent.push([channel, 'unmute']), setFaderLevelDB: db => sent.push([channel, db]) }) } } };
    },
  });
  const output = [];
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: x => output.push(x), stderr: x => output.push(x) });
  try {
    assert.equal(await cli('texto', 'mesa, mute canal 3'), 1);
    assert.deepEqual(sent, []);
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('texto', 'mesa, mute canal 3'), 0);
    let proposal = JSON.parse(output.at(-1));
    assert.equal(proposal.status, 'proposal');
    assert.deepEqual(sent, []);
    assert.equal(await cli('confirmar', proposal.id), 0);
    assert.deepEqual(sent, [[3, 'mute']]);
    assert.equal(JSON.parse(output.at(-1)).confirmed, false);
    assert.equal(await cli('confirmar', proposal.id), 1);
    await cli('texto', 'mesa, mute canal 4');
    proposal = JSON.parse(output.at(-1));
    connected = false; onStatus('desconectada'); connected = true; onStatus('conectada');
    assert.equal(await cli('confirmar', proposal.id), 1);
    assert.equal(await cli('voz-iniciar'), 0);
    const capture = cli('voz-capturar');
    while (!resolveVoice) await new Promise(resolve => globalThis.setTimeout(resolve, 1));
    assert.equal(await cli('modo', 'pausa'), 0);
    resolveVoice('mesa, mute canal 5');
    assert.equal(await capture, 1);
    assert.equal(JSON.parse(output.at(-1)).status, 'cancelled');
    assert.deepEqual(sent, [[3, 'mute']]);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('comandos locais rejeitam origem web, credencial inválida e parâmetros extras', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-service-auth-'));
  const service = await createLocalService({ port: 0, runtimeDirectory: dir, readConfig: async () => null });
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'local-service.json'), 'utf8'));
    const url = `http://127.0.0.1:${service.address.port}/commands/mode`;
    const post = (headers, body) => globalThis.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({}, { mode: 'passage' })).status, 401);
    assert.equal((await post({ 'x-soundcraft-token': manifest.token, origin: 'https://example.com' }, { mode: 'passage' })).status, 403);
    assert.equal((await post({ 'x-soundcraft-token': manifest.token }, { mode: 'passage', authorized: true })).status, 400);
    assert.equal(service.commands.getStatus().mode, 'paused');
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});
