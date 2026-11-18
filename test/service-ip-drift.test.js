import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveConfig } from '../src/config.js';
import { createLocalService } from '../src/local-service.js';
import { getStatus, prepareIpChange, runLocalServiceCli } from '../src/local-service-cli.js';

for (const scenario of ['changed', 'invalid', 'official']) {
  test(`bloqueia envio ao IP anterior após configuração ${scenario}`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-ip-drift-'));
    await saveConfig('192.0.2.1', { directory });
    let sends = 0;
    const service = await createLocalService({ runtimeDirectory: directory, port: 0, createConnection: () => ({
      status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: () => ({ mute: () => { sends += 1; } }) } },
    }) });
    const out = [];
    const cli = (...args) => runLocalServiceCli(args, { directory, stdout: value => out.push(value), stderr: value => out.push(value) });
    try {
      assert.equal(await cli('modo', 'passagem'), 0);
      assert.equal(await cli('texto', 'mesa, mute canal 3'), 0);
      const { id } = JSON.parse(out.at(-1));
      if (scenario === 'official') await prepareIpChange(directory);
      if (scenario === 'invalid') await writeFile(path.join(directory, 'config.json'), '{bad json', 'utf8');
      else await saveConfig('192.0.2.2', { directory });
      assert.equal(await cli('confirmar', id), 1);
      assert.equal(JSON.parse(out.at(-1)).status, 'restart-required');
      assert.equal(sends, 0);
      let status = (await getStatus(directory)).status;
      assert.equal(status.mixer.appliedIp, '192.0.2.1');
      assert.equal(status.mixer.restartRequired, true);
      await saveConfig('192.0.2.1', { directory });
      assert.equal(await cli('texto', 'mesa, mute canal 3'), 1);
      status = (await getStatus(directory)).status;
      assert.equal(status.mixer.restartRequired, true);
      assert.equal(sends, 0);
    } finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
  });
}
