import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { runTerminalUi } from '../src/terminal-ui.js';

test('menu opera serviço HTTP simulado com confirmação explícita e pausa', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-terminal-service-'));
  const sent = [];
  const service = await createLocalService({ port: 0, runtimeDirectory: directory, readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push(channel) }) } } }) });
  try {
    let output = '';
    const stream = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
    const cli = (args, options) => runLocalServiceCli(args, { ...options, directory });
    await runTerminalUi({ input: Readable.from(['1\n6\n2\n\n7\nmesa, mute canal 3\nSIM\n\n6\n1\n\n7\nmesa, mute canal 4\n\n0\n0\n']), output: stream, service: cli });
    assert.deepEqual(sent, [3]);
    assert.match(output, /aplicação na mesa não foi comprovada/);
    assert.equal(service.commands.getStatus().mode, 'paused');
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
});
