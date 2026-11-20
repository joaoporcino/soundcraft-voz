import { queryRegistryList, selectReference } from './terminal-source-proposal.js';
import { teamSessionRevision } from './team-session-review.js';

const reviewed = (category, action, ids, revision) => [category, `${action}-revisado`, ...ids.map(String), revision];
const revisionAction = action => action === 'adicionar' ? 'add' : 'remove';

export async function addTeamMember({ team, registry, screen, ask, write }) {
  try {
    const selected = await selectReference({ kind: 'pessoa', registry, screen, ask, write });
    if (selected.eof) return false;
    if (!selected.record) return true;
    const currentTeam = (await queryRegistryList(registry, ['grupo', 'listar'])).find(record => record.id === team.id);
    const currentPerson = (await queryRegistryList(registry, ['pessoa', 'listar'])).find(record => record.id === selected.record.id);
    if (!currentTeam || JSON.stringify(currentTeam) !== JSON.stringify(team) || !currentPerson || JSON.stringify(currentPerson) !== JSON.stringify(selected.record)) {
      write('Cadastro alterado ou removido. Atualize e revise novamente.'); return true;
    }
    const revision = teamSessionRevision('team-member:add', { team: currentTeam, person: currentPerson });
    screen('Cadastros', 'Revisar integrante', [
      `Grupo: ${currentTeam.name} (ID ${currentTeam.id})`, `Pessoa: ${currentPerson.name} (ID ${currentPerson.id})`,
      'Esta ação não atribui função nem participação em sessão. Digite SIM para adicionar.',
    ]);
    const confirm = await ask('Adicionar integrante? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Inclusão cancelada.'); return true; }
    await registry(reviewed('grupo-integrante', 'adicionar', [team.id, selected.record.id], revision), { output: () => {} });
    write('Integrante adicionado ao grupo.');
  } catch (error) { write(`Não foi possível adicionar: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}

export async function removeTeamMember({ team, member, registry, screen, ask, write }) {
  try {
    const currentTeam = (await queryRegistryList(registry, ['grupo', 'listar'])).find(item => item.id === team.id);
    const currentMember = (await queryRegistryList(registry, ['grupo-integrante', 'listar', String(team.id)])).find(item => item.personId === member.personId);
    if (!currentTeam || JSON.stringify(currentTeam) !== JSON.stringify(team) || !currentMember || JSON.stringify(currentMember) !== JSON.stringify(member)) {
      write('Associação alterada ou removida. Atualize e revise novamente.'); return true;
    }
    const revision = teamSessionRevision('team-member:remove', { team: currentTeam, member: currentMember });
    screen('Cadastros', 'Remover integrante', [
      `Grupo: ${currentTeam.name} (ID ${currentTeam.id})`, `Pessoa: ${currentMember.personName} (ID ${currentMember.personId})`,
      `Funções: ${currentMember.roles.map(role => role.name).join(', ') || 'nenhuma'}`,
      'Funções ou formação vinculadas podem impedir a remoção. Digite SIM para confirmar.',
    ]);
    const confirm = await ask('Remover integrante? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Remoção cancelada.'); return true; }
    const output = [];
    await registry(reviewed('grupo-integrante', 'remover', [team.id, member.personId], revision), { output: value => output.push(value) });
    if (output.length !== 1 || !['true', 'false'].includes(output[0])) throw Error('Resposta de cadastro inesperada.');
    write(output[0] === 'true' ? 'Integrante removido do grupo.' : 'Associação já ausente.');
  } catch (error) { write(`Não foi possível remover: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}

export async function changeTeamRole({ team, member, action, registry, screen, ask, write }) {
  try {
    let role;
    if (action === 'adicionar') {
      const selected = await selectReference({ kind: 'papel', registry, screen, ask, write });
      if (selected.eof) return false;
      if (!selected.record) return true;
      role = selected.record;
    } else {
      if (!member.roles.length) { write('Nenhuma função para remover.'); return true; }
      screen('Cadastros', 'Selecionar função para remover', [...member.roles.map((item, index) => `${index + 1}  ${item.name} (ID ${item.id})`), '0  Voltar']);
      const answer = await ask('Escolha: ');
      if (answer === null) return false;
      if (answer === '0') return true;
      if (!/^\d+$/u.test(answer) || !member.roles[Number(answer) - 1]) { write('Função inválida.'); return true; }
      role = member.roles[Number(answer) - 1];
    }
    const currentTeam = (await queryRegistryList(registry, ['grupo', 'listar'])).find(item => item.id === team.id);
    const currentMember = (await queryRegistryList(registry, ['grupo-integrante', 'listar', String(team.id)])).find(item => item.personId === member.personId);
    const currentRole = (await queryRegistryList(registry, ['papel', 'listar'])).find(item => item.id === role.id);
    if (!currentTeam || JSON.stringify(currentTeam) !== JSON.stringify(team) || !currentMember || JSON.stringify(currentMember) !== JSON.stringify(member) ||
        !currentRole || JSON.stringify(currentRole) !== JSON.stringify(role)) {
      write('Cadastro alterado ou removido. Atualize e revise novamente.'); return true;
    }
    const revision = teamSessionRevision(`team-role:${revisionAction(action)}`, { team: currentTeam, member: currentMember, role: currentRole });
    screen('Cadastros', 'Revisar função habitual', [
      `Grupo: ${currentTeam.name} (ID ${currentTeam.id})`, `Pessoa: ${currentMember.personName} (ID ${currentMember.personId})`,
      `Funções habituais atuais: ${currentMember.roles.map(item => item.name).join(', ') || 'nenhuma'}`,
      `Função: ${currentRole.name} (ID ${currentRole.id})`, `${action === 'adicionar' ? 'Adicionar' : 'Remover'} não altera a formação da sessão. Digite SIM para confirmar.`,
    ]);
    const confirm = await ask('Confirmar? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Alteração cancelada.'); return true; }
    const output = [];
    await registry(reviewed('grupo-funcao', action, [team.id, member.personId, role.id], revision), { output: value => output.push(value) });
    if (output.length !== 1 || (action === 'remover' && !['true', 'false'].includes(output[0]))) throw Error('Resposta de cadastro inesperada.');
    if (action === 'remover' && output[0] !== 'true') write('Função já ausente.');
    else write(action === 'adicionar' ? 'Função habitual adicionada.' : 'Função habitual removida.');
  } catch (error) { write(`Não foi possível alterar a função: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
