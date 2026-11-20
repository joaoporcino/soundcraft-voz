import { soundcheckRevision } from './soundcheck-review.js';
import { passage } from './terminal-assignment-review.js';
import { queryRegistryList, selectReference } from './terminal-source-proposal.js';

export async function correctSource({ session, record, registry, screen, ask, write }) {
  try {
    const before = (await passage(registry, session.id)).vinculos.find(item => item.id === record.id);
    if (!before || before.status !== 'proposto') { write('Proposta indisponível. Atualize a lista.'); return true; }
    const person = await selectReference({ kind: 'pessoa', registry, screen, ask, write });
    if (person.eof) return false;
    if (!person.record) return true;
    const equipment = await selectReference({ kind: 'equipamento', registry, screen, ask, write });
    if (equipment.eof) return false;
    if (!equipment.record) return true;
    const channel = await ask('Canal de 1 a 24 (Enter desconhecido, /cancelar volta): ');
    if (channel === null) return false;
    if (channel.toLowerCase() === '/cancelar') return true;
    if (channel && (!/^\d+$/u.test(channel) || Number(channel) < 1 || Number(channel) > 24)) { write('Canal inválido.'); return true; }
    screen('Cadastros', 'Revisar correção de fonte', [
      `Sessão: ${session.name} (ID ${session.id}) | Vínculo: ${record.id}`,
      `Pessoa: ${person.record.name} (ID ${person.record.id})`, `Equipamento: ${equipment.record.name} (ID ${equipment.record.id})`,
      `Canal: ${channel || 'desconhecido'}`, 'A correção permanece proposta e não comprova patch.',
      'A revisão cobre a proposta e as referências selecionadas. Digite SIM para corrigir.',
    ]);
    const confirm = await ask('Corrigir? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Correção cancelada.'); return true; }
    const latest = await passage(registry, session.id);
    const current = latest.vinculos.find(item => item.id === record.id);
    const currentPerson = (await queryRegistryList(registry, ['pessoa', 'listar'])).find(item => item.id === person.record.id);
    const currentEquipment = (await queryRegistryList(registry, ['equipamento', 'listar'])).find(item => item.id === equipment.record.id);
    if (!current || current.status !== 'proposto' || current.revisao !== before.revisao || JSON.stringify(latest.sessao) !== JSON.stringify(session) ||
        !currentPerson || JSON.stringify(currentPerson) !== JSON.stringify(person.record) || !currentEquipment || JSON.stringify(currentEquipment) !== JSON.stringify(equipment.record)) {
      write('Cadastro ou proposta alterados. Atualize e revise novamente.'); return true;
    }
    await registry(['passagem', 'corrigir-referencias-revisadas', String(session.id), 'vinculo', String(record.id), before.revisao, String(person.record.id), String(equipment.record.id), channel || 'desconhecido', soundcheckRevision('pessoa', person.record), soundcheckRevision('equipamento', equipment.record)], { output: () => {} });
    write('Fonte corrigida; o vínculo permanece proposto.');
  } catch (error) { write(`Não foi possível corrigir a fonte: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}

export async function replaceSource({ session, record, registry, screen, ask, write }) {
  try {
    const before = (await passage(registry, session.id)).vinculos.find(item => item.id === record.id);
    if (!before || before.status !== 'confirmado') { write('Fonte confirmada indisponível. Atualize a lista.'); return true; }
    const person = await selectReference({ kind: 'pessoa', registry, screen, ask, write });
    if (person.eof) return false;
    if (!person.record) return true;
    const equipment = await selectReference({ kind: 'equipamento', registry, screen, ask, write });
    if (equipment.eof) return false;
    if (!equipment.record) return true;
    const channel = await ask('Novo canal de 1 a 24 (Enter desconhecido, /cancelar volta): ');
    if (channel === null) return false;
    if (channel.toLowerCase() === '/cancelar') return true;
    if (channel && (!/^\d+$/u.test(channel) || Number(channel) < 1 || Number(channel) > 24)) { write('Canal inválido.'); return true; }
    screen('Cadastros', 'Revisar substituição de fonte', [
      `Sessão: ${session.name} (ID ${session.id}) | Vínculo anterior: ${record.id}`,
      `Entradas a desvincular: ${before.entradasAssociadas.map(item => item.inputId).join(', ') || 'nenhuma'}`,
      `Nova pessoa: ${person.record.name} (ID ${person.record.id})`, `Novo equipamento: ${equipment.record.name} (ID ${equipment.record.id})`,
      `Novo canal: ${channel || 'desconhecido'}`,
      'A fonte anterior será retirada; entradas serão desvinculadas e nova proposta ficará pendente.',
      'A revisão cobre vínculo, entradas e referências selecionadas. Digite SIM para substituir.',
    ]);
    const confirm = await ask('Substituir? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Substituição cancelada.'); return true; }
    const sessions = await queryRegistryList(registry, ['sessao', 'listar']);
    const currentSession = sessions.find(item => item.id === session.id);
    const currentPerson = (await queryRegistryList(registry, ['pessoa', 'listar'])).find(item => item.id === person.record.id);
    const currentEquipment = (await queryRegistryList(registry, ['equipamento', 'listar'])).find(item => item.id === equipment.record.id);
    if (!currentSession || JSON.stringify(currentSession) !== JSON.stringify(session) || !currentPerson || JSON.stringify(currentPerson) !== JSON.stringify(person.record) ||
        !currentEquipment || JSON.stringify(currentEquipment) !== JSON.stringify(equipment.record)) {
      write('Cadastro alterado ou removido. Atualize e revise novamente.'); return true;
    }
    await registry(['passagem', 'substituir-referencias-revisadas', String(session.id), 'vinculo', String(record.id), before.revisaoSubstituicao,
      String(person.record.id), String(equipment.record.id), channel || 'desconhecido', soundcheckRevision('pessoa', person.record), soundcheckRevision('equipamento', equipment.record)], { output: () => {} });
    write('Fonte substituída; nova proposta pendente e entradas anteriores desvinculadas.');
  } catch (error) { write(`Não foi possível substituir a fonte: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
