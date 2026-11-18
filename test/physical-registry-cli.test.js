import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { runRegistryCommand } from '../src/registry-cli.js';

test('terminal cadastra caminho de entrada, revisa proposta falada e conserva patch separado', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-physical-cli-'));
  const run = async (...args) => {
    const output = [];
    await runRegistryCommand(args, { directory, output: text => output.push(text) });
    return JSON.parse(output.at(-1));
  };
  try {
    const person = await run('pessoa', 'adicionar', 'Ana');
    const session = await run('sessao', 'criar', 'Ensaio');
    const mic = await run('equipamento', 'adicionar', 'Mic', 'microfone', 'amarelo', '--sem-fio');
    const mixer = await run('fisico-dispositivo', 'adicionar', 'Mesa', 'mesa');
    const start = await run('fisico-ponto', 'adicionar', 'equipment', 'Mic', '--equipamento', String(mic.id), '--direcao', 'output');
    const input = await run('fisico-ponto', 'adicionar', 'port', 'Entrada 4', '--dispositivo', String(mixer.id), '--direcao', 'input');
    const channel = await run('fisico-ponto', 'adicionar', 'channel', 'Canal 7', '--canal', '7', '--direcao', 'input');
    const connection = await run('fisico-ligacao', 'propor', String(session.id), String(start.id), String(input.id), 'physical');
    const patch = await run('fisico-ligacao', 'propor', String(session.id), String(input.id), String(channel.id), 'patch');
    await run('fisico-ligacao', 'confirmar', String(connection.id), 'operador');
    const pending = await run('voz-vinculo', 'propor', String(session.id), 'mic-principal', 'microfone amarelo sem fio está com a Ana');
    assert.equal(pending.status, 'clarification');
    assert.equal(pending.proposal.channel, null);
    const corrected = await run('voz-vinculo', 'corrigir', String(pending.proposal.id), String(person.id), String(mic.id), '7');
    assert.equal(corrected.channel, 7);
    await assert.rejects(run('voz-vinculo', 'confirmar', String(pending.proposal.id)), /caminho|patch/i);
    assert.equal((await run('voz-vinculo', 'rejeitar', String(pending.proposal.id))).status, 'rejeitado');
    await run('fisico-ligacao', 'confirmar', String(patch.id), 'operador');
    const speech = await run('voz-vinculo', 'propor', String(session.id), 'mic-principal', 'microfone amarelo sem fio está com a Ana');
    assert.equal(speech.status, 'proposal');
    assert.equal(speech.proposal.personId, person.id);
    assert.equal(speech.proposal.channel, 7);
    assert.equal(speech.proposal.status, 'proposto');
    const confirmed = await run('voz-vinculo', 'confirmar', String(speech.proposal.id));
    assert.equal(confirmed.status, 'confirmado');
    assert.equal((await run('vinculo', 'listar', String(session.id)))[0].channel, 7);
    assert.equal((await run('voz-vinculo', 'listar', String(session.id))).length, 2);
    const trace = await run('fisico-caminho', 'consultar', String(session.id), String(start.id));
    assert.ok(trace.links.some(link => link.kind === 'patch' && link.status === 'confirmado'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cadastro físico persiste para consulta em outro processo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-physical-process-'));
  const run = (...args) => spawnSync(process.execPath, ['src/index.js', '--cadastro', ...args], {
    cwd: process.cwd(), env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: directory }, encoding: 'utf8',
  });
  try {
    const added = run('fisico-dispositivo', 'adicionar', 'Medusa palco', 'medusa');
    assert.equal(added.status, 0, added.stderr);
    const listed = run('fisico-dispositivo', 'listar');
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(JSON.parse(listed.stdout).find(item => item.type === 'medusa').name, 'Medusa palco');
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
