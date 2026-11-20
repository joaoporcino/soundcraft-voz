import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { runRegistryCommand } from '../src/registry-cli.js';
import { createPhysicalPoint } from '../src/terminal-physical-points.js';
import { proposeSignalLink } from '../src/terminal-signal-link.js';
import { physicalRevision } from '../src/physical-review.js';

function makeUI(answers, registry) {
  const messages = [];
  return {
    messages,
    screen: (...args) => messages.push(args),
    ask: async () => answers.shift() ?? null,
    write: value => messages.push(value),
    registry,
  };
}

test('CMD cria ponto referenciado pela variante revisada e transmite token do dispositivo', async () => {
  const device = { id: 8, name: 'Medusa palco', type: 'medusa' };
  const calls = [];
  const registry = async (args, { output }) => {
    calls.push(args);
    if (args[0] === 'fisico-dispositivo') output(JSON.stringify([device]));
  };
  const ui = makeUI(['3', 'Via 1', '1', '1', 'SIM', ''], registry);
  await createPhysicalPoint(ui);
  const write = calls.find(args => args[0] === 'fisico-ponto');
  assert.equal(write[1], 'adicionar-revisado');
  assert.deepEqual(write.slice(-2), ['--revisao-dispositivo', physicalRevision('dispositivo', device)]);
  assert.ok(ui.messages.some(value => typeof value === 'string' && /Ponto cadastrado/.test(value)));
});

test('CMD propõe ligação com revisões da sessão e extremidades e não confirma', async () => {
  const session = { id: 4, name: 'Ensaio' };
  const points = [
    { id: 11, type: 'other', label: 'Saída', direction: 'output', deviceId: null, equipmentId: null, personId: null, monitorReturnId: null, channel: null },
    { id: 12, type: 'other', label: 'Entrada', direction: 'input', deviceId: null, equipmentId: null, personId: null, monitorReturnId: null, channel: null },
  ];
  const calls = [];
  const registry = async (args, { output }) => {
    calls.push(args);
    if (args[0] === 'retorno' && args[1] === 'listar') output('[]');
    else if (args[0] === 'fisico-ponto' && args[1] === 'listar') output(JSON.stringify(points));
    else if (args[0] === 'sessao' && args[1] === 'listar') output(JSON.stringify([session]));
  };
  const ui = makeUI(['1', '2', '1', 'SIM', ''], registry);
  await proposeSignalLink({ ...ui, session });
  const write = calls.find(args => args[0] === 'fisico-ligacao');
  assert.deepEqual(write.slice(0, 6), ['fisico-ligacao', 'propor-revisado', '4', '11', '12', 'physical']);
  assert.deepEqual(write.slice(6), [physicalRevision('sessao', session), physicalRevision('ponto', points[0]), physicalRevision('ponto', points[1]), 'desconhecido', 'desconhecido']);
  assert.ok(ui.messages.some(value => typeof value === 'string' && /confirmação é uma ação posterior/.test(value)));
});

test('CMD recusa ligação se AUX exibido mudar enquanto o operador revisa', async () => {
  const session = { id: 1, name: 'Ensaio' };
  const point = { id: 10, type: 'monitor_return', label: 'Retorno', direction: 'output', deviceId: null, equipmentId: null, personId: null, monitorReturnId: 5, channel: null };
  const other = { id: 11, type: 'other', label: 'Fone', direction: 'input', deviceId: null, equipmentId: null, personId: null, monitorReturnId: null, channel: null };
  const monitorReturn = { id: 5, sessionId: 1, aux: 2, confirmedPeople: 1 };
  let returnReads = 0;
  const calls = [];
  const registry = async (args, { output }) => {
    calls.push(args);
    if (args[0] === 'retorno' && args[1] === 'listar') {
      returnReads++;
      output(JSON.stringify([returnReads >= 3 ? { ...monitorReturn, confirmedPeople: 2 } : monitorReturn]));
    } else if (args[0] === 'fisico-ponto' && args[1] === 'listar') output(JSON.stringify([point, other]));
    else if (args[0] === 'sessao' && args[1] === 'listar') output(JSON.stringify([session]));
  };
  const ui = makeUI(['1', '2', '1', 'SIM', ''], registry);
  await proposeSignalLink({ ...ui, session });
  assert.ok(ui.messages.some(screen => Array.isArray(screen) && screen[2]?.some(line => typeof line === 'string' && /AUX 2 .*1 pessoa/.test(line))));
  assert.equal(calls.some(args => args[0] === 'fisico-ligacao'), false);
  assert.ok(ui.messages.some(value => typeof value === 'string' && /alterado/.test(value)));
});

test('variante de criação de ponto recusa referência alterada em outra conexão sem inserir', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-point-revision-'));
  const run = async (...args) => {
    const result = [];
    await runRegistryCommand(args, { directory, output: line => result.push(line) });
    return JSON.parse(result.at(-1));
  };
  const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
  try {
    const device = await run('fisico-dispositivo', 'adicionar', 'Medusa', 'medusa');
    const listed = await run('fisico-dispositivo', 'listar');
    db.prepare('UPDATE physical_devices SET name=? WHERE id=?').run('Medusa renomeada', device.id);
    await assert.rejects(run('fisico-ponto', 'adicionar-revisado', 'port', 'Entrada', '--direcao', 'input', '--dispositivo', String(device.id),
      '--revisao-dispositivo', physicalRevision('dispositivo', listed[0])), /alterad|revisão|revisao/i);
    assert.deepEqual(await run('fisico-ponto', 'listar'), []);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('variantes de ponto aceitam referências de pessoa e equipamento e recusam referência adicional sem token', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-point-reference-types-'));
  const run = async (...args) => {
    const result = [];
    await runRegistryCommand(args, { directory, output: line => result.push(line) });
    return JSON.parse(result.at(-1));
  };
  try {
    const person = await run('pessoa', 'adicionar', 'Ana');
    const equipment = await run('equipamento', 'adicionar', 'Microfone', 'microfone', 'amarelo', '--sem-fio');
    const people = await run('pessoa', 'listar');
    const equipmentList = await run('equipamento', 'listar');
    await run('fisico-ponto', 'adicionar-revisado', 'person', 'Ana', '--direcao', 'output', '--pessoa', String(person.id),
      '--revisao-pessoa', physicalRevision('pessoa', people[0]));
    await run('fisico-ponto', 'adicionar-revisado', 'equipment', 'Microfone', '--direcao', 'output', '--equipamento', String(equipment.id),
      '--revisao-equipamento', physicalRevision('equipamento', equipmentList[0]));
    await assert.rejects(run('fisico-ponto', 'adicionar-revisado', 'equipment', 'Microfone', '--direcao', 'output', '--equipamento', String(equipment.id),
      '--dispositivo', '1', '--revisao-equipamento', physicalRevision('equipamento', equipmentList[0])), /Referência extra/);
    assert.equal((await run('fisico-ponto', 'listar')).length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ponto de AUX revisa sessão e retorno e proposta rejeita alteração posterior do AUX', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-monitor-point-revision-'));
  const run = async (...args) => {
    const result = [];
    await runRegistryCommand(args, { directory, output: line => result.push(line) });
    return JSON.parse(result.at(-1));
  };
  const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
  try {
    const session = await run('sessao', 'criar', 'Ensaio');
    const otherSession = await run('sessao', 'criar', 'Outra sessão');
    await run('aux-config', 'definir', '8');
    const monitorReturn = await run('retorno', 'adicionar', String(session.id), '2');
    const returns = await run('retorno', 'listar', String(session.id));
    const sessions = await run('sessao', 'listar');
    const returnToken = physicalRevision('retorno', returns[0]);
    await assert.rejects(run('fisico-ponto', 'adicionar-revisado', 'monitor_return', 'AUX 2', '--direcao', 'output', '--retorno', String(monitorReturn.id),
      '--sessao-revisada', String(otherSession.id), '--revisao-sessao', physicalRevision('sessao', sessions[1]), '--revisao-retorno', returnToken), /alterad|removid|referência|referencia/i);
    const point = await run('fisico-ponto', 'adicionar-revisado', 'monitor_return', 'AUX 2', '--direcao', 'output', '--retorno', String(monitorReturn.id),
      '--sessao-revisada', String(session.id), '--revisao-sessao', physicalRevision('sessao', sessions[0]), '--revisao-retorno', returnToken);
    const source = await run('fisico-ponto', 'adicionar', 'other', 'Mesa AUX', '--direcao', 'output');
    const sourceToken = physicalRevision('ponto', source);
    const sessionToken = physicalRevision('sessao', session);
    const currentReturn = (await run('retorno', 'listar', String(session.id)))[0];
    const link = await run('fisico-ligacao', 'propor-revisado', String(session.id), String(source.id), String(point.id), 'physical',
      sessionToken, sourceToken, physicalRevision('ponto', point), 'desconhecido', physicalRevision('retorno', currentReturn));
    assert.equal(link.status, 'proposto');
    db.prepare('UPDATE monitor_returns SET aux=? WHERE id=?').run(3, monitorReturn.id);
    await assert.rejects(run('fisico-ligacao', 'propor-revisado', String(session.id), String(source.id), String(point.id), 'physical',
      sessionToken, sourceToken, physicalRevision('ponto', point), 'desconhecido', physicalRevision('retorno', currentReturn)), /alterad|sessão/i);
    assert.equal((await run('fisico-ligacao', 'listar', String(session.id))).length, 1);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('variante de proposta de ligação recusa ponto alterado em outra conexão sem criar proposta', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-link-revision-'));
  const run = async (...args) => {
    const result = [];
    await runRegistryCommand(args, { directory, output: line => result.push(line) });
    return JSON.parse(result.at(-1));
  };
  const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
  try {
    const session = await run('sessao', 'criar', 'Ensaio');
    const from = await run('fisico-ponto', 'adicionar', 'other', 'Saída', '--direcao', 'output');
    const to = await run('fisico-ponto', 'adicionar', 'other', 'Entrada', '--direcao', 'input');
    db.prepare('UPDATE signal_points SET label=? WHERE id=?').run('Entrada revisada', to.id);
    await assert.rejects(run('fisico-ligacao', 'propor-revisado', String(session.id), String(from.id), String(to.id), 'physical',
      physicalRevision('sessao', session), physicalRevision('ponto', from), physicalRevision('ponto', to), 'desconhecido', 'desconhecido'), /alterad|revisão|revisao/i);
    assert.deepEqual(await run('fisico-ligacao', 'listar', String(session.id)), []);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('variantes recusam referências de pessoa/equipamento e sessão/extremidade removidas sem escrita', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-physical-reference-races-'));
  const run = async (...args) => {
    const result = [];
    await runRegistryCommand(args, { directory, output: line => result.push(line) });
    return JSON.parse(result.at(-1));
  };
  const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
  try {
    const person = await run('pessoa', 'adicionar', 'Ana');
    const equipment = await run('equipamento', 'adicionar', 'Microfone', 'microfone');
    const personRevision = physicalRevision('pessoa', (await run('pessoa', 'listar'))[0]);
    const equipmentRevision = physicalRevision('equipamento', (await run('equipamento', 'listar'))[0]);

    db.prepare('DELETE FROM people WHERE id=?').run(person.id);
    await assert.rejects(run('fisico-ponto', 'adicionar-revisado', 'person', 'Ana', '--direcao', 'output', '--pessoa', String(person.id),
      '--revisao-pessoa', personRevision), /alterad|removida/i);
    assert.deepEqual(await run('fisico-ponto', 'listar'), []);

    db.prepare('DELETE FROM equipment WHERE id=?').run(equipment.id);
    await assert.rejects(run('fisico-ponto', 'adicionar-revisado', 'equipment', 'Microfone', '--direcao', 'output', '--equipamento', String(equipment.id),
      '--revisao-equipamento', equipmentRevision), /alterad|removida/i);
    assert.deepEqual(await run('fisico-ponto', 'listar'), []);

    const sessionForEndpoint = await run('sessao', 'criar', 'Sessão extremidade');
    const from = await run('fisico-ponto', 'adicionar', 'other', 'Origem', '--direcao', 'output');
    const to = await run('fisico-ponto', 'adicionar', 'other', 'Destino', '--direcao', 'input');
    const sessionEndpointToken = physicalRevision('sessao', sessionForEndpoint);
    const fromToken = physicalRevision('ponto', from);
    const toToken = physicalRevision('ponto', to);
    db.prepare('DELETE FROM signal_points WHERE id=?').run(to.id);
    await assert.rejects(run('fisico-ligacao', 'propor-revisado', String(sessionForEndpoint.id), String(from.id), String(to.id), 'physical',
      sessionEndpointToken, fromToken, toToken, 'desconhecido', 'desconhecido'), /Ponto alterado ou removido/i);
    assert.deepEqual(await run('fisico-ligacao', 'listar', String(sessionForEndpoint.id)), []);

    const sessionForLink = await run('sessao', 'criar', 'Sessão removida');
    const sessionToken = physicalRevision('sessao', sessionForLink);
    db.prepare('DELETE FROM sessions WHERE id=?').run(sessionForLink.id);
    await assert.rejects(run('fisico-ligacao', 'propor-revisado', String(sessionForLink.id), String(from.id), String(from.id), 'internal',
      sessionToken, fromToken, fromToken, 'desconhecido', 'desconhecido'), /Sessão alterada ou removida/i);
    assert.deepEqual(await run('fisico-ligacao', 'listar', String(sessionForEndpoint.id)), []);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});
