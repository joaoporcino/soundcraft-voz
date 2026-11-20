import { queryRegistryList } from './terminal-source-proposal.js';
import { physicalRevision } from './physical-review.js';

async function eligiblePoints(registry, sessionId) {
  const returns = await queryRegistryList(registry, ['retorno', 'listar', String(sessionId)]);
  const ids = new Set(returns.map(item => item.id));
  const points = (await queryRegistryList(registry, ['fisico-ponto', 'listar'])).filter(item => item.type !== 'monitor_return' || ids.has(item.monitorReturnId));
  return { points, returns };
}

async function selectPoint({ registry, session, destination, screen, ask, write }) {
  let page = 0, search = '';
  for (;;) {
    const { points: records, returns } = await eligiblePoints(registry, session.id);
    const filtered = records.filter(item => `${item.label} ${item.id} ${item.type} ${item.direction}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
    const pages = Math.max(1, Math.ceil(filtered.length / 8));
    page = Math.min(page, pages - 1);
    const shown = filtered.slice(page * 8, page * 8 + 8);
    screen('Cadastros', destination ? 'Selecionar destino' : 'Selecionar origem', [
      ...(shown.length ? shown.map((item, index) => {
        const monitorReturn = item.type === 'monitor_return' ? returns.find(value => value.id === item.monitorReturnId) : null;
        return `${index + 1}  ${item.label} (ID ${item.id}; ${item.type}; ${item.direction})${monitorReturn ? ` — AUX ${monitorReturn.aux} (ID ${monitorReturn.id}; ${monitorReturn.confirmedPeople} pessoa(s) confirmada(s))` : ''}`;
      }) : ['Nenhum ponto disponível nesta sessão. Cadastre pontos ou volte.']),
      `Página ${page + 1} de ${pages} | Busca: ${search || 'nenhuma'}`,
      `Número: selecionar | B: buscar | P: próxima | A: anterior${destination ? ' | D: destino desconhecido' : ''} | 0: voltar`,
    ]);
    const answer = await ask('Escolha: ');
    if (answer === null) return { eof: true };
    if (answer === '0') return {};
    if (destination && answer.toLowerCase() === 'd') return { unknown: true };
    if (answer.toLowerCase() === 'b') { const term = await ask('Buscar (vazio limpa): '); if (term === null) return { eof: true }; search = term; page = 0; continue; }
    if (answer.toLowerCase() === 'p') { if (page + 1 < pages) page++; continue; }
    if (answer.toLowerCase() === 'a') { if (page) page--; continue; }
    if (!/^\d+$/u.test(answer) || !shown[Number(answer) - 1]) { write('Ponto inválido.'); continue; }
    const record = shown[Number(answer) - 1];
    return { record, monitorReturn: record.type === 'monitor_return' ? returns.find(value => value.id === record.monitorReturnId) : null };
  }
}

export async function proposeSignalLink({ session, registry, screen, ask, write }) {
  try {
    const origin = await selectPoint({ registry, session, destination: false, screen, ask, write });
    if (origin.eof) return false;
    if (!origin.record) return true;
    const destination = await selectPoint({ registry, session, destination: true, screen, ask, write });
    if (destination.eof) return false;
    if (!destination.record && !destination.unknown) return true;
    const choice = await ask('Tipo: 1 física | 2 interna | 3 patch | 0 voltar: ');
    if (choice === null) return false;
    if (choice === '0') return true;
    const kind = { 1: 'physical', 2: 'internal', 3: 'patch' }[choice];
    if (!kind) { write('Tipo inválido.'); return true; }
    screen('Cadastros', 'Revisar ligação', [
      `Sessão: ${session.name} (ID ${session.id})`, `Origem: ${origin.record.label} (ID ${origin.record.id}; ${origin.record.direction})`,
      destination.record ? `Destino: ${destination.record.label} (ID ${destination.record.id}; ${destination.record.direction})` : 'Destino: desconhecido',
      ...(origin.monitorReturn ? [`Retorno da origem: AUX ${origin.monitorReturn.aux} (ID ${origin.monitorReturn.id}; ${origin.monitorReturn.confirmedPeople} pessoa(s) confirmada(s))`] : []),
      ...(destination.monitorReturn ? [`Retorno do destino: AUX ${destination.monitorReturn.aux} (ID ${destination.monitorReturn.id}; ${destination.monitorReturn.confirmedPeople} pessoa(s) confirmada(s))`] : []),
      `Tipo: ${kind}`, 'A proposta não confirma ligação física. Digite SIM para propor.',
    ]);
    const confirm = await ask('Propor? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Proposta cancelada.'); return true; }
    const currentSession = (await queryRegistryList(registry, ['sessao', 'listar'])).find(item => item.id === session.id);
    const { points, returns } = await eligiblePoints(registry, session.id);
    if (!currentSession || JSON.stringify(currentSession) !== JSON.stringify(session) || [origin, destination].filter(item => item.record).some(({ record: item, monitorReturn }) => {
      const current = points.find(point => point.id === item.id);
      const currentReturn = monitorReturn && returns.find(value => value.id === monitorReturn.id);
      return !current || JSON.stringify(current) !== JSON.stringify(item) || monitorReturn && JSON.stringify(currentReturn) !== JSON.stringify(monitorReturn);
    })) { write('Sessão ou ponto alterado. Atualize e revise novamente.'); return true; }
    const returnRevision = selected => {
      if (!selected.record || selected.record.type !== 'monitor_return') return 'desconhecido';
      if (!selected.monitorReturn || selected.monitorReturn.sessionId !== session.id) throw new Error('Retorno do ponto não pertence à sessão selecionada. Atualize os cadastros.');
      return physicalRevision('retorno', selected.monitorReturn);
    };
    await registry(['fisico-ligacao', 'propor-revisado', String(session.id), String(origin.record.id), destination.record ? String(destination.record.id) : 'desconhecido', kind,
      physicalRevision('sessao', session), physicalRevision('ponto', origin.record), destination.record ? physicalRevision('ponto', destination.record) : 'desconhecido',
      returnRevision(origin), returnRevision(destination)], { output: () => {} });
    write('Ligação proposta; confirmação é uma ação posterior.');
  } catch (error) { write(`Não foi possível propor ligação: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
