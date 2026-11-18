import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';

for (const interruption of ['shutdown', 'client-close']) {
  test(`confirmação não executa após ${interruption} durante leitura do IP`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-shutdown-race-'));
    let calls = 0, release, signalRead;
    const reading = new Promise(resolve => { signalRead = resolve; });
    let sends = 0;
    const service = await createLocalService({ port: 0, runtimeDirectory: directory,
      readConfig: async () => {
        if (++calls === 1) return { ip: '192.0.2.1' };
        signalRead();
        await new Promise(resolve => { release = resolve; });
        return { ip: '192.0.2.1' };
      },
      createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
        mixer: { master: { input: () => ({ mute() { sends += 1; } }) } } }),
    });
    try {
      service.commands.setMode('passage');
      const proposal = await service.commands.process({ text: 'mesa, mute canal 3' });
      assert.equal(proposal.status, 'proposal');
      const { token } = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
      const controller = new AbortController();
      const pending = globalThis.fetch(`http://127.0.0.1:${service.address.port}/commands/confirm`, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-soundcraft-token': token },
        body: JSON.stringify({ id: proposal.id }),
      }).catch(() => null);
      await reading;
      if (interruption === 'shutdown') await service.close();
      else {
        controller.abort();
        await pending;
        // Allow the server to observe socket closure before resuming the controlled read.
        await new Promise(resolve => globalThis.setTimeout(resolve, 50));
      }
      release();
      await pending;
      await new Promise(resolve => globalThis.setTimeout(resolve, 30));
      assert.equal(sends, 0);
    } finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
  });
}
