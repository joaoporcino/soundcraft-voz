import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { createServiceVoice } from '../src/service-voice.js';
import { saveVoiceConfig } from '../src/voice-config.js';

test('serviço entrega configuração persistida à fábrica do worker sem iniciar áudio', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-settings-'));
  const config = { python: path.join(directory, 'virtual env', 'python.exe'), model: 'tiny', device: 'USB Test', channel: 2 };
  let service;
  let worker;
  let fakeStarts = 0;
  const output = [];
  try {
    await saveVoiceConfig(config, { directory });
    service = await createLocalService({
      port: 0, runtimeDirectory: directory, readConfig: async () => null,
      createVoice: ({ createWorker }) => createServiceVoice({ createWorker: () => {
        worker = createWorker();
        return { state: 'idle', async start() { fakeStarts++; this.state = 'ready'; },
          async transcribe() { throw new Error('A captura não deve ser chamada.'); }, async close() { this.state = 'closed'; } };
      } }),
    });
    assert.equal(worker, undefined, 'worker não deve ser criado ao iniciar serviço');
    const exit = await runLocalServiceCli(['voz-iniciar'], { directory, stdout: value => output.push(value), stderr: value => output.push(value) });
    assert.equal(exit, 0, output.join('\n'));
    assert.equal(fakeStarts, 1);
    assert.deepEqual({ python: worker.python, model: worker.model, device: worker.device, channel: worker.channel }, config);
    assert.equal(worker.child, null, 'processo real de áudio não deve ser iniciado');
  } finally {
    await service?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('configuração inválida é visível ao solicitar voz e não inicia processo', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-invalid-voice-'));
  let service;
  let attempted = 0;
  const output = [];
  try {
    await writeFile(path.join(directory, 'voice-config.json'), '{invalid json');
    service = await createLocalService({
      port: 0, runtimeDirectory: directory, readConfig: async () => null,
      createVoice: ({ createWorker }) => createServiceVoice({ createWorker: () => { attempted++; return createWorker(); } }),
    });
    assert.equal(attempted, 0);
    const exit = await runLocalServiceCli(['voz-iniciar'], { directory, stdout: value => output.push(value), stderr: value => output.push(value) });
    assert.equal(exit, 1);
    assert.equal(attempted, 1);
    const result = JSON.parse(output.at(-1));
    assert.equal(result.status, 'failed');
    assert.match(result.message, /Configuração de voz inválida/);
    output.length = 0;
    assert.equal(await runLocalServiceCli(['status'], { directory, stdout: value => output.push(value), stderr: value => output.push(value) }), 0);
    assert.equal(JSON.parse(output.at(-1)).voice.state, 'failed');
  } finally {
    await service?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
