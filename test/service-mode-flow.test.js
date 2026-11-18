import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServiceCommandFlow } from '../src/service-command-flow.js';
import { loadModeConfig, saveModeConfig } from '../src/mode-config.js';

test('configuração de master restringe culto e troca invalida proposta', async () => {
  const sent = [];
  const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: value => sent.push(value) });
  assert.equal(flow.setMode('worship').reason, 'master_not_configured');
  assert.equal(flow.configureMode({ passageInputs: ['principal', 'outra'], masterInputId: 'principal' }).ok, true);
  assert.equal(flow.setMode('worship').ok, true);
  const proposal = await flow.process({ text: 'mesa, mute canal 3' });
  assert.equal(proposal.status, 'proposal');
  assert.equal(flow.configureMode({ passageInputs: ['principal', 'outra'], masterInputId: 'outra' }).ok, true);
  assert.equal(flow.confirm({ id: proposal.id }).status, 'not-found');
  assert.equal((await flow.process({ text: 'mesa, mute canal 3' })).status, 'blocked');
  assert.deepEqual(sent, []);
});

test('configuração de modo persiste e falha fechada em conteúdo inválido', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mode-settings-'));
  try {
    assert.deepEqual(await loadModeConfig({ directory: dir }), { passageInputs: ['principal'], masterInputId: null });
    const config = { passageInputs: ['principal', 'outra'], masterInputId: 'outra' };
    await saveModeConfig(config, { directory: dir });
    assert.deepEqual(await loadModeConfig({ directory: dir }), config);
    await writeFile(path.join(dir, 'mode-config.json'), '{broken');
    await assert.rejects(loadModeConfig({ directory: dir }), /Configuração de modos inválida/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
