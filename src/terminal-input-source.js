import { passage } from './terminal-assignment-review.js';

export async function bindInput({ session, registry, screen, ask, write }) {
  try {
    const input = await ask('Identificador da entrada (vazio cancela): ');
    if (input === null) return false;
    if (!input || input.toLowerCase() === '/cancelar') return true;
    let page = 0, search = '', selected, selectedRevision;
    for (;;) {
      const data = await passage(registry, session.id);
      const choices = data.vinculos.filter(item => item.status === 'confirmado').map(item => {
        const person = data.pessoas.find(value => value.id === item.personId);
        const equipment = data.equipamentos.find(value => value.id === item.equipmentId);
        return { item, label: `${person?.name ?? 'pessoa desconhecida'} / ${equipment?.name ?? 'equipamento desconhecido'} (vínculo ID ${item.id}; canal ${item.channel ?? 'desconhecido'})` };
      }).filter(item => item.label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
      const pages = Math.max(1, Math.ceil(choices.length / 8));
      page = Math.min(page, pages - 1);
      const shown = choices.slice(page * 8, page * 8 + 8);
      screen('Cadastros', 'Selecionar fonte confirmada', [
        ...(shown.length ? shown.map((item, index) => `${index + 1}  ${item.label}`) : ['Nenhuma fonte confirmada nesta sessão. Revise e confirme uma fonte ou volte.']),
        `Página ${page + 1} de ${pages} | Busca: ${search || 'nenhuma'}`,
        'Número: selecionar | B: buscar | P: próxima | A: anterior | 0: voltar',
      ]);
      const answer = await ask('Escolha: ');
      if (answer === null) return false;
      if (answer === '0') return true;
      if (answer.toLowerCase() === 'b') { const term = await ask('Buscar (vazio limpa): '); if (term === null) return false; search = term; page = 0; continue; }
      if (answer.toLowerCase() === 'p') { if (page + 1 < pages) page++; continue; }
      if (answer.toLowerCase() === 'a') { if (page) page--; continue; }
      if (!/^\d+$/u.test(answer) || !shown[Number(answer) - 1]) { write('Fonte inválida.'); continue; }
      selected = shown[Number(answer) - 1]; selectedRevision = selected.item.revisao; break;
    }
    screen('Cadastros', 'Revisar associação de entrada', [
      `Sessão: ${session.name} (ID ${session.id})`, `Entrada: ${input}`, `Fonte: ${selected.label}`,
      'A associação não identifica quem fala nem comprova ligação física. Digite SIM para associar.',
    ]);
    const confirm = await ask('Associar? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Associação cancelada.'); return true; }
    const latest = await passage(registry, session.id);
    const current = latest.vinculos.find(item => item.id === selected.item.id);
    if (JSON.stringify(latest.sessao) !== JSON.stringify(session) || !current || current.status !== 'confirmado' || current.revisao !== selectedRevision) {
      write('Sessão ou fonte alterada. Atualize e revise novamente.'); return true;
    }
    await registry(['entrada-fonte', 'vincular', String(session.id), input, String(current.id)], { output: () => {} });
    write('Entrada associada à fonte confirmada.');
  } catch (error) { write(`Não foi possível associar entrada: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}

export async function unbindInput({ session, record, registry, screen, ask, write }) {
  try {
    const data = await passage(registry, session.id);
    const source = data.vinculos.find(item => item.id === record.assignmentId);
    const person = source && data.pessoas.find(item => item.id === source.personId);
    const equipment = source && data.equipamentos.find(item => item.id === source.equipmentId);
    screen('Cadastros', 'Remover associação de entrada', [
      `Sessão: ${data.sessao.name} (ID ${data.sessao.id})`, `Entrada: ${record.inputId}`,
      `Fonte: ${person?.name ?? 'desconhecida'} / ${equipment?.name ?? 'desconhecida'} (ID ${record.assignmentId})`,
      'Se a associação mudar, a remoção será recusada. Digite SIM para remover.',
    ]);
    const confirm = await ask('Remover? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Remoção cancelada.'); return true; }
    await registry(['entrada-fonte', 'remover-revisado', String(session.id), record.inputId, record.bindingId], { output: () => {} });
    write('Associação de entrada removida.');
  } catch (error) { write(`Não foi possível remover a associação: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
