import { queryRegistryList, selectReference } from './terminal-source-proposal.js';
import { teamSessionRevision } from './team-session-review.js';

const command = (category, action, ids, revision) => [category, `${action}-revisado`, ...ids.map(String), revision];
const revisionAction = action => action === 'adicionar' ? 'add' : 'remove';
const formationOf = (registry, sessionId) => queryRegistryList(registry, ['formacao', 'mostrar', String(sessionId)]);

export async function changeSessionTeam({ session, team, action, registry, screen, ask, write }) {
  try {
    if (action === 'adicionar') {
      const selected = await selectReference({ kind: 'grupo', registry, screen, ask, write });
      if (selected.eof) return false;
      if (!selected.record) return true;
      team = selected.record;
    }
    const sessionNow = (await queryRegistryList(registry, ['sessao', 'listar'])).find(item => item.id === session.id);
    const formation = await formationOf(registry, session.id);
    const groupId = team.id ?? team.teamId;
    const group = action === 'adicionar'
      ? (await queryRegistryList(registry, ['grupo', 'listar'])).find(item => item.id === groupId)
      : formation.find(item => item.id === groupId);
    if (!sessionNow || JSON.stringify(sessionNow) !== JSON.stringify(session) || !group ||
        action === 'remover' && JSON.stringify(group) !== JSON.stringify(team)) {
      write('Sessão, grupo ou formação alterados. Atualize e revise novamente.'); return true;
    }
    if (action === 'adicionar' && JSON.stringify(group) !== JSON.stringify(team)) {
      write('Grupo alterado ou removido. Atualize e revise novamente.'); return true;
    }
    const context = { session: sessionNow, team: group, formation };
    const revision = teamSessionRevision(`session-team:${revisionAction(action)}`, context);
    screen('Cadastros', 'Revisar grupo da sessão', [
      `Sessão: ${sessionNow.name} (ID ${sessionNow.id})`, `Grupo: ${group.name} (ID ${group.id})`,
      `Grupos atuais na formação: ${formation.map(item => item.name).join(', ') || 'nenhum'}`,
      action === 'remover' ? 'Participações vinculadas impedem a remoção; nenhuma será excluída automaticamente.' : 'Integrantes não são escalados automaticamente.',
      'Digite SIM para confirmar.',
    ]);
    const confirm = await ask('Confirmar? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Alteração cancelada.'); return true; }
    const output = [];
    await registry(command('sessao-grupo', action, [session.id, groupId], revision), { output: value => output.push(value) });
    if (output.length !== 1 || (action === 'remover' && !['true', 'false'].includes(output[0]))) throw Error('Resposta de cadastro inesperada.');
    write(action === 'adicionar' ? 'Grupo associado à sessão.' : output[0] === 'true' ? 'Grupo desassociado da sessão.' : 'Associação já ausente.');
  } catch (error) { write(`Não foi possível alterar o grupo da sessão: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}

export async function changeSessionMember({ session, team, action, registry, screen, ask, write }) {
  try {
    const candidates = action === 'adicionar'
      ? await queryRegistryList(registry, ['grupo-integrante', 'listar', String(team.id)])
      : team.members;
    let search = '', page = 0, selected;
    for (;;) {
      const filtered = candidates.filter(item => (item.personName ?? item.name).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
      const pages = Math.max(1, Math.ceil(filtered.length / 8));
      page = Math.min(page, pages - 1);
      const shown = filtered.slice(page * 8, page * 8 + 8);
      screen('Cadastros', 'Selecionar participante', [
        ...(shown.length ? shown.map((item, index) => `${index + 1}  ${item.personName ?? item.name} (ID ${item.personId ?? item.id})`) : ['Nenhum integrante encontrado; cadastre pessoas no grupo ou volte.']),
        `Página ${page + 1} de ${pages} | Busca: ${search || 'nenhuma'}`,
        'Número: selecionar | B: buscar | P: próxima | A: anterior | 0: voltar',
      ]);
      const answer = await ask('Escolha: ');
      if (answer === null) return false;
      if (answer === '0') return true;
      if (answer.toLowerCase() === 'b') { const term = await ask('Buscar (vazio limpa): '); if (term === null) return false; search = term; page = 0; continue; }
      if (answer.toLowerCase() === 'p') { if (page + 1 < pages) page++; continue; }
      if (answer.toLowerCase() === 'a') { if (page) page--; continue; }
      if (!/^\d+$/u.test(answer) || !shown[Number(answer) - 1]) { write('Integrante inválido.'); continue; }
      selected = shown[Number(answer) - 1]; break;
    }
    const personId = selected.personId ?? selected.id;
    const sessionNow = (await queryRegistryList(registry, ['sessao', 'listar'])).find(item => item.id === session.id);
    const formation = await formationOf(registry, session.id);
    const currentTeam = formation.find(item => item.id === team.id);
    const member = (await queryRegistryList(registry, ['grupo-integrante', 'listar', String(team.id)])).find(item => item.personId === personId);
    const participant = currentTeam?.members.find(item => item.id === personId);
    if (!sessionNow || JSON.stringify(sessionNow) !== JSON.stringify(session) || !currentTeam || JSON.stringify(currentTeam) !== JSON.stringify(team) ||
        !member || action === 'adicionar' && JSON.stringify(member) !== JSON.stringify(selected) ||
        action === 'remover' && (!participant || JSON.stringify(participant) !== JSON.stringify(selected))) {
      write('Cadastro ou formação alterados. Atualize e revise novamente.'); return true;
    }
    const context = { session: sessionNow, team: currentTeam, member, formation };
    const revision = teamSessionRevision(`session-member:${revisionAction(action)}`, context);
    screen('Cadastros', 'Revisar participante da sessão', [
      `Sessão: ${sessionNow.name} (ID ${sessionNow.id})`, `Grupo: ${currentTeam.name} (ID ${currentTeam.id})`,
      `Pessoa: ${member.personName} (ID ${personId})`, `Funções habituais: ${member.roles.map(role => role.name).join(', ') || 'nenhuma'}`,
      `Papéis efetivos atuais: ${participant?.roles.map(role => role.name).join(', ') || 'nenhum'}`,
      action === 'remover' ? 'Papéis efetivos podem impedir a remoção; não serão excluídos automaticamente.' : 'Nenhum papel efetivo é atribuído automaticamente.',
      'Digite SIM para confirmar.',
    ]);
    const confirm = await ask('Confirmar? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Alteração cancelada.'); return true; }
    const output = [];
    await registry(command('sessao-integrante', action, [session.id, team.id, personId], revision), { output: value => output.push(value) });
    if (output.length !== 1 || (action === 'remover' && !['true', 'false'].includes(output[0]))) throw Error('Resposta de cadastro inesperada.');
    write(action === 'adicionar' ? 'Participante incluído na sessão.' : output[0] === 'true' ? 'Participante removido da sessão.' : 'Participação já ausente.');
  } catch (error) { write(`Não foi possível alterar a participação: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}

async function chooseFromList({ records, title, screen, ask, write }) {
  let page = 0, search = '';
  for (;;) {
    const filtered = records.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
    const pages = Math.max(1, Math.ceil(filtered.length / 8));
    page = Math.min(page, pages - 1);
    const shown = filtered.slice(page * 8, page * 8 + 8);
    screen('Cadastros', title, [
      ...(shown.length ? shown.map((item, index) => `${index + 1}  ${item.name} (ID ${item.id})`) : ['Nenhum registro encontrado.']),
      `Página ${page + 1} de ${pages} | Busca: ${search || 'nenhuma'}`,
      'Número: selecionar | B: buscar | P: próxima | A: anterior | 0: voltar',
    ]);
    const answer = await ask('Escolha: ');
    if (answer === null) return { eof: true };
    if (answer === '0') return {};
    if (answer.toLowerCase() === 'b') { const term = await ask('Buscar (vazio limpa): '); if (term === null) return { eof: true }; search = term; page = 0; continue; }
    if (answer.toLowerCase() === 'p') { if (page + 1 < pages) page++; continue; }
    if (answer.toLowerCase() === 'a') { if (page) page--; continue; }
    if (!/^\d+$/u.test(answer) || !shown[Number(answer) - 1]) { write('Registro inválido.'); continue; }
    return { record: shown[Number(answer) - 1] };
  }
}

export async function changeSessionRole({ session, team, action, registry, screen, ask, write }) {
  try {
    const participant = await chooseFromList({ records: team.members, title: 'Selecionar participante', screen, ask, write });
    if (participant.eof) return false;
    if (!participant.record) return true;
    const selected = action === 'adicionar' ? await selectReference({ kind: 'papel', registry, screen, ask, write }) :
      await chooseFromList({ records: participant.record.roles, title: 'Selecionar papel efetivo', screen, ask, write });
    if (selected.eof) return false;
    if (!selected.record) return true;
    const role = selected.record;
    const sessionNow = (await queryRegistryList(registry, ['sessao', 'listar'])).find(item => item.id === session.id);
    const formation = await formationOf(registry, session.id);
    const currentTeam = formation.find(item => item.id === team.id);
    const currentParticipant = currentTeam?.members.find(item => item.id === participant.record.id);
    const currentRole = (await queryRegistryList(registry, ['papel', 'listar'])).find(item => item.id === role.id);
    if (!sessionNow || JSON.stringify(sessionNow) !== JSON.stringify(session) || !currentTeam || JSON.stringify(currentTeam) !== JSON.stringify(team) ||
        !currentParticipant || JSON.stringify(currentParticipant) !== JSON.stringify(participant.record) || !currentRole || JSON.stringify(currentRole) !== JSON.stringify(role)) {
      write('Cadastro ou formação alterados. Atualize e revise novamente.'); return true;
    }
    const context = { session: sessionNow, team: currentTeam, participant: currentParticipant, role: currentRole, formation };
    const revision = teamSessionRevision(`session-role:${revisionAction(action)}`, context);
    screen('Cadastros', 'Revisar papel da sessão', [
      `Sessão: ${sessionNow.name} (ID ${sessionNow.id})`, `Grupo: ${currentTeam.name} (ID ${currentTeam.id})`,
      `Pessoa: ${currentParticipant.name} (ID ${currentParticipant.id})`, `Papéis efetivos atuais: ${currentParticipant.roles.map(item => item.name).join(', ') || 'nenhum'}`,
      `Papel: ${currentRole.name} (ID ${currentRole.id})`,
      'A função habitual e as permissões não são alteradas. Digite SIM para confirmar.',
    ]);
    const confirm = await ask('Confirmar? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Alteração cancelada.'); return true; }
    const output = [];
    await registry(command('sessao-papel', action, [session.id, team.id, currentParticipant.id, role.id], revision), { output: value => output.push(value) });
    if (output.length !== 1 || (action === 'remover' && !['true', 'false'].includes(output[0]))) throw Error('Resposta de cadastro inesperada.');
    write(action === 'adicionar' ? 'Papel efetivo atribuído.' : output[0] === 'true' ? 'Papel efetivo removido.' : 'Papel já ausente.');
  } catch (error) { write(`Não foi possível alterar o papel efetivo: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
