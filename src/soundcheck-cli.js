import { soundcheckRevision } from './soundcheck-review.js';

function positive(value, label) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} deve ser um inteiro positivo`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} deve ser um inteiro positivo`);
  return number;
}

function optional(value, label) {
  return value === 'desconhecido' ? null : positive(value, label);
}

const lists = {
  vinculo: 'listAssignments', retorno: 'listMonitorAssignments',
  ligacao: 'listSignalLinks', voz: 'listVoiceProposals',
};

export function parseSoundcheckCommand(args) {
  const [category, rawAction, sessionText, type, idText, ...rawRest] = args;
  const replacementReviewed = rawAction === 'substituir-referencias-revisadas';
  const referenceReviewed = rawAction === 'corrigir-referencias-revisadas';
  const revised = referenceReviewed || ['corrigir-revisado', 'rejeitar-revisado', 'revogar-revisado'].includes(rawAction);
  const action = replacementReviewed ? 'substituir' : referenceReviewed ? 'corrigir' : revised ? rawAction.replace('-revisado', '') : rawAction;
  if (category !== 'passagem' || !['mostrar', 'confirmar', 'rejeitar', 'corrigir', 'substituir', 'revogar'].includes(action) || (action === 'revogar' && !revised)) throw new Error('Comando de passagem desconhecido');
  const expectedReview = revised ? rawRest[0] : undefined;
  if (revised && !/^[a-f0-9]{64}$/.test(expectedReview ?? '')) throw new Error('Revisão obrigatória');
  const rest = revised ? rawRest.slice(1) : rawRest;
  let expectedReferences;
  if (referenceReviewed) {
    if (rest.length !== 5) throw new Error('Revisões das referências obrigatórias');
    const tokens = rest.splice(3, 2);
    expectedReferences = Object.fromEntries(['pessoa', 'equipamento'].map((key, index) => {
      const value = tokens[index];
      const unknown = rest[index] === 'desconhecido';
      if (unknown ? value !== 'desconhecido' : !/^[a-f0-9]{64}$/.test(value ?? '')) throw new Error('Revisões das referências inválidas');
      return [key, unknown ? null : value];
    }));
  }
  const sessionId = positive(sessionText, 'Sessão');
  if (action === 'mostrar') {
    if (type !== undefined) throw new Error('Uso: passagem mostrar SESSAO');
    return (r) => {
      const session = r.listSessions().find(item => item.id === sessionId);
      if (!session) throw new Error('Sessão não encontrada');
      const reviewed = (type, items) => items.map(item => ({ ...item, revisao: soundcheckRevision(type, item) }));
      const sources = r.listInputSources(sessionId);
      const assignments = reviewed('vinculo', r.listAssignments(sessionId)).map(item => {
        if (item.status !== 'confirmado') return item;
        const entradasAssociadas = sources.filter(source => source.assignmentId === item.id)
          .map(({ inputId, bindingId }) => ({ inputId, bindingId }));
        return { ...item, entradasAssociadas, revisaoSubstituicao: soundcheckRevision('substituicao', { ...item, entradasAssociadas }) };
      });
      const monitors = reviewed('retorno', r.listMonitorAssignments(sessionId));
      const links = reviewed('ligacao', r.listSignalLinks(sessionId));
      const voice = reviewed('voz', r.listVoiceProposals(sessionId));
      const pending = [];
      for (const item of assignments.filter(value => value.status === 'proposto')) {
        const notices = [];
        if (item.channel === null) notices.push('canal desconhecido');
        if (assignments.some(value => value.id !== item.id && value.status === 'confirmado' && value.equipmentId === item.equipmentId)) notices.push('equipamento já confirmado em outro vínculo');
        if (item.channel !== null && assignments.some(value => value.id !== item.id && value.status === 'confirmado' && value.channel === item.channel)) notices.push('canal já confirmado em outro vínculo');
        pending.push({ tipo: 'vinculo', id: item.id, revisao: item.revisao, avisos: notices });
      }
      for (const item of monitors.filter(value => value.status === 'proposto')) {
        const notices = monitors.some(value => value.id !== item.id && value.status === 'confirmado' && value.personId === item.personId)
          ? ['pessoa já possui retorno confirmado'] : [];
        pending.push({ tipo: 'retorno', id: item.id, revisao: item.revisao, avisos: notices });
      }
      for (const item of links.filter(value => value.status === 'proposto')) {
        pending.push({ tipo: 'ligacao', id: item.id, revisao: item.revisao, avisos: item.toPointId === null ? ['destino desconhecido'] : [] });
      }
      for (const item of voice.filter(value => value.status === 'proposto')) {
        pending.push({ tipo: 'voz', id: item.id, revisao: item.revisao, avisos: !item.personId || !item.equipmentId || !item.channel ? ['proposta incompleta'] : [] });
      }
      return {
        aviso: 'Confirmação no cadastro não comprova ligação, patch ou áudio físico. Confira cada item com o técnico. A revisão protege os dados da proposta, não alterações nos cadastros relacionados. Pessoas e equipamentos são cadastros globais; corrigi-los pode afetar outras sessões.',
        sessao: session, formacao: r.listSessionFormation(sessionId),
        pessoas: reviewed('pessoa', r.listPeople()), equipamentos: reviewed('equipamento', r.listEquipment()), pontos: r.listSignalPoints(),
        vinculos: assignments, retornos: r.listMonitorReturns(sessionId),
        vinculosRetorno: monitors, ligacoes: links, propostasVoz: voice, pendencias: pending,
        historicoCadastros: r.listRegistryCorrections(), historicoVinculos: r.listRetiredAssignments(sessionId),
        orientacao: [
          'Confira pessoas, equipamentos, canal e retorno; dados desconhecidos não devem ser presumidos.',
          'Após revisar, use passagem confirmar SESSAO TIPO ID REVISAO; ligação também requer ORIGEM.',
          'Para corrigir vínculo ou voz use passagem corrigir-revisado SESSAO TIPO ID REVISAO PESSOA EQUIPAMENTO CANAL; use desconhecido onde permitido.',
          'Para rejeitar proposta ou revogar retorno ou ligação confirmados use passagem rejeitar-revisado ou revogar-revisado SESSAO TIPO ID REVISAO.',
          'Corrigir pessoa ou equipamento altera o cadastro global e pode afetar outras sessões. Use a revisão exibida.',
          'Para substituir vínculo confirmado, confira entradasAssociadas e use revisaoSubstituicao; cria proposta e desvincula essas entradas.',
          'Para corrigir retorno ou ligação, rejeite a proposta e cadastre outra. Para vínculo simples, corrija a proposta.',
          'Verifique caminhos físicos e patches com o técnico antes de confiar no cadastro.',
        ],
      };
    };
  }
  const id = positive(idText, 'ID');
  if (action === 'corrigir' && ['pessoa', 'equipamento'].includes(type) && !revised) {
    if (!/^[a-f0-9]{64}$/.test(rest[0] ?? '') || rest.length !== (type === 'pessoa' ? 2 : 7)) throw new Error('Uso: passagem corrigir SESSAO pessoa ID REVISAO NOME | equipamento ID REVISAO NOME TIPO COR|desconhecido sim|nao|desconhecido CAPSULA|desconhecido MODELO|desconhecido');
    if (type === 'equipamento' && !['sim', 'nao', 'desconhecido'].includes(rest[4])) throw new Error('Sem fio deve ser sim, nao ou desconhecido');
    return r => {
      if (!r.listSessions().some(item => item.id === sessionId)) throw new Error('Sessão não encontrada');
      if (type === 'pessoa') return r.correctPerson(id, { expectedRevision: rest[0], name: rest[1] });
      const unknown = text => text === 'desconhecido' ? null : text;
      return r.correctEquipment(id, { expectedRevision: rest[0], name: rest[1], kind: rest[2], color: unknown(rest[3]),
        wireless: rest[4] === 'desconhecido' ? null : rest[4] === 'sim', capsule: unknown(rest[5]), model: unknown(rest[6]) });
    };
  }
  if (action === 'substituir') {
    if (type !== 'vinculo' || rest.length !== (replacementReviewed ? 6 : 4) || !/^[a-f0-9]{64}$/.test(rest[0] ?? '')) throw new Error('Uso: passagem substituir SESSAO vinculo ID REVISAO PESSOA EQUIPAMENTO CANAL|desconhecido');
    const input = { sessionId, expectedRevision: rest[0], personId: positive(rest[1], 'Pessoa'), equipmentId: positive(rest[2], 'Equipamento'), channel: optional(rest[3], 'Canal') };
    if (input.channel !== null && input.channel > 24) throw new Error('Canal deve estar entre 1 e 24');
    if (replacementReviewed) {
      if (!rest.slice(4).every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error('Revisões das referências inválidas');
      input.expectedReferences = { pessoa: rest[4], equipamento: rest[5] };
    }
    return r => replacementReviewed ? r.replaceConfirmedAssignmentReviewed(id, input) : r.replaceConfirmedAssignment(id, input);
  }
  if (!Object.hasOwn(lists, type)) throw new Error('Tipo deve ser vinculo, retorno, ligacao ou voz');
  if (action === 'confirmar') {
    if (rest.length !== (type === 'ligacao' ? 2 : 1) || !/^[a-f0-9]{64}$/.test(rest[0] ?? '') || (type === 'ligacao' && !rest[1]?.trim())) throw new Error('Uso: passagem confirmar SESSAO TIPO ID REVISAO [ORIGEM para ligação]');
  } else if (action === 'rejeitar') {
    if (rest.length || type === 'vinculo') throw new Error('Rejeição disponível para retorno, ligacao e voz; corrija o vínculo simples');
  } else if (action === 'revogar') {
    if (rest.length || !['retorno', 'ligacao'].includes(type)) throw new Error('Revogação revisada disponível para retorno ou ligação');
  } else if (rest.length !== 3 || !['vinculo', 'voz'].includes(type)) {
    throw new Error('Uso: passagem corrigir SESSAO vinculo|voz ID PESSOA EQUIPAMENTO CANAL');
  }
  let changes;
  if (action === 'corrigir') {
    const parseReference = type === 'voz' ? optional : positive;
    changes = { personId: parseReference(rest[0], 'Pessoa'), equipmentId: parseReference(rest[1], 'Equipamento'), channel: optional(rest[2], 'Canal') };
    if (changes.channel !== null && changes.channel > 24) throw new Error('Canal deve estar entre 1 e 24');
  }
  return (r) => {
    if (!r.listSessions().some(item => item.id === sessionId)) throw new Error('Sessão não encontrada');
    const item = r[lists[type]](sessionId).find(value => value.id === id);
    if (!item || item.status !== (action === 'revogar' ? 'confirmado' : 'proposto')) {
      throw new Error(action === 'revogar' ? 'Registro confirmado não encontrado nesta sessão' : 'Registro pendente não encontrado nesta sessão');
    }
    if (action === 'corrigir') return type === 'voz' ? r.editVoiceProposal(id, { ...changes, authorized: true, expectedRevision: expectedReview, ...(referenceReviewed ? { expectedReferences, sessionId } : {}) }) : r.editAssignment(id, { ...changes, expectedRevision: expectedReview, ...(referenceReviewed ? { expectedReferences, sessionId } : {}) });
    if (action === 'confirmar') {
      const expectedRevision = rest[0];
      if (type === 'vinculo') return r.confirmAssignment(id, { expectedRevision });
      if (type === 'retorno') return r.confirmMonitorAssignment(id, { expectedRevision });
      if (type === 'ligacao') return r.confirmSignalLink(id, { origin: rest[1], expectedRevision });
      return r.confirmVoiceProposal(id, { authorized: true, expectedRevision });
    }
    if (action === 'revogar') return type === 'retorno' ? r.revokeMonitorAssignment(id, { expectedRevision: expectedReview }) : r.revokeSignalLink(id, { expectedRevision: expectedReview });
    if (type === 'retorno') return r.rejectMonitorAssignment(id, { expectedRevision: expectedReview });
    if (type === 'ligacao') return r.rejectSignalLink(id, { expectedRevision: expectedReview });
    return r.rejectVoiceProposal(id, { authorized: true, expectedRevision: expectedReview });
  };
}
