import { queryRegistryList, selectReference } from './terminal-source-proposal.js';
import { registryContentRevision } from './registry.js';
import { soundcheckRevision } from './soundcheck-review.js';

export async function selectReturn({ session, registry, screen, ask, write }) {
  let page = 0, search = '';
    for (;;) {
      const records = await queryRegistryList(registry, ['retorno', 'listar', String(session.id)]);
      const filtered = records.filter(item => `AUX ${item.aux} ID ${item.id}`.toLowerCase().includes(search.toLowerCase()));
      const pages = Math.max(1, Math.ceil(filtered.length / 8));
      page = Math.min(page, pages - 1);
      const shown = filtered.slice(page * 8, page * 8 + 8);
      screen('Cadastros', 'Selecionar retorno', [
        ...(shown.length ? shown.map((item, index) => `${index + 1}  AUX ${item.aux} (ID ${item.id}; ${item.confirmedPeople} pessoa(s) confirmada(s))`) : ['Nenhum retorno encontrado nesta sessão. Cadastre um retorno ou volte.']),
        `Página ${page + 1} de ${pages} | Busca: ${search || 'nenhuma'}`,
        'Número: selecionar | B: buscar | P: próxima | A: anterior | 0: voltar',
      ]);
      const answer = await ask('Escolha: ');
      if (answer === null) return { eof: true };
      if (answer === '0') return {};
      if (answer.toLowerCase() === 'b') { const term = await ask('Buscar (vazio limpa): '); if (term === null) return { eof: true }; search = term; page = 0; continue; }
      if (answer.toLowerCase() === 'p') { if (page + 1 < pages) page++; continue; }
      if (answer.toLowerCase() === 'a') { if (page) page--; continue; }
      if (!/^\d+$/u.test(answer) || !shown[Number(answer) - 1]) { write('Retorno inválido.'); continue; }
      return { record: shown[Number(answer) - 1] };
    }
}

export async function proposeReturn({ session, registry, screen, ask, write }) {
  try {
    const person = await selectReference({ kind: 'pessoa', registry, screen, ask, write });
    if (person.eof) return false;
    if (!person.record) return true;
    const selectedReturn = await selectReturn({ session, registry, screen, ask, write });
    if (selectedReturn.eof) return false;
    if (!selectedReturn.record) return true;
    const selected = selectedReturn.record;
    screen('Cadastros', 'Revisar proposta de retorno', [
      `Sessão: ${session.name} (ID ${session.id})`, `Pessoa: ${person.record.name} (ID ${person.record.id})`,
      `Retorno: AUX ${selected.aux} (ID ${selected.id})`, 'A proposta não confirma disponibilidade física. Digite SIM para propor.',
    ]);
    const confirm = await ask('Propor? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Proposta cancelada.'); return true; }
    for (const [kind, item] of [['sessao', session], ['pessoa', person.record]]) {
      const current = (await queryRegistryList(registry, [kind, 'listar'])).find(value => value.id === item.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(item)) { write('Cadastro alterado ou removido. Atualize e revise novamente.'); return true; }
    }
    const currentReturn = (await queryRegistryList(registry, ['retorno', 'listar', String(session.id)])).find(item => item.id === selected.id);
    if (!currentReturn || JSON.stringify(currentReturn) !== JSON.stringify(selected)) { write('Retorno alterado ou removido. Atualize e revise novamente.'); return true; }
    await registry(['retorno-vinculo', 'propor-revisado', String(session.id), String(person.record.id), String(selected.id),
      soundcheckRevision('sessao', session), soundcheckRevision('pessoa', person.record), registryContentRevision('retorno-cadastro', selected)], { output: () => {} });
    write('Vínculo de retorno proposto; confirmação é uma ação posterior.');
  } catch (error) { write(`Não foi possível propor retorno: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
