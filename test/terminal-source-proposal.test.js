import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runRegistryCommand } from '../src/registry-cli.js';
import { proposeSource } from '../src/terminal-source-proposal.js';
import { DatabaseSync } from 'node:sqlite';
import { soundcheckRevision } from '../src/soundcheck-review.js';

async function scenario(answers, registry, session = { id: 1, name: 'Ensaio' }) {
  const messages = [];
  const result = await proposeSource({ session, registry, ask: async () => answers.shift() ?? null,
    screen: (section, title, lines) => messages.push(title, ...lines), write: value => messages.push(value) });
  return { result, text: messages.join('\n') };
}

test('busca e distingue duplicatas, propondo sem confirmar em banco temporário', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-selector-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    await registry(['sessao', 'criar', 'Ensaio'], silent);
    for (let i = 0; i < 9; i++) await registry(['pessoa', 'adicionar', 'Pessoa'], silent);
    await registry(['equipamento', 'adicionar', 'Mic', 'microfone', 'azul'], silent);
    const result = await scenario(['p', '1', 'b', 'azul', '1', '3', 'SIM', ''], registry);
    assert.match(result.text, /Página 2 de 2/);
    assert.match(result.text, /Pessoa \(ID 9\)/);
    assert.match(result.text, /confirmação é uma ação posterior/);
    const output = [];
    await registry(['vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.equal(JSON.parse(output[0])[0].personId, 9);
    assert.equal(JSON.parse(output[0])[0].status, 'proposto');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('vazio, cancelamento, EOF e alteração observada não criam vínculo', async () => {
  for (const answers of [['0'], [], ['1', '1', '', 'NÃO']]) {
    const writes = [];
    const registry = async (args, { output }) => {
      if (args[1] === 'propor-revisado') writes.push(args);
      else output(JSON.stringify(args[0] === 'pessoa' ? [{ id: 1, name: 'Pessoa' }] : [{ id: 1, name: 'Mic', kind: 'microfone', color: null, model: null, wireless: null, capsule: null }]));
    };
    await scenario([...answers], registry);
    assert.equal(writes.length, 0);
  }
  let reads = 0, writes = 0;
  const registry = async (args, { output }) => {
    if (args[1] === 'propor-revisado') { writes++; return; }
    const data = args[0] === 'sessao' ? [{ id: 1, name: 'Ensaio' }] : args[0] === 'pessoa' ?
      [{ id: 1, name: ++reads === 1 ? 'Pessoa' : 'Alterada' }] : [{ id: 1, name: 'Mic', kind: 'microfone', color: null, model: null, wireless: null, capsule: null }];
    output(JSON.stringify(data));
  };
  const result = await scenario(['1', '1', '', 'SIM'], registry);
  assert.match(result.text, /alterado ou removido/);
  assert.equal(writes, 0);
  const empty = await scenario(['0'], async (args, { output }) => output('[]'));
  assert.match(empty.text, /Nenhum registro encontrado/);
});

test('remoção de referência e sessão inexistente impedem gravação', async () => {
  for (const missing of ['sessao', 'equipamento']) {
    let equipmentReads = 0, writes = 0;
    const registry = async (args, { output }) => {
      if (args[1] === 'propor-revisado') { writes++; return; }
      let records;
      if (args[0] === 'sessao') records = missing === 'sessao' ? [] : [{ id: 1, name: 'Ensaio' }];
      else if (args[0] === 'pessoa') records = [{ id: 1, name: 'Pessoa' }];
      else records = ++equipmentReads > 1 && missing === 'equipamento' ? [] :
        [{ id: 1, name: 'Mic', kind: 'microfone', color: null, model: null, wireless: null, capsule: null }];
      output(JSON.stringify(records));
    };
    const result = await scenario(['1', '1', '', 'SIM'], registry);
    assert.match(result.text, /alterado ou removido/);
    assert.equal(writes, 0);
  }
});

test('cadastro aberto pelo seletor retorna sem criar vínculo implícito', async () => {
  const calls = [];
  const registry = async (args, { output }) => {
    calls.push(args);
    if (args[1] === 'listar') output('[]');
    else output('{}');
  };
  const result = await scenario(['n', 'Pessoa', 'SIM', '', '0'], registry);
  assert.match(result.text, /Registro salvo/);
  assert.equal(calls.filter(args => args[1] === 'adicionar').length, 1);
  assert.equal(calls.some(args => args[1] === 'propor-revisado'), false);
});

test('mudança após recarga e antes da transação recusa proposta sem alterar dados', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-selector-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone']]) {
      await base(args, { output: () => {} });
    }
    const registry = async (args, options) => {
      if (args[1] === 'propor-revisado') {
        const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
        try { db.prepare('UPDATE people SET name = ? WHERE id = ?').run('Alterada', 1); } finally { db.close(); }
      }
      return base(args, options);
    };
    const result = await scenario(['1', '1', '3', 'SIM', ''], registry);
    assert.match(result.text, /Referência alterada ou removida/);
    const output = [];
    await base(['vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('proposta revisada recusa tokens inválidos e alterações de sessão ou equipamento', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-revisions-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone']]) {
      await registry(args, { output: () => {} });
    }
    const items = {};
    for (const kind of ['sessao', 'pessoa', 'equipamento']) {
      const output = [];
      await registry([kind, 'listar'], { output: value => output.push(value) });
      items[kind] = JSON.parse(output[0])[0];
    }
    const revisions = ['sessao', 'pessoa', 'equipamento'].map(kind => soundcheckRevision(kind, items[kind]));
    const args = ['vinculo', 'propor-revisado', '1', '1', '1', 'desconhecido', ...revisions];
    await assert.rejects(registry([...args.slice(0, -1), 'inválida'], { output: () => {} }), /Revisões das referências inválidas/);
    const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
    try {
      db.prepare('UPDATE sessions SET name=? WHERE id=1').run('Outra');
      await assert.rejects(registry(args, { output: () => {} }), /Referência alterada/);
      db.prepare('UPDATE sessions SET name=? WHERE id=1').run('Ensaio');
      db.prepare('UPDATE equipment SET color=? WHERE id=1').run('azul');
      await assert.rejects(registry(args, { output: () => {} }), /Referência alterada/);
    } finally { db.close(); }
    const output = [];
    await registry(['vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
