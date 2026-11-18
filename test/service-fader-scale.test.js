import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DBToFaderValue } from 'soundcraft-ui-connection';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';

test('terminal revisa escala e recusa pedido relativo se a observação mudou ou foi usada', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-scale-'));
  let inbound, onStatus;
  const sent = [], output = [];
  const service = await createLocalService({ port: 0, runtimeDirectory: dir, readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: options => {
      inbound = options.onInbound; onStatus = options.onStatus;
      return { status: 'conectada', start() { onStatus('conectada'); }, stop: async () => {}, isConnected: () => true,
        mixer: { master: { input: channel => ({ setFaderLevelDB: db => sent.push([channel, db]) }) } } };
    },
  });
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: x => output.push(x), stderr: x => output.push(x) });
  const text = async value => { await cli('texto', `mesa, ${value}`); return JSON.parse(output.at(-1)); };
  try {
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.notEqual((await text('abaixa canal 3 dez pontos')).status, 'proposal');
    const mix = `SETD^i.2.mix^${DBToFaderValue(-30)}`;
    inbound(mix);
    let proposal = await text('abaixa canal 3 dez pontos');
    assert.equal(proposal.status, 'proposal');
    assert.deepEqual(sent, []);
    inbound(mix); // revisão muda mesmo que o valor seja igual
    await cli('confirmar', proposal.id);
    assert.notEqual(JSON.parse(output.at(-1)).status, 'sent');
    assert.deepEqual(sent, []);
    proposal = await text('abaixa canal 3 dez pontos');
    assert.equal(await cli('confirmar', proposal.id), 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], 3);
    assert.ok(Math.abs(sent[0][1] - (-36)) < 1e-7);
    assert.notEqual((await text('abaixa canal 3 dez pontos')).status, 'proposal');
    proposal = await text('coloca canal 3 em cinquenta pontos');
    assert.equal(proposal.status, 'proposal');
    assert.equal(await cli('confirmar', proposal.id), 0);
    assert.deepEqual(sent[1], [3, -30]);
    assert.equal(JSON.parse(output.at(-1)).confirmed, false);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});
