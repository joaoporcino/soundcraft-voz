import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createLocalService } from '../src/local-service.js';

test('configuração de entradas invalida e bloqueia comandos enquanto aguarda gravação', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-mode-race-'));
  let resume, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const sent = [];
  const service = await createLocalService({ port: 0, runtimeDirectory: directory,
    readConfig: async () => ({ ip: '192.0.2.1' }),
    saveModeConfigImpl: () => new Promise(resolve => { resume = resolve; markStarted(); }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push(channel), unmute() {}, setFaderLevelDB() {} }) } } }),
  });
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
    const post = async (endpoint, data) => {
      const result = await globalThis.fetch(`http://127.0.0.1:${service.address.port}${endpoint}`, { method: 'POST',
        headers: { 'x-soundcraft-token': manifest.token, 'content-type': 'application/json' }, body: JSON.stringify(data) });
      return result.json();
    };
    await post('/commands/mode', { mode: 'passage' });
    const proposal = await post('/commands/text', { text: 'mesa, mute canal 3' });
    assert.equal(proposal.status, 'proposal');
    const changing = post('/commands/mode-config', { passageInputs: [], masterInputId: null });
    await started;
    assert.equal((await post('/commands/confirm', { id: proposal.id })).status, 'configuration-in-progress');
    assert.equal((await post('/commands/text', { text: 'mesa, mute canal 4' })).status, 'configuration-in-progress');
    resume();
    assert.equal((await changing).ok, true);
    assert.equal((await post('/commands/confirm', { id: proposal.id })).status, 'not-found');
    assert.deepEqual(sent, []);
  } finally { if (resume) resume(); await service.close(); await rm(directory, { recursive: true, force: true }); }
});
