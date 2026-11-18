import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBackup, restoreBackup } from '../src/backup.js';
import { createRegistrySchema, openRegistry } from '../src/registry.js';
import { runRegistryCommand } from '../src/registry-cli.js';

test('passagem corrige cadastro e substitui vínculo confirmado com histórico e restauração', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'soundcheck-corrections-'));
  const directory = path.join(root, 'active'), restoredDir = path.join(root, 'restored'), backup = path.join(root, 'data.sfv');
  const command = async (...args) => {
    const lines = [];
    await runRegistryCommand(args, { directory, output: text => lines.push(text) });
    return JSON.parse(lines.find(text => text.startsWith('{') || text.startsWith('[') || text === 'true' || text === 'false'));
  };
  try {
    const person = await command('pessoa', 'adicionar', 'Ana errada');
    const mic = await command('equipamento', 'adicionar', 'Mic', 'microfone', 'amarelo');
    const session = await command('sessao', 'criar', 'Ensaio');
    const s = `${session.id}`;
    const initial = await command('vinculo', 'propor', s, `${person.id}`, `${mic.id}`, '7');
    await command('vinculo', 'confirmar', `${initial.id}`);
    await command('entrada-fonte', 'vincular', s, 'voz1', `${initial.id}`);
    let view = await command('passagem', 'mostrar', s);
    assert.match(view.aviso, /cadastros globais.*outras sessões/);
    assert.match(view.orientacao.join(' '), /cadastro global.*outras sessões/);
    assert.equal(view.vinculos[0].entradasAssociadas[0].inputId, 'voz1');
    const oldPersonRevision = view.pessoas[0].revisao;
    await command('passagem', 'corrigir', s, 'pessoa', `${person.id}`, oldPersonRevision, 'Ana');
    await assert.rejects(command('passagem', 'corrigir', s, 'pessoa', `${person.id}`, oldPersonRevision, 'Outro'), /alterada desde a revisão/);
    await command('passagem', 'corrigir', s, 'equipamento', `${mic.id}`, view.equipamentos[0].revisao,
      'Mic corrigido', 'microfone', 'azul', 'sim', 'dinamico', 'desconhecido');
    view = await command('passagem', 'mostrar', s);
    assert.equal(view.historicoCadastros.length, 2);
    assert.equal(view.historicoCadastros[0].before.name, 'Ana errada');
    assert.equal(view.equipamentos[0].wireless, true);
    let revision = view.vinculos[0].revisaoSubstituicao;
    await command('entrada-fonte', 'vincular', s, 'voz2', `${initial.id}`);
    await assert.rejects(command('passagem', 'substituir', s, 'vinculo', `${initial.id}`, revision, `${person.id}`, `${mic.id}`, '8'), /alterada desde a revisão/);
    assert.equal((await command('entrada-fonte', 'listar', s)).length, 2, 'revisão concorrente não deve remover entradas');
    await command('entrada-fonte', 'remover', s, 'voz2');
    view = await command('passagem', 'mostrar', s);
    revision = view.vinculos[0].revisaoSubstituicao;
    await assert.rejects(command('passagem', 'substituir', s, 'vinculo', `${initial.id}`, revision, `${person.id}`, '9999', '8'));
    assert.equal((await command('entrada-fonte', 'listar', s)).length, 1, 'erro deve fazer rollback de toda substituição');
    const result = await command('passagem', 'substituir', s, 'vinculo', `${initial.id}`, revision, `${person.id}`, `${mic.id}`, '8');
    assert.equal(result.anterior.status, 'revogado');
    assert.equal(result.proposta.status, 'proposto');
    assert.equal(result.entradasDesvinculadas[0].inputId, 'voz1');
    assert.deepEqual(await command('entrada-fonte', 'listar', s), []);
    await assert.rejects(command('passagem', 'substituir', s, 'vinculo', `${initial.id}`, revision, `${person.id}`, `${mic.id}`, '9'), /confirmado não encontrado/);
    await assert.rejects(command('vinculo', 'confirmar', `${initial.id}`), /retirado/);
    view = await command('passagem', 'mostrar', s);
    assert.equal(view.historicoVinculos[0].replacementId, result.proposta.id);
    assert.equal((await command('passagem', 'confirmar', s, 'vinculo', `${result.proposta.id}`, view.vinculos.find(item => item.id === result.proposta.id).revisao)).status, 'confirmado');
    await command('entrada-fonte', 'vincular', s, 'voz1', `${result.proposta.id}`);
    await createBackup({ directory, destination: backup });
    await restoreBackup({ directory: restoredDir, source: backup });
    const restored = openRegistry(path.join(restoredDir, 'cadastros.sqlite'));
    try {
      assert.equal(restored.listRegistryCorrections().length, 2);
      assert.equal(restored.listRetiredAssignments(session.id)[0].inputs[0].inputId, 'voz1');
      assert.equal(restored.listInputSources(session.id)[0].assignmentId, result.proposta.id);
      assert.deepEqual(restored.listAssignments(session.id).map(item => item.status), ['revogado', 'confirmado']);
    } finally { restored.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('migra banco v5 preservando vínculos e rejeita revisão desatualizada em outra conexão', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcheck-migrate-'));
  const filename = path.join(directory, 'cadastros.sqlite');
  try {
    const legacy = new DatabaseSync(filename);
    createRegistrySchema(legacy, { version: 5 });
    legacy.exec("INSERT INTO people(name) VALUES('Ana'); INSERT INTO equipment(name,kind) VALUES('Mic','microfone'); INSERT INTO sessions(name) VALUES('Sessão'); INSERT INTO assignments(session_id,person_id,equipment_id,channel,status) VALUES(1,1,1,2,'confirmado')");
    legacy.close();
    const first = openRegistry(filename), second = openRegistry(filename);
    try {
      const { soundcheckRevision } = await import('../src/soundcheck-review.js');
      const old = first.listPeople()[0], token = soundcheckRevision('pessoa', old);
      second.correctPerson(old.id, { name: 'Outro operador', expectedRevision: token });
      assert.throws(() => first.correctPerson(old.id, { name: 'Substituição antiga', expectedRevision: token }), /alterada desde a revisão/);
      assert.equal(first.listPeople()[0].name, 'Outro operador');
      assert.equal(first.listRegistryCorrections().length, 1);
      assert.equal(first.listAssignments(1)[0].status, 'confirmado');
    } finally { first.close(); second.close(); }
    const check = new DatabaseSync(filename);
    try { assert.equal(check.prepare('PRAGMA user_version').get().user_version, 7); } finally { check.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
