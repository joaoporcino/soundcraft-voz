import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { runRegistryCommand } from '../src/registry-cli.js';
import { correctSource } from '../src/terminal-source-correction.js';
import { correctVoice } from '../src/terminal-voice-correction.js';

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'correction-references-'));
  const command = async (...args) => {
    const output = [];
    await runRegistryCommand(args, { directory, output: line => output.push(line) });
    const json = output.find(line => line.startsWith('{') || line.startsWith('['));
    return json && JSON.parse(json);
  };
  try {
    await command('sessao', 'criar', 'Ensaio'); await command('sessao', 'criar', 'Outro');
    await command('pessoa', 'adicionar', 'Original'); await command('pessoa', 'adicionar', 'Escolhida');
    await command('equipamento', 'adicionar', 'Original', 'mic'); await command('equipamento', 'adicionar', 'Escolhido', 'mic');
    await command('vinculo', 'propor', '1', '1', '1', '3');
    await command('voz-vinculo', 'propor', '1', 'entrada', 'frase');
    const view = await command('passagem', 'mostrar', '1');
    await run({ directory, command, view });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
function args(view, type, person = '2', equipment = '2') {
  const proposal = type === 'voz' ? view.propostasVoz[0] : view.vinculos[0];
  return ['passagem', 'corrigir-referencias-revisadas', '1', type, '1', proposal.revisao, person, equipment, '4',
    person === 'desconhecido' ? person : view.pessoas.find(p => p.id === Number(person)).revisao,
    equipment === 'desconhecido' ? equipment : view.equipamentos.find(e => e.id === Number(equipment)).revisao];
}
test('correções transacionais aceitam referências e desconhecidos de voz', async () => fixture(async ({ command, view }) => {
  assert.equal((await command(...args(view, 'vinculo'))).channel, 4);
  assert.equal((await command(...args(view, 'voz'))).personId, 2);
  let updated = await command('passagem', 'mostrar', '1');
  const voice = await command(...args(updated, 'voz', 'desconhecido', 'desconhecido'));
  assert.equal(voice.personId, null); assert.equal(voice.equipmentId, null); assert.equal(voice.status, 'proposto');
  updated = await command('passagem', 'mostrar', '1');
  assert.equal((await command(...args(updated, 'voz', '2', 'desconhecido'))).personId, 2);
}));
for (const type of ['vinculo', 'voz']) for (const [entity, operation] of [['people', 'alterar'], ['people', 'remover'], ['equipment', 'alterar'], ['equipment', 'remover']]) {
  test(`${type}: ${operation} ${entity} por outra conexão recusa sem escrita`, async () => fixture(async ({ directory, command, view }) => {
    const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
    try { db.exec(operation === 'remover' ? `DELETE FROM ${entity} WHERE id=2` : `UPDATE ${entity} SET name='Concorrente' WHERE id=2`); } finally { db.close(); }
    await assert.rejects(command(...args(view, type)), /Referência alterada ou removida/);
    const after = await command('passagem', 'mostrar', '1');
    const proposal = type === 'voz' ? after.propostasVoz[0] : after.vinculos[0];
    assert.equal(proposal.revisao, (type === 'voz' ? view.propostasVoz[0] : view.vinculos[0]).revisao);
    const refs = entity === 'people' ? after.pessoas : after.equipamentos;
    assert.equal(refs.find(item => item.id === 2)?.name, operation === 'remover' ? undefined : 'Concorrente');
  }));
}
test('sessão, revisão ausente ou inválida e proposta alterada são recusadas', async () => fixture(async ({ command, view }) => {
  const base = args(view, 'vinculo');
  for (const modified of [base.slice(0, -1), [...base.slice(0, -1), 'invalida'], [...base.slice(0, 5), 'invalida', ...base.slice(6)], [...base.slice(0, 2), '2', ...base.slice(3)]]) {
    await assert.rejects(command(...modified));
  }
  await command('passagem', 'corrigir', '1', 'vinculo', '1', '1', '1', '5');
  await assert.rejects(command(...base), /alterada desde a revisão/);
  assert.equal((await command('passagem', 'mostrar', '1')).vinculos[0].channel, 5);
}));
for (const type of ['vinculo', 'voz']) test(`CMD ${type}: cancelamento e corrida na gravação atualizam resultado`, async () => fixture(async ({ directory, command }) => {
  let race = false, called = false;
  const registry = async (params, options = {}) => {
    if (params[1] === 'corrigir-referencias-revisadas') {
      called = true;
      if (race) { const db = new DatabaseSync(path.join(directory, 'cadastros.sqlite')); try { db.exec("UPDATE people SET name='Concorrente' WHERE id=2"); } finally { db.close(); } }
    }
    return runRegistryCommand(params, { ...options, directory });
  };
  const run = async answers => { const messages = []; await (type === 'voz' ? correctVoice : correctSource)({ session: { id: 1, name: 'Ensaio' }, record: { id: 1 }, registry,
    screen: () => {}, ask: async () => answers.shift() ?? null, write: text => messages.push(text) }); return messages.join('\n'); };
  assert.match(await run(['2', '2', '4', 'não']), /cancelada/); assert.equal(called, false);
  race = true;
  assert.match(await run(['2', '2', '4', 'SIM', '']), /Referência alterada ou removida/);
  const after = await command('passagem', 'mostrar', '1');
  assert.equal(after.pessoas.find(p => p.id === 2).name, 'Concorrente');
  assert.equal((type === 'voz' ? after.propostasVoz[0] : after.vinculos[0]).channel, type === 'voz' ? null : 3);
}));
