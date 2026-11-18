import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { createServiceLlm } from '../src/service-llm.js';

const interpreted = { intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null };
const response = value => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) });

test('terminal envia texto ao provedor apenas com consentimento e confirmação é separada', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-integration-'));
  const sent = [], calls = [];
  const llm = createServiceLlm({ env: { GEMINI_API_KEY: 'TEST_SECRET' }, fetchImpl: async (url, options) => {
    calls.push({ url, options }); return response(interpreted);
  } });
  const service = await createLocalService({ port: 0, runtimeDirectory: dir, llm, readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push([channel, 'mute']), unmute() {}, setFaderLevelDB() {} }) } } }),
  });
  const lines = [], errors = [];
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: text => lines.push(text), stderr: text => errors.push(text) });
  try {
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('llm', 'gemini', 'model-test', '20'), 0);
    assert.equal(await cli('texto', 'mesa, por favor silencie o terceiro canal'), 1);
    assert.equal(calls.length, 0);
    assert.equal(await cli('texto-llm', 'mesa, por favor silencie o terceiro canal'), 1);
    assert.equal(calls.length, 0);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, por favor silencie o terceiro canal'), 0);
    assert.match([...lines, ...errors].join('\n'), /custo/i);
    assert.equal(calls.length, 1);
    const proposal = JSON.parse(lines.at(-1));
    assert.equal(proposal.source, 'provider');
    assert.deepEqual(sent, []);
    assert.equal(await cli('confirmar', proposal.id), 0);
    assert.deepEqual(sent, [[3, 'mute']]);
    assert.equal(await cli('confirmar', proposal.id), 1);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, mute canal 4'), 0);
    assert.equal(calls.length, 1, 'comando local não chama provedor');
    assert.equal(await cli('llm', 'none'), 0);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, por favor silencie o terceiro canal'), 1);
    assert.equal(calls.length, 1);
    const names = await readdir(dir);
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const text = await readFile(path.join(dir, name), 'utf8');
      assert.doesNotMatch(text, /TEST_SECRET|silencie o terceiro/);
    }
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('resposta tardia não vira proposta após pausa nem executa ação', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-late-'));
  let complete, started;
  const entered = new Promise(resolve => { started = resolve; });
  const llm = createServiceLlm({ env: { GEMINI_API_KEY: 'TEST_SECRET' }, fetchImpl: () => new Promise(resolve => { complete = resolve; started(); }) });
  const sent = [];
  const service = await createLocalService({ port: 0, runtimeDirectory: dir, llm, readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push(channel), unmute() {}, setFaderLevelDB() {} }) } } }),
  });
  const lines = [];
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: text => lines.push(text), stderr: text => lines.push(text) });
  try {
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('llm', 'gemini', 'model-test', '20'), 0);
    const pending = cli('texto-llm', '--consinto', 'mesa, por favor silencie o terceiro canal');
    await Promise.race([entered, pending.then(() => { throw new Error('A solicitação terminou antes do transporte simulado iniciar'); })]);
    await cli('modo', 'pausa');
    complete(response(interpreted));
    assert.equal(await pending, 1);
    assert.notEqual(JSON.parse(lines.at(-1)).status, 'proposal');
    assert.deepEqual(sent, []);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('terminal seleciona OpenAI e Anthropic, mantém limite global após reinício e exige confirmação', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-llm-persistent-'));
  const sent = [], transports = [];
  const makeLlm = () => createServiceLlm({ directory: dir, env: { OPENAI_API_KEY: 'OPENAI_TEST_KEY', ANTHROPIC_API_KEY: 'ANTHROPIC_TEST_KEY' },
    fetchImpl: async (url, options) => {
      transports.push({ url, options });
      if (url.includes('openai.com')) return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(interpreted) }] }] }) };
      return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(interpreted) }] }) };
    } });
  const start = () => createLocalService({ port: 0, runtimeDirectory: dir, llm: makeLlm(), readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: channel => ({ mute: () => sent.push(channel) }) } } }) });
  let service = await start();
  const lines = [];
  const cli = (...args) => runLocalServiceCli(args, { directory: dir, stdout: text => lines.push(text), stderr: text => lines.push(text) });
  try {
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('llm', 'openai', 'modelo-openai', '2'), 0);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, silencie a terceira entrada'), 0);
    assert.deepEqual(sent, []);
    assert.equal(await cli('confirmar', JSON.parse(lines.at(-1)).id), 0);
    assert.deepEqual(sent, [3]);
    assert.equal(await cli('llm', 'anthropic', 'modelo-anthropic', '2'), 0);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, silencie a terceira entrada'), 0);
    assert.equal(transports.length, 2);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, silencie a terceira entrada'), 1);
    assert.equal(transports.length, 2);
    await service.close();
    service = await start();
    assert.equal(await cli('status'), 0);
    const status = JSON.parse(lines.at(-1));
    assert.equal(status.llm.selected, 'anthropic');
    assert.equal(status.llm.used, 2);
    assert.equal(status.llm.dailyLimit, 2);
    assert.equal(await cli('modo', 'passagem'), 0);
    assert.equal(await cli('texto-llm', '--consinto', 'mesa, silencie a terceira entrada'), 1);
    assert.equal(transports.length, 2);
    const db = await readFile(path.join(dir, 'llm-state.sqlite'));
    assert.doesNotMatch(db.toString('latin1'), /OPENAI_TEST_KEY|ANTHROPIC_TEST_KEY|silencie a terceira/);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});
