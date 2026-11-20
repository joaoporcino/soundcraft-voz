import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createBackup, restoreBackup } from '../src/backup.js';
import { openRegistry } from '../src/registry.js';
import { runRegistryCommand } from '../src/registry-cli.js';
import { replaceSource } from '../src/terminal-source-correction.js';

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'replacement-references-'));
  const command = async (...args) => {
    const output = [];
    await runRegistryCommand(args, { directory, output: line => output.push(line) });
    return JSON.parse(output.find(line => line.startsWith('{') || line.startsWith('[') || line === 'true'));
  };
  try {
    await command('sessao', 'criar', 'Ensaio'); await command('sessao', 'criar', 'Outro');
    await command('pessoa', 'adicionar', 'Original'); await command('pessoa', 'adicionar', 'Escolhida');
    await command('equipamento', 'adicionar', 'Original', 'mic'); await command('equipamento', 'adicionar', 'Escolhido', 'mic');
    await command('vinculo', 'propor', '1', '1', '1', '3'); await command('vinculo', 'confirmar', '1');
    await command('entrada-fonte', 'vincular', '1', 'voz1', '1');
    const view = await command('passagem', 'mostrar', '1');
    const args = ['passagem', 'substituir-referencias-revisadas', '1', 'vinculo', '1', view.vinculos[0].revisaoSubstituicao, '2', '2', '4', view.pessoas[1].revisao, view.equipamentos[1].revisao];
    const mutate = sql => { const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite')); try { db.exec(sql); } finally { db.close(); } };
    await run({ directory, command, view, args, mutate });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('substituição revisada preserva histórico e proposta pendente no backup', async () => fixture(async ({ directory, command, args }) => {
  const result = await command(...args);
  assert.equal(result.anterior.status, 'revogado'); assert.equal(result.proposta.status, 'proposto');
  assert.equal(result.entradasDesvinculadas[0].inputId, 'voz1');
  assert.deepEqual(await command('entrada-fonte', 'listar', '1'), []);
  const view = await command('passagem', 'mostrar', '1');
  assert.equal(view.historicoVinculos[0].replacementId, result.proposta.id);
  const backup = path.join(directory, 'backup.sfv'), restoredDir = path.join(directory, 'restaurado');
  await createBackup({ directory, destination: backup });
  await restoreBackup({ directory: restoredDir, source: backup });
  const restored = openRegistry(path.join(restoredDir, 'cadastros.sqlite'));
  try {
    assert.deepEqual(restored.listAssignments(1).map(item => item.status), ['revogado', 'proposto']);
    assert.equal(restored.listRetiredAssignments(1)[0].replacementId, result.proposta.id);
    assert.deepEqual(restored.listInputSources(1), []);
  } finally { restored.close(); }
}));

for (const table of ['people', 'equipment']) for (const operation of ['alterar', 'remover']) {
  test(`${operation} ${table} em outra conexão recusa sem gravar`, async () => fixture(async ({ command, args, mutate }) => {
    mutate(operation === 'remover' ? `DELETE FROM ${table} WHERE id=2` : `UPDATE ${table} SET name='Concorrente' WHERE id=2`);
    await assert.rejects(command(...args), /Referência alterada ou removida/);
    const view = await command('passagem', 'mostrar', '1');
    assert.equal(view.vinculos.length, 1); assert.equal(view.vinculos[0].status, 'confirmado');
    assert.equal(view.vinculos[0].entradasAssociadas.length, 1); assert.equal(view.historicoVinculos.length, 0);
    assert.equal((table === 'people' ? view.pessoas : view.equipamentos).find(item => item.id === 2)?.name, operation === 'remover' ? undefined : 'Concorrente');
  }));
}

test('revisões, sessão, referências e mudança do vínculo ou entradas são validadas', async () => fixture(async ({ command, args, mutate }) => {
  for (const invalid of [args.slice(0, -1), [...args.slice(0, -1), 'inválida'], [...args.slice(0, 5), 'inválida', ...args.slice(6)], [...args.slice(0, 2), '2', ...args.slice(3)], [...args.slice(0, 6), '9999', ...args.slice(7)]]) await assert.rejects(command(...invalid));
  mutate("UPDATE assignments SET channel=5 WHERE id=1");
  await assert.rejects(command(...args), /alterada desde a revisão/);
  let view = await command('passagem', 'mostrar', '1');
  assert.equal(view.vinculos[0].channel, 5);
  args[5] = view.vinculos[0].revisaoSubstituicao;
  await command('entrada-fonte', 'vincular', '1', 'voz2', '1');
  await assert.rejects(command(...args), /alterada desde a revisão/);
  view = await command('passagem', 'mostrar', '1');
  assert.equal(view.vinculos.length, 1); assert.equal(view.vinculos[0].entradasAssociadas.length, 2); assert.equal(view.historicoVinculos.length, 0);
}));

test('falha após inserção da proposta reverte toda a transação', async () => fixture(async ({ command, args, mutate }) => {
  mutate("CREATE TRIGGER fail_retirement BEFORE INSERT ON retired_assignments BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
  await assert.rejects(command(...args), /falha simulada/);
  const view = await command('passagem', 'mostrar', '1');
  assert.equal(view.vinculos.length, 1); assert.equal(view.vinculos[0].status, 'confirmado');
  assert.equal(view.vinculos[0].entradasAssociadas.length, 1); assert.equal(view.historicoVinculos.length, 0);
}));

test('CMD cancela e recusa corrida de referência após confirmação', async () => fixture(async ({ directory, command }) => {
  let race = false, called = false;
  const registry = async (params, options = {}) => {
    if (params[1] === 'substituir-referencias-revisadas') {
      called = true;
      if (race) { const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite')); try { db.exec("UPDATE people SET name='Concorrente' WHERE id=2"); } finally { db.close(); } }
    }
    return runRegistryCommand(params, { ...options, directory });
  };
  const run = async answers => { const messages = []; await replaceSource({ session: { id: 1, name: 'Ensaio' }, record: { id: 1 }, registry, screen: () => {}, ask: async () => answers.shift() ?? null, write: text => messages.push(text) }); return messages.join('\n'); };
  assert.match(await run(['2', '2', '4', 'não']), /cancelada/); assert.equal(called, false);
  race = true; assert.match(await run(['2', '2', '4', 'SIM', '']), /Referência alterada ou removida/);
  const view = await command('passagem', 'mostrar', '1');
  assert.equal(view.pessoas[1].name, 'Concorrente'); assert.equal(view.vinculos[0].status, 'confirmado');
  assert.equal(view.vinculos[0].entradasAssociadas.length, 1);
}));
