import { analyzeVoiceAssignment } from './voice-assignment-parser.js';

function id(value, label) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} deve ser inteiro positivo.`);
  }
  return Number(value);
}

function optionalId(value, label) {
  return value === 'desconhecido' ? null : id(value, label);
}

function count(values, expected, usage) {
  if (values.length !== expected) throw new Error(`Uso: ${usage}`);
}

/** Validate arguments before the caller creates or opens a registry. */
export function parsePhysicalRegistryCommand([category, action, ...values], { expectedBinding } = {}) {
  if (category === 'fisico-dispositivo' && action === 'adicionar') {
    count(values, 2, 'fisico-dispositivo adicionar NOME TIPO');
    return r => r.addPhysicalDevice({ name: values[0], type: values[1] });
  }
  if (category === 'fisico-dispositivo' && action === 'listar') {
    count(values, 0, 'fisico-dispositivo listar');
    return r => r.listPhysicalDevices();
  }
  if (category === 'fisico-ponto' && action === 'listar') {
    count(values, 0, 'fisico-ponto listar');
    return r => r.listSignalPoints();
  }
  if (category === 'fisico-ponto' && action === 'adicionar') {
    if (values.length < 2 || (values.length - 2) % 2 !== 0) throw new Error('Uso: fisico-ponto adicionar TIPO ETIQUETA [OPÇÕES]');
    const point = { type: values[0], label: values[1] };
    const options = { '--direcao': 'direction', '--dispositivo': 'deviceId', '--equipamento': 'equipmentId', '--pessoa': 'personId', '--retorno': 'monitorReturnId', '--canal': 'channel' };
    for (let i = 2; i < values.length; i += 2) {
      const key = Object.hasOwn(options, values[i]) ? options[values[i]] : null;
      if (!key || Object.hasOwn(point, key)) throw new Error(`Opção de ponto inválida ou repetida: ${values[i]}.`);
      if (key === 'direction') {
        if (!['input', 'output', 'bidirectional', 'unknown'].includes(values[i + 1])) throw new Error('Direção inválida.');
        point[key] = values[i + 1];
      } else point[key] = id(values[i + 1], values[i]);
    }
    return r => r.addSignalPoint(point);
  }
  if (category === 'fisico-ligacao' && action === 'propor') {
    count(values, 4, 'fisico-ligacao propor SESSAO ORIGEM DESTINO|desconhecido TIPO');
    const input = { sessionId: id(values[0], 'Sessão'), fromPointId: id(values[1], 'Origem'),
      toPointId: optionalId(values[2], 'Destino'), kind: values[3] };
    return r => r.proposeSignalLink(input);
  }
  if (category === 'fisico-ligacao' && action === 'listar') {
    count(values, 1, 'fisico-ligacao listar SESSAO');
    const sessionId = id(values[0], 'Sessão');
    return r => r.listSignalLinks(sessionId);
  }
  if (category === 'fisico-ligacao' && action === 'confirmar') {
    count(values, 2, 'fisico-ligacao confirmar ID ORIGEM');
    const linkId = id(values[0], 'Ligação');
    return r => r.confirmSignalLink(linkId, { origin: values[1] });
  }
  if (category === 'fisico-ligacao' && ['rejeitar', 'revogar'].includes(action)) {
    count(values, 1, `fisico-ligacao ${action} ID`);
    const linkId = id(values[0], 'Ligação');
    return action === 'rejeitar' ? r => r.rejectSignalLink(linkId) : r => r.revokeSignalLink(linkId);
  }
  if (category === 'fisico-caminho' && action === 'consultar') {
    count(values, 2, 'fisico-caminho consultar SESSAO PONTO');
    const input = { sessionId: id(values[0], 'Sessão'), startPointId: id(values[1], 'Ponto') };
    return r => r.traceSignalPath(input);
  }
  if (category === 'voz-vinculo' && action === 'listar') {
    count(values, 1, 'voz-vinculo listar SESSAO');
    const sessionId = id(values[0], 'Sessão');
    return r => r.listVoiceProposals(sessionId);
  }
  if (category === 'voz-vinculo' && action === 'propor') {
    count(values, 3, 'voz-vinculo propor SESSAO ORIGEM "FRASE"');
    const sessionId = id(values[0], 'Sessão');
    return r => {
      const result = analyzeVoiceAssignment({ authorized: true, sessionId, origin: values[1], phrase: values[2],
        sessions: r.listSessions(), people: r.listPeople(), equipment: r.listEquipment(),
        points: r.listSignalPoints(), links: r.listSignalLinks(sessionId), assignments: r.listAssignments(sessionId) });
      if (!['proposal', 'clarification'].includes(result.status)) return result;
      const saved = r.createVoiceProposal({ ...result.proposal, authorized: true, ...(expectedBinding ? { expectedBinding } : {}) });
      return { ...result, proposal: saved };
    };
  }
  if (category === 'voz-vinculo' && action === 'corrigir') {
    count(values, 4, 'voz-vinculo corrigir ID PESSOA|desconhecido EQUIPAMENTO|desconhecido CANAL|desconhecido');
    const proposalId = id(values[0], 'Proposta');
    const input = { personId: optionalId(values[1], 'Pessoa'), equipmentId: optionalId(values[2], 'Equipamento'),
      channel: optionalId(values[3], 'Canal'), authorized: true };
    return r => r.editVoiceProposal(proposalId, input);
  }
  if (category === 'voz-vinculo' && ['confirmar', 'rejeitar'].includes(action)) {
    count(values, 1, `voz-vinculo ${action} ID`);
    const proposalId = id(values[0], 'Proposta');
    return action === 'confirmar' ? r => r.confirmVoiceProposal(proposalId, { authorized: true }) :
      r => r.rejectVoiceProposal(proposalId, { authorized: true });
  }
  throw new Error(`Comando desconhecido: ${category} ${action ?? ''}. Use ajuda.`);
}
