import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { runRegistryCommand } from '../src/registry-cli.js';

test('captura isolada propõe cadastro e revisão; mudanças e cancelamentos descartam resposta tardia', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'voice-assignment-'));
  const run = async (...args) => {
    const output = [];
    await runRegistryCommand(args, { directory, output: line => output.push(line) });
    return JSON.parse(output.at(-1));
  };
  let speech = '', release, calls = 0;
  let connected = true;
  const session = await run('sessao', 'criar', 'Ensaio');
  const ana = await run('pessoa', 'adicionar', 'Ana');
  const sourcePerson = await run('pessoa', 'adicionar', 'Operador');
  const source = await run('equipamento', 'adicionar', 'Origem', 'microfone', 'azul');
  const mic = await run('equipamento', 'adicionar', 'Mic', 'microfone', 'amarelo');
  const assignment = await run('vinculo', 'propor', `${session.id}`, `${sourcePerson.id}`, `${source.id}`, '1');
  await run('vinculo', 'confirmar', `${assignment.id}`);
  await run('entrada-fonte', 'vincular', `${session.id}`, 'principal', `${assignment.id}`);
  const device = await run('fisico-dispositivo', 'adicionar', 'Mesa', 'mesa');
  const start = await run('fisico-ponto', 'adicionar', 'equipment', 'Mic', '--equipamento', `${mic.id}`, '--direcao', 'output');
  const port = await run('fisico-ponto', 'adicionar', 'port', 'Entrada', '--dispositivo', `${device.id}`, '--direcao', 'input');
  const channel = await run('fisico-ponto', 'adicionar', 'channel', 'Canal', '--canal', '7', '--direcao', 'input');
  for (const [from, to, kind] of [[start.id, port.id, 'physical'], [port.id, channel.id, 'patch']]) {
    const link = await run('fisico-ligacao', 'propor', `${session.id}`, `${from}`, `${to}`, kind);
    await run('fisico-ligacao', 'confirmar', `${link.id}`, 'operador');
  }
  let sent = 0;
  const service = await createLocalService({ port: 0, runtimeDirectory: directory,
    readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => connected,
      mixer: { master: { input: () => ({ mute: () => { sent++; } }) } } }),
    createVoice: () => ({ start: async () => {}, stop: async () => {}, getStatus: () => ({ state: 'ready', error: null }),
      transcribe: async () => { calls++; return speech === 'pending' ? new Promise(resolve => { release = resolve; }) : speech; } }),
  });
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
    const post = async (endpoint, body) => (await globalThis.fetch(`http://127.0.0.1:${manifest.port}${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-soundcraft-token': manifest.token }, body: JSON.stringify(body),
    })).json();
    await post('/voice/start', {});
    assert.equal((await post('/voice/capture-assignment', {})).status, 'denied');
    await post('/commands/session', { sessionId: session.id });
    await post('/commands/mode', { mode: 'passage' });
    speech = 'microfone amarelo para Ana';
    const output = [];
    assert.equal(await runLocalServiceCli(['voz-cadastro'], { directory, stdout: line => output.push(line) }), 0);
    const proposed = JSON.parse(output.at(-1));
    assert.equal(proposed.status, 'proposal');
    assert.equal(proposed.proposal.personId, ana.id);
    assert.equal(proposed.proposal.channel, 7);
    assert.equal(proposed.proposal.origin, 'principal');
    assert.equal(proposed.reviewCommand, `passagem mostrar ${session.id}`);
    const review = await run('passagem', 'mostrar', `${session.id}`);
    const item = review.propostasVoz.find(value => value.id === proposed.proposal.id);
    assert.equal((await run('passagem', 'confirmar', `${session.id}`, 'voz', `${item.id}`, item.revisao)).status, 'confirmado');
    speech = 'microfone amarelo para Ana';
    const conflict = await post('/voice/capture-assignment', {});
    assert.equal(conflict.reason, 'confirmed_assignment_conflict');
    await run('passagem', 'rejeitar', `${session.id}`, 'voz', `${conflict.proposal.id}`);
    speech = 'microfone amarelo para Pessoa desconhecida';
    assert.equal((await post('/voice/capture-assignment', {})).reason, 'person_unknown');
    await run('equipamento', 'adicionar', 'Outro mic', 'microfone', 'amarelo');
    speech = 'microfone amarelo para Ana';
    const ambiguous = await post('/voice/capture-assignment', {});
    assert.equal(ambiguous.reason, 'equipment_ambiguous');
    await run('passagem', 'corrigir', `${session.id}`, 'voz', `${ambiguous.proposal.id}`, `${ana.id}`, `${mic.id}`, '7');
    assert.equal((await run('passagem', 'rejeitar', `${session.id}`, 'voz', `${ambiguous.proposal.id}`)).status, 'rejeitado');
    const before = (await run('voz-vinculo', 'listar', `${session.id}`)).length;
    speech = 'cancelar';
    assert.equal((await post('/voice/capture-assignment', {})).status, 'cancelled');
    speech = 'pending';
    const promise = post('/voice/capture-assignment', {});
    while (!release) await new Promise(resolve => globalThis.setTimeout(resolve, 1));
    await post('/commands/session', { sessionId: null });
    release('microfone amarelo para Ana');
    assert.equal((await promise).status, 'cancelled');
    await post('/commands/session', { sessionId: session.id });
    release = undefined;
    const disconnected = post('/voice/capture-assignment', {});
    while (!release) await new Promise(resolve => globalThis.setTimeout(resolve, 1));
    connected = false;
    release('microfone amarelo para Ana');
    assert.equal((await disconnected).status, 'cancelled');
    connected = true;
    release = undefined;
    const paused = post('/voice/capture-assignment', {});
    while (!release) await new Promise(resolve => globalThis.setTimeout(resolve, 1));
    await post('/commands/mode', { mode: 'paused' });
    release('microfone amarelo para Ana');
    assert.equal((await paused).status, 'cancelled');
    await post('/commands/mode', { mode: 'passage' });
    release = undefined;
    const controller = new globalThis.AbortController();
    const abandoned = globalThis.fetch(`http://127.0.0.1:${manifest.port}/voice/capture-assignment`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-soundcraft-token': manifest.token },
      body: JSON.stringify({}), signal: controller.signal,
    }).catch(() => null);
    while (!release) await new Promise(resolve => globalThis.setTimeout(resolve, 1));
    controller.abort();
    await abandoned;
    await new Promise(resolve => globalThis.setTimeout(resolve, 30));
    release('microfone amarelo para Ana');
    await new Promise(resolve => globalThis.setTimeout(resolve, 30));
    assert.equal((await run('voz-vinculo', 'listar', `${session.id}`)).length, before);
    assert.equal(sent, 0);
    assert.ok(calls >= 5);
    connected = false;
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
});
