import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { saveModeConfig } from '../src/mode-config.js';

test('fila simulada no serviço serializa, reavalia destino, cancela e não acessa áudio ou mesa', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'response-service-'));
  await saveModeConfig({ passageInputs: ['principal'], masterInputId: 'principal' }, { directory });
  let onStatus, sent = 0;
  const service = await createLocalService({ port: 0, runtimeDirectory: directory,
    readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: options => { onStatus = options.onStatus; return { status: 'conectada', start() {}, stop: async () => {},
      isConnected: () => true, mixer: { master: { input: () => { sent++; throw Error('mesa não deve ser chamada'); } } } }; },
  });
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
    const post = async (url, body, token = manifest.token) => {
      const response = await globalThis.fetch(`http://127.0.0.1:${manifest.port}${url}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-soundcraft-token': token }, body: JSON.stringify(body) });
      return response.status === 200 ? response.json() : { http: response.status };
    };
    const output = [];
    const cli = (...args) => runLocalServiceCli(['resposta-simulada', ...args], { directory, stdout: line => output.push(line) });
    assert.equal((await post('/responses/simulation/enqueue', { recipientId: 'ana', text: 'Oi' }, 'incorreto')).http, 401);
    await post('/commands/mode', { mode: 'passage' });
    assert.equal(await cli('configurar', JSON.stringify({ paLimitDb: -20, returns: {
      ana: { id: 'aux-1', confirmed: true, exclusive: true, available: true },
      bia: { id: 'aux-2', confirmed: true, exclusive: true, available: true },
    } })), 0);
    assert.equal(await cli('enfileirar', 'ana', 'Olá'), 0);
    const first = JSON.parse(output.at(-1));
    assert.equal(first.active.destination.destination, 'individual-return');
    assert.equal(await cli('enfileirar', 'bia', 'Próxima'), 0);
    const second = JSON.parse(output.at(-1));
    assert.equal(second.pending.length, 1);
    assert.equal(await cli('falhar', String(first.id)), 0);
    assert.equal(JSON.parse(output.at(-1)).active.recipientId, 'bia');
    assert.equal(await cli('cancelar', String(second.id)), 0);
    await post('/commands/mode', { mode: 'worship' });
    const text = await post('/responses/simulation/enqueue', { recipientId: 'sem-retorno', text: 'Somente texto' });
    assert.equal(text.events.at(-1).type, 'terminal');
    const active = await post('/responses/simulation/enqueue', { recipientId: 'ana', text: 'Em andamento' });
    onStatus('desconectada');
    const snapshot = await (await globalThis.fetch(`http://127.0.0.1:${manifest.port}/responses/simulation`,
      { headers: { 'x-soundcraft-token': manifest.token } })).json();
    assert.equal(snapshot.active, null);
    assert.equal(snapshot.events.at(-1).id, active.id);
    assert.equal(snapshot.events.at(-1).type, 'cancelled');
    assert.equal(sent, 0);
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
});
