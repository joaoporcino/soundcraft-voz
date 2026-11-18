import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import os from 'node:os';
import path from 'node:path';
import { createLlmState, LLM_STATE_FILE } from '../src/llm-state.js';
import { createServiceLlm } from '../src/service-llm.js';
import { createServiceCommandFlow } from '../src/service-command-flow.js';
import { createBackup, restoreBackup } from '../src/backup.js';

test('limite diário sobrevive a configuração, falhas, reinício e relógio retrocedido', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-state-'));
  let instant = '2026-11-18T10:00:00.000Z';
  const state = createLlmState({ directory, now: () => new Date(instant) });
  let calls = 0;
  const llm = createServiceLlm({ state, env: { GEMINI_API_KEY: 'SEGREDO_TESTE' }, fetchImpl: async () => { calls++; throw new Error('falha'); } });
  try {
    assert.throws(() => llm.configure({ provider: 'gemini', model: 'modelo' }), /limite/);
    llm.configure({ provider: 'gemini', model: 'modelo', dailyLimit: 2 });
    await assert.rejects(llm.interpret({ text: 'pedido', consent: false }));
    assert.equal(state.read().used, 0);
    await assert.rejects(llm.interpret({ text: 'pedido', consent: true }));
    assert.equal(state.read().used, 1);
    llm.configure({ provider: 'none' });
    llm.configure({ provider: 'gemini', model: 'modelo', dailyLimit: 2 });
    await assert.rejects(llm.interpret({ text: 'pedido', consent: true }));
    await assert.rejects(llm.interpret({ text: 'pedido', consent: true }));
    assert.equal(calls, 2);
    llm.close();
    const restarted = createLlmState({ directory, now: () => new Date(instant) });
    try {
      assert.equal(restarted.read().used, 2);
      assert.throws(() => restarted.reserve(restarted.read().generation), /Limite/);
      instant = '2026-11-18T09:00:00.000Z';
      assert.throws(() => restarted.reserve(restarted.read().generation), /retrocedeu/);
      instant = '2026-11-19T10:00:00.000Z';
      assert.equal(restarted.reserve(restarted.read().generation).used, 1);
    } finally { restarted.close(); }
    assert.equal((await readFile(path.join(directory, LLM_STATE_FILE))).includes(Buffer.from('SEGREDO_TESTE')), false);
  } finally { llm.close(); await rm(directory, { recursive: true, force: true }); }
});

test('credencial ausente ou removida bloqueia antes de reservar para cada provedor', async () => {
  const env = {}, calls = [];
  const adapter = provider => () => ({ interpret: async () => { calls.push(provider); return {
    intent: 'command', target: 'canal 1', action: 'mute', value: null, relative: false, clarification: null,
  }; } });
  const llm = createServiceLlm({ env, factories: { gemini: adapter('gemini'), openai: adapter('openai'), anthropic: adapter('anthropic') } });
  try {
    for (const [provider, key] of [['gemini', 'GEMINI_API_KEY'], ['openai', 'OPENAI_API_KEY'], ['anthropic', 'ANTHROPIC_API_KEY']]) {
      llm.configure({ provider, model: 'modelo', dailyLimit: 10 });
      const before = llm.status().used;
      assert.equal(llm.status().credentialAvailable, false);
      assert.equal(llm.status().available, false);
      await assert.rejects(llm.interpret({ text: 'pedido', consent: true }), /unavailable/);
      assert.equal(llm.status().used, before);
      env[key] = 'SEGREDO_TESTE';
      assert.equal(llm.status().credentialAvailable, true);
      await llm.interpret({ text: 'pedido', consent: true });
      assert.equal(llm.status().used, before + 1);
      delete env[key];
      assert.equal(llm.status().credentialAvailable, false);
      await assert.rejects(llm.interpret({ text: 'pedido', consent: true }), /unavailable/);
      assert.equal(llm.status().used, before + 1);
      assert.doesNotMatch(JSON.stringify(llm.status()), /SEGREDO_TESTE/);
    }
    assert.deepEqual(calls, ['gemini', 'openai', 'anthropic']);
  } finally { llm.close(); }
});

test('processos concorrentes reservam atomicamente sem ultrapassar limite', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-race-'));
  const state = createLlmState({ directory });
  const row = state.configure({ provider: 'gemini', model: 'modelo', dailyLimit: 2 });
  state.close();
  const source = `import {createLlmState} from './src/llm-state.js'; const s=createLlmState({directory:process.argv[1]}); try {s.reserve(Number(process.argv[2])); process.stdout.write('ok');} catch {process.stdout.write('denied');} finally {s.close();}`;
  const worker = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, directory, String(row.generation)]);
    let output = ''; child.stdout.on('data', data => { output += data; }); child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`exit ${code}`)));
  });
  try {
    const result = await Promise.all(Array.from({ length: 5 }, worker));
    assert.equal(result.filter(value => value === 'ok').length, 2);
    const verify = createLlmState({ directory });
    try { assert.equal(verify.read().used, 2); } finally { verify.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('troca por outro processo bloqueia seleção antiga e resposta tardia sem repetir', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-config-race-'));
  let release, calls = 0;
  const llm = createServiceLlm({ directory, env: { GEMINI_API_KEY: 'segredo' }, fetchImpl: () => {
    calls++; return new Promise(resolve => { release = resolve; });
  } });
  const other = createLlmState({ directory });
  try {
    llm.configure({ provider: 'gemini', model: 'modelo', dailyLimit: 2 });
    const pending = llm.interpret({ text: 'pedido', consent: true });
    other.configure({ provider: 'none', model: null, dailyLimit: 2 });
    release({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      intent: 'command', target: 'canal 1', action: 'mute', value: null, relative: false, clarification: null,
    }) }] } }] }) });
    await assert.rejects(pending);
    assert.equal(llm.status().reloadRequired, true);
    await assert.rejects(llm.interpret({ text: 'novo', consent: true }));
    assert.equal(calls, 1);
    assert.equal(other.read().used, 1);
  } finally { other.close(); llm.close(); await rm(directory, { recursive: true, force: true }); }
});

test('troca externa depois da proposta impede confirmação da interpretação anterior', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-proposal-race-'));
  const payload = { intent: 'command', target: 'canal 1', action: 'mute', value: null, relative: false, clarification: null };
  const llm = createServiceLlm({ directory, env: { GEMINI_API_KEY: 'segredo' }, fetchImpl: async () => ({ ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }) }) });
  const other = createLlmState({ directory });
  const sent = [];
  const flow = createServiceCommandFlow({ provider: llm, isConnected: () => true, sendCommand: command => sent.push(command) });
  try {
    llm.configure({ provider: 'gemini', model: 'modelo', dailyLimit: 2 });
    flow.setMode('passage');
    const proposal = await flow.process({ text: 'mesa, silencie a primeira entrada', consentToProvider: true });
    assert.equal(proposal.status, 'proposal');
    other.configure({ provider: 'none', model: null, dailyLimit: 2 });
    assert.equal(flow.confirm({ id: proposal.id }).status, 'denied');
    assert.deepEqual(sent, []);
  } finally { other.close(); llm.close(); await rm(directory, { recursive: true, force: true }); }
});

test('backup conserva configuração e consumo, mas restauração bloqueia até reconhecimento', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-backup-'));
  const sourceDir = path.join(parent, 'source'), restoreDir = path.join(parent, 'restore'), backup = path.join(parent, 'backup.json');
  const state = createLlmState({ directory: sourceDir });
  try {
    const row = state.configure({ provider: 'openai', model: 'modelo', dailyLimit: 3 });
    state.reserve(row.generation);
    await createBackup({ directory: sourceDir, destination: backup });
    await restoreBackup({ directory: restoreDir, source: backup });
    const restored = createLlmState({ directory: restoreDir });
    try {
      assert.equal(restored.read().provider, 'openai');
      assert.equal(restored.read().used, 1);
      assert.equal(restored.read().restore_lock, 1);
      assert.throws(() => restored.reserve(restored.read().generation), /revisão/);
      restored.acknowledgeRestore();
      assert.equal(restored.reserve(restored.read().generation).used, 2);
    } finally { restored.close(); }
  } finally { state.close(); await rm(parent, { recursive: true, force: true }); }
});
