import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openRegistry, registryContentRevision } from '../src/registry.js';
import { runRegistryCommand } from '../src/registry-cli.js';
import { soundcheckRevision } from '../src/soundcheck-review.js';

test('criação revisada de retorno recusa referências antigas e mantém inserção transacional', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-monitor-reviewed-create-'));
  const filename = path.join(directory, 'cadastros.sqlite');
  const first = openRegistry(filename);
  const second = openRegistry(filename);
  const raw = new DatabaseSync(filename);
  try {
    first.setAuxConfig(8);
    const session = first.createSession('Ensaio');
    const config = first.getAuxConfig();
    const sessionRevision = soundcheckRevision('sessao', session);
    const configRevision = registryContentRevision('aux-config', config);
    raw.prepare('UPDATE sessions SET name=? WHERE id=?').run('Ensaio atualizado', session.id);
    assert.throws(() => first.addMonitorReturnReviewed({ sessionId: session.id, aux: 1, expectedSessionRevision: sessionRevision, expectedConfigRevision: configRevision }), /alterado desde a revisão/);
    assert.equal(first.listMonitorReturns(session.id).length, 0);
    const updatedSession = first.listSessions()[0];
    raw.prepare('UPDATE monitor_config SET aux_count=? WHERE id=1').run(6);
    assert.throws(() => first.addMonitorReturnReviewed({ sessionId: session.id, aux: 1,
      expectedSessionRevision: soundcheckRevision('sessao', updatedSession), expectedConfigRevision: configRevision }), /alterado desde a revisão/);
    assert.equal(first.listMonitorReturns(session.id).length, 0);
    const currentConfig = first.getAuxConfig();
    assert.equal(first.addMonitorReturnReviewed({ sessionId: session.id, aux: 1,
      expectedSessionRevision: soundcheckRevision('sessao', updatedSession), expectedConfigRevision: registryContentRevision('aux-config', currentConfig) }).aux, 1);
    assert.throws(() => first.addMonitorReturnReviewed({ sessionId: session.id, aux: 7,
      expectedSessionRevision: soundcheckRevision('sessao', updatedSession), expectedConfigRevision: registryContentRevision('aux-config', currentConfig) }), /excede/);
    assert.equal(first.listMonitorReturns(session.id).length, 1);
    assert.throws(() => first.addMonitorReturnReviewed({ sessionId: 999, aux: 1,
      expectedSessionRevision: soundcheckRevision('sessao', updatedSession), expectedConfigRevision: registryContentRevision('aux-config', currentConfig) }), /Sessão não encontrada/);
  } finally { raw.close(); second.close(); first.close(); await rm(directory, { recursive: true, force: true }); }
});

test('criação revisada recusa remoção de sessão sem gravar retorno', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-monitor-reviewed-session-delete-'));
  const filename = path.join(directory, 'cadastros.sqlite');
  const registry = openRegistry(filename);
  const raw = new DatabaseSync(filename);
  try {
    registry.setAuxConfig(8);
    const session = registry.createSession('Ensaio');
    const expectedSessionRevision = soundcheckRevision('sessao', session);
    const expectedConfigRevision = registryContentRevision('aux-config', registry.getAuxConfig());
    raw.prepare('DELETE FROM sessions WHERE id=?').run(session.id);
    assert.throws(() => registry.addMonitorReturnReviewed({ sessionId: session.id, aux: 1, expectedSessionRevision, expectedConfigRevision }), /Sessão não encontrada/);
    assert.equal(registry.listMonitorReturns(session.id).length, 0);
    assert.equal(registry.listSessions().length, 0);
  } finally { raw.close(); registry.close(); await rm(directory, { recursive: true, force: true }); }
});

test('proposta revisada confere sessão, pessoa, AUX e contagem exibida; legado continua disponível', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-monitor-reviewed-proposal-'));
  const filename = path.join(directory, 'cadastros.sqlite');
  const first = openRegistry(filename);
  const second = openRegistry(filename);
  const raw = new DatabaseSync(filename);
  try {
    first.setAuxConfig(8);
    const session = first.createSession('Ensaio');
    const person = first.addPerson('Ana');
    const otherPerson = first.addPerson('Bia');
    const monitorReturn = first.addMonitorReturn({ sessionId: session.id, aux: 1 });
    const sessionRevision = soundcheckRevision('sessao', session);
    const personRevision = soundcheckRevision('pessoa', person);
    const monitorRevision = registryContentRevision('retorno-cadastro', first.listMonitorReturns(session.id)[0]);
    raw.prepare('UPDATE people SET name=? WHERE id=?').run('Ana atualizada', person.id);
    assert.throws(() => first.proposeMonitorAssignmentReviewed({ sessionId: session.id, personId: person.id, returnId: monitorReturn.id,
      expectedSessionRevision: sessionRevision, expectedPersonRevision: personRevision, expectedReturnRevision: monitorRevision }), /alterado desde a revisão/);
    assert.equal(first.listMonitorAssignments(session.id).length, 0);
    const currentPerson = first.listPeople().find(item => item.id === person.id);
    const currentReturn = first.listMonitorReturns(session.id)[0];
    const currentReturnRevision = registryContentRevision('retorno-cadastro', currentReturn);
    const otherProposal = second.proposeMonitorAssignment({ sessionId: session.id, personId: otherPerson.id, returnId: monitorReturn.id });
    second.confirmMonitorAssignment(otherProposal.id);
    assert.throws(() => first.proposeMonitorAssignmentReviewed({ sessionId: session.id, personId: person.id, returnId: monitorReturn.id,
      expectedSessionRevision: sessionRevision, expectedPersonRevision: soundcheckRevision('pessoa', currentPerson), expectedReturnRevision: currentReturnRevision }), /alterado desde a revisão/);
    assert.equal(first.listMonitorAssignments(session.id).length, 1);
    const latestReturn = first.listMonitorReturns(session.id)[0];
    const proposal = first.proposeMonitorAssignmentReviewed({ sessionId: session.id, personId: person.id, returnId: monitorReturn.id,
      expectedSessionRevision: sessionRevision, expectedPersonRevision: soundcheckRevision('pessoa', currentPerson),
      expectedReturnRevision: registryContentRevision('retorno-cadastro', latestReturn) });
    assert.equal(proposal.status, 'proposto');
    assert.equal(first.proposeMonitorAssignmentReviewed({ sessionId: session.id, personId: person.id, returnId: monitorReturn.id,
      expectedSessionRevision: sessionRevision, expectedPersonRevision: soundcheckRevision('pessoa', currentPerson),
      expectedReturnRevision: registryContentRevision('retorno-cadastro', latestReturn) }).status, 'proposto');
    const otherSession = first.createSession('Outra sessão');
    const otherReturn = first.addMonitorReturn({ sessionId: otherSession.id, aux: 2 });
    assert.throws(() => first.proposeMonitorAssignmentReviewed({ sessionId: session.id, personId: person.id, returnId: otherReturn.id,
      expectedSessionRevision: sessionRevision, expectedPersonRevision: soundcheckRevision('pessoa', currentPerson),
      expectedReturnRevision: registryContentRevision('retorno-cadastro', first.listMonitorReturns(otherSession.id)[0]) }), /Retorno não encontrado nesta sessão/);
    first.close();
    const reopened = openRegistry(filename);
    try {
      assert.equal(reopened.listMonitorAssignments(session.id).find(item => item.id === proposal.id).status, 'proposto');
      assert.equal(reopened.proposeMonitorAssignment({ sessionId: otherSession.id, personId: person.id, returnId: otherReturn.id }).status, 'proposto');
    } finally { reopened.close(); }
  } finally { raw.close(); second.close(); try { first.close(); } catch { /* closed before persistence verification */ } await rm(directory, { recursive: true, force: true }); }
});

test('proposta revisada recusa remoção de pessoa ou AUX e alteração de sessão ou AUX sem inserção parcial', async () => {
  const cases = [
    { name: 'remoção de pessoa', mutate: (db, records) => db.prepare('DELETE FROM people WHERE id=?').run(records.person.id) },
    { name: 'remoção de retorno', mutate: (db, records) => db.prepare('DELETE FROM monitor_returns WHERE id=?').run(records.monitorReturn.id) },
    { name: 'alteração de retorno', mutate: (db, records) => db.prepare('UPDATE monitor_returns SET aux=2 WHERE id=?').run(records.monitorReturn.id) },
    { name: 'alteração de sessão', mutate: (db, records) => db.prepare('UPDATE sessions SET name=? WHERE id=?').run('Ensaio revisado', records.session.id) },
  ];
  for (const scenario of cases) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-monitor-reviewed-proposal-stale-'));
    const filename = path.join(directory, 'cadastros.sqlite');
    const registry = openRegistry(filename);
    const raw = new DatabaseSync(filename);
    try {
      registry.setAuxConfig(8);
      const session = registry.createSession('Ensaio');
      const person = registry.addPerson('Ana');
      const monitorReturn = registry.addMonitorReturn({ sessionId: session.id, aux: 1 });
      const expectedSessionRevision = soundcheckRevision('sessao', session);
      const expectedPersonRevision = soundcheckRevision('pessoa', person);
      const expectedReturnRevision = registryContentRevision('retorno-cadastro', registry.listMonitorReturns(session.id)[0]);
      scenario.mutate(raw, { session, person, monitorReturn });
      assert.throws(() => registry.proposeMonitorAssignmentReviewed({ sessionId: session.id, personId: person.id, returnId: monitorReturn.id,
        expectedSessionRevision, expectedPersonRevision, expectedReturnRevision }), /alterado desde a revisão|Pessoa não encontrada|Retorno não encontrado nesta sessão/, scenario.name);
      assert.equal(registry.listMonitorAssignments(session.id).length, 0, scenario.name);
      if (scenario.name === 'alteração de sessão') assert.equal(registry.listSessions()[0].name, 'Ensaio revisado');
      if (scenario.name === 'alteração de retorno') assert.equal(registry.listMonitorReturns(session.id)[0].aux, 2);
      if (scenario.name === 'remoção de pessoa') assert.equal(registry.listPeople().length, 0);
      if (scenario.name === 'remoção de retorno') assert.equal(registry.listMonitorReturns(session.id).length, 0);
    } finally { raw.close(); registry.close(); await rm(directory, { recursive: true, force: true }); }
  }
});

test('CLI mantém comandos antigos e oferece variantes revisadas persistentes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-monitor-reviewed-cli-'));
  const call = async (...args) => {
    const lines = [];
    await runRegistryCommand(args, { directory, output: line => lines.push(line) });
    return JSON.parse(lines.at(-1));
  };
  try {
    await call('aux-config', 'definir', '8');
    const session = await call('sessao', 'criar', 'Ensaio');
    const person = await call('pessoa', 'adicionar', 'Ana');
    const config = await call('aux-config', 'mostrar');
    await call('retorno', 'adicionar-revisado', String(session.id), '1', soundcheckRevision('sessao', session), registryContentRevision('aux-config', config));
    const monitorReturn = (await call('retorno', 'listar', String(session.id)))[0];
    const proposed = await call('retorno-vinculo', 'propor-revisado', String(session.id), String(person.id), String(monitorReturn.id),
      soundcheckRevision('sessao', session), soundcheckRevision('pessoa', person), registryContentRevision('retorno-cadastro', monitorReturn));
    assert.equal(proposed.status, 'proposto');
    const secondReturn = await call('retorno', 'adicionar', String(session.id), '2');
    assert.equal(secondReturn.aux, 2);
    const legacyProposal = await call('retorno-vinculo', 'propor', String(session.id), String(person.id), String(secondReturn.id));
    assert.equal(legacyProposal.status, 'proposto');
    assert.equal((await call('retorno-vinculo', 'listar', String(session.id))).length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
