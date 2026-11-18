import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createLocalService } from '../src/local-service.js';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-abandoned-'));
  let resolveVoice;
  let captureStarted;
  const started = new Promise(resolve => { captureStarted = resolve; });
  const sent = [];
  const voice = {
    start: async () => {}, getStatus: () => ({ state: 'ready' }), stop: async () => {},
    transcribe: () => new Promise(resolve => { resolveVoice = resolve; captureStarted(); }),
  };
  const service = await createLocalService({
    port: 0, runtimeDirectory: directory, readConfig: async () => ({ ip: '192.0.2.1' }),
    createVoice: () => voice,
    createConnection: () => ({
      status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push(channel), unmute: () => sent.push(channel), setFaderLevelDB: () => sent.push(channel) }) } },
    }),
  });
  const manifest = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
  function post(endpoint, body, end = true) {
    const req = request({ host: manifest.host, port: manifest.port, path: endpoint, method: 'POST',
      headers: { 'x-soundcraft-token': manifest.token, 'content-type': 'application/json',
        ...(end ? {} : { 'content-length': '30' }) } });
    // Destruição intencional do socket não deve ser erro não tratado no teste.
    req.on('error', () => {});
    if (end) req.end(body); else req.write(body);
    return req;
  }
  async function cleanup() {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
  await new Promise((resolve, reject) => {
    const req = post('/voice/start', '{}');
    req.once('response', response => {
      response.resume();
      response.once('end', () => response.statusCode === 200 ? resolve() : reject(new Error('Não iniciou voz simulada')));
    });
    req.once('error', reject);
  });
  return { service, started, sent, post, resolveVoice: text => resolveVoice(text), cleanup };
}

test('captura abandonada não gera proposta nem ação após resposta tardia', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    assert.equal(f.service.commands.setMode('passage').ok, true);
    const req = f.post('/voice/capture', '{}');
    await f.started;
    const afterCaptureStarted = f.service.commands.getGeneration();
    req.destroy();
    // Aguardar o fechamento do socket chegar ao servidor antes de liberar o worker.
    await delay(100);
    f.resolveVoice('mesa, mute canal 3');
    await delay(100);
    assert.equal(f.service.commands.getGeneration(), afterCaptureStarted, 'transcrição abandonada não deve ser processada');
    assert.deepEqual(f.sent, []);
    assert.equal(f.service.commands.confirm({ id: 'inexistente' }).status, 'not-found');
  } finally { await f.cleanup(); }
});

test('encerramento com corpo HTTP incompleto não altera modo nem envia ação', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const req = f.post('/commands/mode', '{"mode":', false);
    await new Promise(resolve => req.once('socket', socket => {
      if (socket.connecting) socket.once('connect', resolve);
      else resolve();
    }));
    await delay(50);
    await f.service.close();
    req.end('"passage"}');
    await delay(50);
    assert.equal(f.service.commands.getStatus().mode, 'paused');
    assert.deepEqual(f.sent, []);
  } finally { await f.cleanup(); }
});

test('encerramento durante captura descarta transcrição que chega depois', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    assert.equal(f.service.commands.setMode('passage').ok, true);
    f.post('/voice/capture', '{}');
    await f.started;
    await f.service.close();
    const afterClose = f.service.commands.getGeneration();
    f.resolveVoice('mesa, mute canal 4');
    await delay(100);
    assert.equal(f.service.commands.getGeneration(), afterClose);
    assert.deepEqual(f.sent, []);
  } finally { await f.cleanup(); }
});
