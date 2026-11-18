import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { createRegistrySchema, openRegistry } from '../src/registry.js';
import { createBackup, restoreBackup } from '../src/backup.js';
import { runRegistryCommand } from '../src/registry-cli.js';
import { createServiceCommandFlow } from '../src/service-command-flow.js';

test('equipes habituais e formação efetiva persistem por sessão, com integridade e backup', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'team-session-'));
  const file = path.join(dir, 'cadastros.sqlite');
  const legacy = new DatabaseSync(file);
  createRegistrySchema(legacy, { version: 6 });
  legacy.prepare('INSERT INTO people(id,name) VALUES(?,?)').run(1, 'Ana');
  legacy.close();
  let registry = openRegistry(file);
  try {
    const team = registry.addTeam('Louvor');
    const voice = registry.addRole('Voz');
    const guitar = registry.addRole('Violão');
    const director = registry.addRole('Dirigente');
    const session = registry.createSession('Culto');
    const second = registry.createSession('Ensaio');
    const another = registry.addPerson('Bia');
    registry.addTeamMember({ teamId: team.id, personId: 1 });
    registry.addTeamMemberRole({ teamId: team.id, personId: 1, roleId: voice.id });
    assert.throws(() => registry.addTeamMember({ teamId: team.id, personId: 1 }), /UNIQUE/);
    assert.throws(() => registry.addTeamMember({ teamId: team.id, personId: 9999 }), /FOREIGN KEY/);
    registry.addSessionTeam({ sessionId: session.id, teamId: team.id });
    assert.throws(() => registry.addSessionMember({ sessionId: session.id, teamId: team.id, personId: another.id }), /FOREIGN KEY/);
    assert.throws(() => registry.addSessionMember({ sessionId: second.id, teamId: team.id, personId: 1 }), /FOREIGN KEY/);
    registry.addSessionMember({ sessionId: session.id, teamId: team.id, personId: 1 });
    registry.addSessionRole({ sessionId: session.id, teamId: team.id, personId: 1, roleId: guitar.id });
    registry.addSessionRole({ sessionId: session.id, teamId: team.id, personId: 1, roleId: director.id });
    assert.throws(() => registry.addSessionRole({ sessionId: session.id, teamId: team.id, personId: 1, roleId: guitar.id }), /UNIQUE/);
    assert.throws(() => registry.removeSessionTeam({ sessionId: session.id, teamId: team.id }), /FOREIGN KEY/);
    assert.throws(() => registry.removeTeamMember({ teamId: team.id, personId: 1 }), /FOREIGN KEY/);
    assert.deepEqual(registry.listTeamMembers(team.id)[0].roles.map(role => role.name), ['Voz']);
    assert.deepEqual(registry.listSessionFormation(session.id)[0].members[0].roles.map(role => role.name), ['Violão', 'Dirigente']);
    assert.deepEqual(registry.listSessionFormation(second.id), []);
    registry.addSessionTeam({ sessionId: second.id, teamId: team.id });
    registry.addSessionMember({ sessionId: second.id, teamId: team.id, personId: 1 });
    assert.deepEqual(registry.listSessionFormation(second.id)[0].members[0].roles, []);
    registry.close();
    registry = openRegistry(file);
    assert.equal(registry.listSessionFormation(session.id)[0].members[0].name, 'Ana');
    const backup = path.join(dir, 'backup.json'), restored = path.join(dir, 'restored');
    await createBackup({ directory: dir, destination: backup });
    await restoreBackup({ directory: restored, source: backup });
    const copy = openRegistry(path.join(restored, 'cadastros.sqlite'));
    try { assert.deepEqual(copy.listSessionFormation(session.id), registry.listSessionFormation(session.id)); }
    finally { copy.close(); }
    registry.removeSessionRole({ sessionId: session.id, teamId: team.id, personId: 1, roleId: guitar.id });
    assert.throws(() => registry.removeSessionMember({ sessionId: session.id, teamId: team.id, personId: 1 }), /FOREIGN KEY/);
    registry.removeSessionRole({ sessionId: session.id, teamId: team.id, personId: 1, roleId: director.id });
    assert.equal(registry.removeSessionMember({ sessionId: session.id, teamId: team.id, personId: 1 }), true);
  } finally { registry.close(); await rm(dir, { recursive: true, force: true }); }
});

test('terminal expõe cadastros e passagem mostra formação sem atribuir identidade à entrada', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'team-cli-'));
  const run = async (...args) => {
    const lines = []; await runRegistryCommand(args, { directory, output: line => lines.push(line) }); return JSON.parse(lines.at(-1));
  };
  try {
    const person = await run('pessoa', 'adicionar', 'Ana');
    const group = await run('grupo', 'adicionar', 'Coral');
    const role = await run('papel', 'adicionar', 'Soprano');
    const session = await run('sessao', 'criar', 'Culto');
    await run('grupo-integrante', 'adicionar', `${group.id}`, `${person.id}`);
    await run('grupo-funcao', 'adicionar', `${group.id}`, `${person.id}`, `${role.id}`);
    await run('sessao-grupo', 'adicionar', `${session.id}`, `${group.id}`);
    await run('sessao-integrante', 'adicionar', `${session.id}`, `${group.id}`, `${person.id}`);
    await run('sessao-papel', 'adicionar', `${session.id}`, `${group.id}`, `${person.id}`, `${role.id}`);
    assert.deepEqual((await run('formacao', 'mostrar', `${session.id}`))[0].members[0].roles[0].name, 'Soprano');
    assert.equal((await run('passagem', 'mostrar', `${session.id}`)).formacao[0].members[0].name, 'Ana');
    assert.equal((await run('grupo-integrante', 'listar', `${group.id}`))[0].roles[0].name, 'Soprano');
    await assert.rejects(run('sessao-papel', 'adicionar', `${session.id}`, `${group.id}`, `${person.id}`, `${role.id}`));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('mudança concorrente da formação invalida proposta sem atribuir falante nem permissões ao papel', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'team-flow-'));
  const file = path.join(dir, 'cadastros.sqlite');
  const registry = openRegistry(file), other = openRegistry(file);
  try {
    const person = registry.addPerson('Ana'), team = registry.addTeam('Grupo'), role = registry.addRole('Dirigente');
    const source = registry.addEquipment({ name: 'Mic', kind: 'microfone' }), session = registry.createSession('Sessão');
    const assignment = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: source.id, channel: 1 });
    registry.confirmAssignment(assignment.id);
    registry.addTeamMember({ teamId: team.id, personId: person.id });
    registry.addSessionTeam({ sessionId: session.id, teamId: team.id });
    registry.addSessionMember({ sessionId: session.id, teamId: team.id, personId: person.id });
    const binding = registry.bindInputSource({ sessionId: session.id, inputId: 'principal', assignmentId: assignment.id });
    const getInputContext = inputId => ({ ...binding, inputId, formation: registry.listSessionFormation(session.id) });
    let sent = 0;
    const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: () => { sent++; }, getInputContext,
      modeConfig: { passageInputs: ['principal'], masterInputId: null } });
    assert.equal((await flow.process({ text: 'mesa, mute canal 3' })).status, 'blocked');
    flow.setMode('passage');
    const first = await flow.process({ text: 'mesa, mute canal 3' });
    assert.equal(first.status, 'proposal');
    assert.equal(Object.hasOwn(first.sourceContext, 'speaker'), false);
    other.addSessionRole({ sessionId: session.id, teamId: team.id, personId: person.id, roleId: role.id });
    assert.equal(flow.confirm({ id: first.id }).status, 'denied');
    assert.equal(sent, 0);
    const second = await flow.process({ text: 'mesa, mute canal 3' });
    assert.equal(flow.confirm({ id: second.id }).status, 'sent');
    assert.equal(sent, 1);
    const stale = { ...binding, formation: [] };
    assert.throws(() => registry.createVoiceProposal({ sessionId: session.id, origin: 'principal', phrase: 'teste', authorized: true,
      expectedBinding: stale }), /Formação/);
    assert.equal(registry.listVoiceProposals(session.id).length, 0);
  } finally { registry.close(); other.close(); await rm(dir, { recursive: true, force: true }); }
});
