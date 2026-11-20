import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { runRegistryCommand } from '../src/registry-cli.js';
import { openRegistry } from '../src/registry.js';
import { teamSessionRevision } from '../src/team-session-review.js';
import { soundcheckRevision } from '../src/soundcheck-review.js';
import { addTeamMember, changeTeamRole, removeTeamMember } from '../src/terminal-team-members.js';
import { changeSessionMember, changeSessionRole, changeSessionTeam } from '../src/terminal-session-teams.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'team-reviewed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const run = async (...args) => {
    const output = [];
    await runRegistryCommand(args, { directory, output: value => output.push(value) });
    return output.length ? JSON.parse(output.at(-1)) : undefined;
  };
  const group = await run('grupo', 'adicionar', 'Louvor');
  const person = await run('pessoa', 'adicionar', 'Ana');
  const role = await run('papel', 'adicionar', 'Voz');
  const session = await run('sessao', 'criar', 'Culto');
  return { directory, run, group, person, role, session };
}

async function paired(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'team-race-'));
  const file = path.join(directory, 'cadastros.sqlite');
  const first = openRegistry(file), second = openRegistry(file);
  t.after(() => { first.close(); second.close(); });
  t.after(() => rm(directory, { recursive: true, force: true }));
  const group = first.addTeam('Grupo A'), otherGroup = first.addTeam('Grupo B');
  const person = first.addPerson('Ana'), otherPerson = first.addPerson('Bia');
  const role = first.addRole('Voz'), otherRole = first.addRole('Violão');
  const session = first.createSession('Sessão A'), otherSession = first.createSession('Sessão B');
  return { first, second, group, otherGroup, person, otherPerson, role, otherRole, session, otherSession };
}

function ui({ directory, answers }) {
  const writes = [], screens = [];
  let index = 0;
  const ask = async () => {
    assert.ok(index < answers.length, `faltou resposta ${index + 1}`);
    return answers[index++];
  };
  const screen = (...args) => screens.push(args);
  return { registry: async (args, options) => runRegistryCommand(args, { directory, output: options.output }),
    ask, screen, write: value => writes.push(value), writes, screens, finish: () => assert.equal(index, answers.length) };
}

test('as dez variantes revisadas são exercitadas pelo CMD em uma formação completa', async t => {
  const { directory, run, group, session } = await fixture(t);
  const invoke = async (fn, args, answers) => {
    const harness = ui({ directory, answers });
    await fn({ ...args, ...harness });
    harness.finish();
    return harness;
  };
  let member;
  await invoke(addTeamMember, { team: group }, ['1', 'SIM', '']);
  member = (await run('grupo-integrante', 'listar', String(group.id)))[0];
  await invoke(changeTeamRole, { team: group, member, action: 'adicionar' }, ['1', 'SIM', '']);
  member = (await run('grupo-integrante', 'listar', String(group.id)))[0];
  assert.equal(member.roles[0].name, 'Voz');
  await invoke(changeSessionTeam, { session, team: group, action: 'adicionar' }, ['1', 'SIM', '']);
  let team = (await run('formacao', 'mostrar', String(session.id)))[0];
  await invoke(changeSessionMember, { session, team, action: 'adicionar' }, ['1', 'SIM', '']);
  team = (await run('formacao', 'mostrar', String(session.id)))[0];
  await invoke(changeSessionRole, { session, team, action: 'adicionar' }, ['1', '1', 'SIM', '']);
  team = (await run('formacao', 'mostrar', String(session.id)))[0];
  await invoke(changeSessionRole, { session, team, action: 'remover' }, ['1', '1', 'SIM', '']);
  team = (await run('formacao', 'mostrar', String(session.id)))[0];
  await invoke(changeSessionMember, { session, team, action: 'remover' }, ['1', 'SIM', '']);
  team = (await run('formacao', 'mostrar', String(session.id)))[0];
  await invoke(changeSessionTeam, { session, team, action: 'remover' }, ['SIM', '']);
  member = (await run('grupo-integrante', 'listar', String(group.id)))[0];
  await invoke(changeTeamRole, { team: group, member, action: 'remover' }, ['1', 'SIM', '']);
  member = (await run('grupo-integrante', 'listar', String(group.id)))[0];
  await invoke(removeTeamMember, { team: group, member }, ['SIM', '']);
  assert.deepEqual(await run('grupo-integrante', 'listar', String(group.id)), []);
  assert.deepEqual(await run('formacao', 'mostrar', String(session.id)), []);
});

test('revisões transacionais recusam alteração e revisão inválida sem gravar', async t => {
  const { directory, group, person } = await fixture(t);
  const first = openRegistry(path.join(directory, 'cadastros.sqlite'));
  const second = openRegistry(path.join(directory, 'cadastros.sqlite'));
  try {
    const context = { team: group, person };
    const revision = teamSessionRevision('team-member:add', context);
    second.correctPerson(person.id, { name: 'Ana Maria', expectedRevision: soundcheckRevision('pessoa', person) });
    assert.throws(() => first.addTeamMemberReviewed({ teamId: group.id, personId: person.id, expectedRevision: 'bad' }), /revisão|alterad/i);
    assert.throws(() => first.addTeamMemberReviewed({ teamId: group.id, personId: person.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listTeamMembers(group.id), []);
    assert.throws(() => first.removeTeamMemberReviewed({ teamId: group.id, personId: person.id, expectedRevision: revision }), /não encontrado/i);
  } finally { first.close(); second.close(); }
});

test('cada família revisada recusa estado concorrente de outra conexão sem gravação parcial', async t => {
  await t.test('integrante do grupo: referência alterada antes da inclusão', async t => {
    const { first, second, group, person } = await paired(t);
    const revision = teamSessionRevision('team-member:add', { team: group, person });
    second.correctPerson(person.id, { name: 'Ana Silva', expectedRevision: soundcheckRevision('pessoa', person) });
    assert.throws(() => first.addTeamMemberReviewed({ teamId: group.id, personId: person.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listTeamMembers(group.id), []);
  });
  await t.test('integrante do grupo: função adicionada por outra conexão invalida remoção', async t2 => {
    const { first, second, group, person, role } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    const member = first.listTeamMembers(group.id)[0];
    const revision = teamSessionRevision('team-member:remove', { team: group, member });
    second.addTeamMemberRole({ teamId: group.id, personId: person.id, roleId: role.id });
    assert.throws(() => first.removeTeamMemberReviewed({ teamId: group.id, personId: person.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(JSON.parse(JSON.stringify(first.listTeamMembers(group.id)[0].roles)), [{ id: role.id, name: role.name }]);
  });
  await t.test('função habitual: inclusão concorrente invalida token e mantém a relação concorrente', async t2 => {
    const { first, second, group, person, role, otherRole } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    const member = first.listTeamMembers(group.id)[0];
    const revision = teamSessionRevision('team-role:add', { team: group, member, role });
    second.addTeamMemberRole({ teamId: group.id, personId: person.id, roleId: otherRole.id });
    assert.throws(() => first.addTeamMemberRoleReviewed({ teamId: group.id, personId: person.id, roleId: role.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listTeamMembers(group.id)[0].roles.map(item => item.id), [otherRole.id]);
  });
  await t.test('função habitual: remoção concorrente é recusada sem reinserção', async t2 => {
    const { first, second, group, person, role } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    first.addTeamMemberRole({ teamId: group.id, personId: person.id, roleId: role.id });
    const member = first.listTeamMembers(group.id)[0];
    const revision = teamSessionRevision('team-role:remove', { team: group, member, role });
    second.removeTeamMemberRole({ teamId: group.id, personId: person.id, roleId: role.id });
    assert.throws(() => first.removeTeamMemberRoleReviewed({ teamId: group.id, personId: person.id, roleId: role.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listTeamMembers(group.id)[0].roles, []);
  });
  await t.test('grupo da sessão: formação concorrente invalida inclusão', async t2 => {
    const { first, second, group, otherGroup, session } = await paired(t2);
    const formation = first.listSessionFormation(session.id);
    const revision = teamSessionRevision('session-team:add', { session, team: group, formation });
    second.addSessionTeam({ sessionId: session.id, teamId: otherGroup.id });
    assert.throws(() => first.addSessionTeamReviewed({ sessionId: session.id, teamId: group.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listSessionFormation(session.id).map(item => item.id), [otherGroup.id]);
  });
  await t.test('grupo da sessão: formação alterada impede remoção', async t2 => {
    const { first, second, group, otherGroup, session } = await paired(t2);
    first.addSessionTeam({ sessionId: session.id, teamId: group.id });
    first.addSessionTeam({ sessionId: session.id, teamId: otherGroup.id });
    const formation = first.listSessionFormation(session.id), team = formation[0];
    const revision = teamSessionRevision('session-team:remove', { session, team, formation });
    second.removeSessionTeam({ sessionId: session.id, teamId: otherGroup.id });
    assert.throws(() => first.removeSessionTeamReviewed({ sessionId: session.id, teamId: group.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listSessionFormation(session.id).map(item => item.id), [group.id]);
  });
  await t.test('participante: alteração concorrente da formação impede inclusão', async t2 => {
    const { first, second, group, person, otherPerson, session } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    first.addTeamMember({ teamId: group.id, personId: otherPerson.id });
    first.addSessionTeam({ sessionId: session.id, teamId: group.id });
    const formation = first.listSessionFormation(session.id), team = formation[0];
    const member = first.listTeamMembers(group.id).find(item => item.personId === person.id);
    const revision = teamSessionRevision('session-member:add', { session, team, member, formation });
    second.addSessionMember({ sessionId: session.id, teamId: group.id, personId: otherPerson.id });
    assert.throws(() => first.addSessionMemberReviewed({ sessionId: session.id, teamId: group.id, personId: person.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listSessionFormation(session.id)[0].members.map(item => item.id), [otherPerson.id]);
  });
  await t.test('participante: associação removida por outra conexão não é recriada', async t2 => {
    const { first, second, group, person, session } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    first.addSessionTeam({ sessionId: session.id, teamId: group.id });
    first.addSessionMember({ sessionId: session.id, teamId: group.id, personId: person.id });
    const formation = first.listSessionFormation(session.id), team = formation[0];
    const member = first.listTeamMembers(group.id)[0];
    const revision = teamSessionRevision('session-member:remove', { session, team, member, formation });
    second.removeSessionMember({ sessionId: session.id, teamId: group.id, personId: person.id });
    assert.throws(() => first.removeSessionMemberReviewed({ sessionId: session.id, teamId: group.id, personId: person.id, expectedRevision: revision }), /não encontrado|alterad/i);
    assert.deepEqual(first.listSessionFormation(session.id)[0].members, []);
  });
  await t.test('papel efetivo: mudança concorrente de papel invalida inclusão', async t2 => {
    const { first, second, group, person, role, otherRole, session } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    first.addSessionTeam({ sessionId: session.id, teamId: group.id });
    first.addSessionMember({ sessionId: session.id, teamId: group.id, personId: person.id });
    const formation = first.listSessionFormation(session.id), team = formation[0], participant = team.members[0];
    const revision = teamSessionRevision('session-role:add', { session, team, participant, role, formation });
    second.addSessionRole({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: otherRole.id });
    assert.throws(() => first.addSessionRoleReviewed({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: role.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listSessionFormation(session.id)[0].members[0].roles.map(item => item.id), [otherRole.id]);
  });
  await t.test('papel efetivo: remoção e substituição concorrentes recusam remoção obsoleta', async t2 => {
    const { first, second, group, person, role, otherRole, session } = await paired(t2);
    first.addTeamMember({ teamId: group.id, personId: person.id });
    first.addSessionTeam({ sessionId: session.id, teamId: group.id });
    first.addSessionMember({ sessionId: session.id, teamId: group.id, personId: person.id });
    first.addSessionRole({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: role.id });
    const formation = first.listSessionFormation(session.id), team = formation[0], participant = team.members[0];
    const revision = teamSessionRevision('session-role:remove', { session, team, participant, role, formation });
    second.removeSessionRole({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: role.id });
    second.addSessionRole({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: otherRole.id });
    assert.throws(() => first.removeSessionRoleReviewed({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: role.id, expectedRevision: revision }), /alterad/i);
    assert.deepEqual(first.listSessionFormation(session.id)[0].members[0].roles.map(item => item.id), [otherRole.id]);
  });
});

test('variantes de formação conferem a sessão do contexto e preservam bloqueios transacionais', async t => {
  const { first, group, person, role, session, otherSession } = await paired(t);
  first.addTeamMember({ teamId: group.id, personId: person.id });
  first.addSessionTeam({ sessionId: session.id, teamId: group.id });
  first.addSessionMember({ sessionId: session.id, teamId: group.id, personId: person.id });
  first.addSessionTeam({ sessionId: otherSession.id, teamId: group.id });
  first.addSessionMember({ sessionId: otherSession.id, teamId: group.id, personId: person.id });
  const sessionFormation = first.listSessionFormation(session.id), team = sessionFormation[0], member = first.listTeamMembers(group.id)[0];
  const teamAddRevision = teamSessionRevision('session-team:add', { session, team: first.listTeams().find(item => item.id === group.id), formation: sessionFormation });
  assert.throws(() => first.addSessionTeamReviewed({ sessionId: otherSession.id, teamId: group.id, expectedRevision: teamAddRevision }), /alterad|já associado/i);
  const memberAddRevision = teamSessionRevision('session-member:add', { session, team, member, formation: sessionFormation });
  assert.throws(() => first.addSessionMemberReviewed({ sessionId: otherSession.id, teamId: group.id, personId: person.id, expectedRevision: memberAddRevision }), /alterad|já participa/i);
  const sessionRole = first.addRole('Dirigente');
  const participant = team.members[0];
  const roleRevision = teamSessionRevision('session-role:add', { session, team, participant, role: sessionRole, formation: sessionFormation });
  assert.throws(() => first.addSessionRoleReviewed({ sessionId: otherSession.id, teamId: group.id, personId: person.id, roleId: sessionRole.id, expectedRevision: roleRevision }), /alterad/i);
  assert.deepEqual(first.listSessionFormation(otherSession.id)[0].members[0].roles, []);
  assert.throws(() => first.removeSessionTeamReviewed({ sessionId: session.id, teamId: group.id,
    expectedRevision: teamSessionRevision('session-team:remove', { session, team, formation: sessionFormation }) }), /FOREIGN KEY/i);
  assert.deepEqual(first.listSessionFormation(session.id)[0].members[0].id, person.id);
  first.addTeamMemberRole({ teamId: group.id, personId: person.id, roleId: role.id });
  const memberWithRole = first.listTeamMembers(group.id)[0];
  assert.throws(() => first.removeTeamMemberReviewed({ teamId: group.id, personId: person.id,
    expectedRevision: teamSessionRevision('team-member:remove', { team: group, member: memberWithRole }) }), /FOREIGN KEY/i);
  assert.equal(first.listTeamMembers(group.id)[0].personId, person.id);
  first.addSessionRole({ sessionId: session.id, teamId: group.id, personId: person.id, roleId: sessionRole.id });
  const withRole = first.listSessionFormation(session.id), teamWithRole = withRole[0], participantWithRole = teamWithRole.members[0];
  const memberWithHabitualRole = first.listTeamMembers(group.id)[0];
  assert.throws(() => first.removeSessionMemberReviewed({ sessionId: session.id, teamId: group.id, personId: person.id,
    expectedRevision: teamSessionRevision('session-member:remove', { session, team: teamWithRole, member: memberWithHabitualRole, formation: withRole }) }), /FOREIGN KEY/i);
  assert.deepEqual(first.listSessionFormation(session.id)[0].members[0].roles.map(item => item.id), [sessionRole.id]);
  assert.deepEqual(participantWithRole.roles.map(item => item.id), [sessionRole.id]);
});
