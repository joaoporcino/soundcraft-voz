import { soundcheckRevision } from './soundcheck-review.js';
import { passage } from './terminal-assignment-review.js';
import { queryRegistryList, selectReference } from './terminal-source-proposal.js';

export async function correctVoice({ session, record, registry, screen, ask, write }) {
  try {
    const before = (await passage(registry, session.id)).propostasVoz.find(item => item.id === record.id);
    if (!before || before.status !== 'proposto') { write('Proposta indisponível. Atualize a lista.'); return true; }
    const person = await selectReference({ kind: 'pessoa', allowUnknown: true, registry, screen, ask, write });
    if (person.eof) return false;
    if (!person.record && !person.unknown) return true;
    const equipment = await selectReference({ kind: 'equipamento', allowUnknown: true, registry, screen, ask, write });
    if (equipment.eof) return false;
    if (!equipment.record && !equipment.unknown) return true;
    const channel = await ask('Canal de 1 a 24 (Enter desconhecido, /cancelar volta): ');
    if (channel === null) return false;
    if (channel.toLowerCase() === '/cancelar') return true;
    if (channel && (!/^\d+$/u.test(channel) || Number(channel) < 1 || Number(channel) > 24)) { write('Canal inválido.'); return true; }
    screen('Cadastros', 'Revisar correção de voz', [
      `Sessão: ${session.name} (ID ${session.id}) | Proposta: ${record.id}`, `Frase: ${before.phrase} | Origem: ${before.origin}`,
      `Pessoa: ${person.record ? `${person.record.name} (ID ${person.record.id})` : 'desconhecida'}`,
      `Equipamento: ${equipment.record ? `${equipment.record.name} (ID ${equipment.record.id})` : 'desconhecido'}`,
      `Canal: ${channel || 'desconhecido'}`, 'A correção não confirma o vínculo. A revisão cobre a proposta e as referências selecionadas. Digite SIM para corrigir.',
    ]);
    const confirm = await ask('Corrigir? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Correção cancelada.'); return true; }
    const latest = await passage(registry, session.id);
    const current = latest.propostasVoz.find(item => item.id === record.id);
    if (!current || current.status !== 'proposto' || current.revisao !== before.revisao || JSON.stringify(latest.sessao) !== JSON.stringify(session)) {
      write('Sessão ou proposta alterada. Atualize e revise novamente.'); return true;
    }
    for (const [kind, item] of [['pessoa', person.record], ['equipamento', equipment.record]]) {
      if (!item) continue;
      const currentReference = (await queryRegistryList(registry, [kind, 'listar'])).find(value => value.id === item.id);
      if (!currentReference || JSON.stringify(currentReference) !== JSON.stringify(item)) { write('Referência alterada ou removida. Atualize e revise novamente.'); return true; }
    }
    await registry(['passagem', 'corrigir-referencias-revisadas', String(session.id), 'voz', String(record.id), before.revisao, person.record ? String(person.record.id) : 'desconhecido',
      equipment.record ? String(equipment.record.id) : 'desconhecido', channel || 'desconhecido',
      person.record ? soundcheckRevision('pessoa', person.record) : 'desconhecido', equipment.record ? soundcheckRevision('equipamento', equipment.record) : 'desconhecido'], { output: () => {} });
    write('Proposta de voz corrigida; confirmação continua pendente.');
  } catch (error) { write(`Não foi possível corrigir a proposta: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
