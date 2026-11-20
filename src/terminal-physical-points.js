import { queryRegistryList, selectReference } from './terminal-source-proposal.js';
import { selectReturn } from './terminal-return-proposal.js';
import { physicalRevision } from './physical-review.js';

export async function createPhysicalPoint({ registry, screen, ask, write }) {
  try {
    screen('Cadastros', 'Novo ponto físico', ['1  Canal', '2  Porta', '3  Via de medusa', '4  Equipamento', '5  Pessoa', '6  Mix', '7  Outro', '8  Retorno', '0  Voltar', 'Opções avançadas estão disponíveis nos comandos de cadastro.']);
    const choice = await ask('Tipo: ');
    if (choice === null) return false;
    if (choice === '0') return true;
    const type = { 1: 'channel', 2: 'port', 3: 'snake_way', 4: 'equipment', 5: 'person', 6: 'mix', 7: 'other', 8: 'monitor_return' }[choice];
    if (!type) { write('Tipo inválido.'); return true; }
    const label = await ask('Identificação (vazio cancela): ');
    if (label === null) return false;
    if (!label || label.toLowerCase() === '/cancelar') return true;
    const directionChoice = await ask('Direção: 1 entrada | 2 saída | 3 bidirecional | 4 desconhecida | 0 voltar: ');
    if (directionChoice === null) return false;
    if (directionChoice === '0') return true;
    const direction = { 1: 'input', 2: 'output', 3: 'bidirectional', 4: 'unknown' }[directionChoice];
    if (!direction) { write('Direção inválida.'); return true; }
    let channel, reference, referenceKind, session;
    if (type === 'channel') {
      channel = await ask('Canal de 1 a 24 (vazio cancela): ');
      if (channel === null) return false;
      if (!channel) return true;
      if (!/^\d+$/u.test(channel) || Number(channel) < 1 || Number(channel) > 24) { write('Canal inválido.'); return true; }
    } else if (type === 'monitor_return') {
      const selectedSession = await selectReference({ kind: 'sessao', registry, screen, ask, write });
      if (selectedSession.eof) return false;
      if (!selectedSession.record) return true;
      session = selectedSession.record;
      const selectedReturn = await selectReturn({ session, registry, screen, ask, write });
      if (selectedReturn.eof) return false;
      if (!selectedReturn.record) return true;
      reference = selectedReturn.record;
    } else if (['port', 'snake_way', 'equipment', 'person'].includes(type)) {
      referenceKind = type === 'equipment' ? 'equipamento' : type === 'person' ? 'pessoa' : 'fisico-dispositivo';
      const selected = await selectReference({ kind: referenceKind, registry, screen, ask, write,
        filter: item => type !== 'snake_way' || item.type === 'medusa' });
      if (selected.eof) return false;
      if (!selected.record) return true;
      reference = selected.record;
    }
    screen('Cadastros', 'Revisar ponto físico', [
      `Tipo: ${type}`, `Identificação: ${label}`, `Direção: ${direction}`,
      ...(session ? [`Sessão: ${session.name} (ID ${session.id})`, `Retorno: AUX ${reference.aux} (ID ${reference.id})`] : reference ? [`Referência: ${reference.name} (ID ${reference.id}${reference.type ? `; ${reference.type}` : ''})`] : channel ? [`Canal: ${channel}`] : []),
      'Registro declarado não comprova ligação física. Digite SIM para salvar.',
    ]);
    const confirm = await ask('Salvar? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Cadastro cancelado.'); return true; }
    if (session) {
      const currentSession = (await queryRegistryList(registry, ['sessao', 'listar'])).find(item => item.id === session.id);
      const currentReturn = (await queryRegistryList(registry, ['retorno', 'listar', String(session.id)])).find(item => item.id === reference.id);
      if (!currentSession || JSON.stringify(currentSession) !== JSON.stringify(session) || !currentReturn || JSON.stringify(currentReturn) !== JSON.stringify(reference)) {
        write('Sessão ou retorno alterado. Atualize e revise novamente.'); return true;
      }
    } else if (reference) {
      const current = (await queryRegistryList(registry, [referenceKind, 'listar'])).find(item => item.id === reference.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(reference)) { write('Referência alterada ou removida. Atualize e revise novamente.'); return true; }
    }
    const pointArgs = ['fisico-ponto', reference ? 'adicionar-revisado' : 'adicionar', type, label, '--direcao', direction,
      ...(reference ? [{ equipment: '--equipamento', person: '--pessoa', port: '--dispositivo', snake_way: '--dispositivo', monitor_return: '--retorno' }[type], String(reference.id)] : channel ? ['--canal', channel] : [])];
    if (reference) {
      const referenceType = { equipment: 'equipamento', person: 'pessoa', port: 'dispositivo', snake_way: 'dispositivo', monitor_return: 'retorno' }[type];
      if (type === 'monitor_return') pointArgs.push('--sessao-revisada', String(session.id), '--revisao-sessao', physicalRevision('sessao', session), '--revisao-retorno', physicalRevision('retorno', reference));
      else pointArgs.push(`--revisao-${referenceType}`, physicalRevision(referenceType, reference));
    }
    await registry(pointArgs, { output: () => {} });
    write('Ponto cadastrado.');
  } catch (error) { write(`Não foi possível cadastrar ponto: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
