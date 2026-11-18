import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { createBackup, restoreBackup } from '../src/backup.js';

test('terminal configura master, revoga propostas e persiste configuração, mas reinicia pausado', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-mode-'));
  const sent = [];
  const options = { port: 0, runtimeDirectory: dir, readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push(channel) }) } } }) };
  let service = await createLocalService(options);
  const output = [];
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: x => output.push(x), stderr: x => output.push(x) });
  try {
    assert.equal(await cli('modo', 'culto'), 1);
    assert.equal(await cli('entradas', 'principal,outra', 'principal'), 0);
    assert.equal(await cli('modo', 'culto'), 0);
    assert.equal(await cli('texto', 'mesa, mute canal 3'), 0);
    const proposal = JSON.parse(output.at(-1));
    assert.equal(await cli('entradas', 'principal,outra', 'outra'), 0);
    assert.equal(await cli('confirmar', proposal.id), 1);
    assert.equal(await cli('texto', 'mesa, mute canal 3'), 1);
    assert.deepEqual(sent, []);
    assert.equal(await cli('entradas', 'principal,outra', '-'), 1);
    assert.equal(service.commands.getStatus().masterInputId, 'outra');
    await service.close();
    service = await createLocalService(options);
    assert.equal(service.commands.getStatus().mode, 'paused');
    assert.equal(service.commands.getStatus().masterInputId, 'outra');
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('texto', 'mesa, mute canal 3'), 0);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('backup preserva modos; configuração inválida não inicia serviço', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-mode-backup-'));
  const target = path.join(dir, 'restore');
  const backup = path.join(dir, 'backup.json');
  try {
    const config = { passageInputs: ['principal'], masterInputId: 'principal' };
    await writeFile(path.join(dir, 'mode-config.json'), JSON.stringify(config));
    await createBackup({ directory: dir, destination: backup });
    await restoreBackup({ directory: target, source: backup });
    assert.deepEqual(JSON.parse(await readFile(path.join(target, 'mode-config.json'), 'utf8')), config);
    await writeFile(path.join(dir, 'mode-config.json'), '{broken');
    await assert.rejects(createLocalService({ port: 0, runtimeDirectory: dir }), /Configuração de modos inválida/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
