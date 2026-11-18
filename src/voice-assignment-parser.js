const COLOR_ALIASES = Object.freeze({ amarela: 'amarelo', branca: 'branco', preta: 'preto', vermelha: 'vermelho',
  roxa: 'roxo', laranja: 'laranja', cinza: 'cinza', azul: 'azul', verde: 'verde' });
const norm = value => value.normalize('NFC').trim().toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ');
const colorKey = value => {
  const key = norm(value);
  return Object.hasOwn(COLOR_ALIASES, key) ? COLOR_ALIASES[key] : key;
};
const validId = id => Number.isSafeInteger(id) && id > 0;

function candidateChannel(equipmentId, sessionId, points, links) {
  if (points.length > 1000 || links.length > 5000) return { reason: 'graph_too_large' };
  const pointMap = new Map();
  for (const point of points) {
    if (!point || !validId(point.id) || pointMap.has(point.id)) return { reason: 'invalid_graph' };
    pointMap.set(point.id, point);
  }
  const starts = points.filter(point => point.type === 'equipment' && point.equipmentId === equipmentId);
  if (starts.length !== 1) return { reason: starts.length ? 'ambiguous_equipment_path' : 'path_unknown' };
  const outgoing = new Map();
  for (const link of links) {
    if (!link || link.sessionId !== sessionId || !validId(link.fromPointId) || !pointMap.has(link.fromPointId) ||
        (link.toPointId !== null && (!validId(link.toPointId) || !pointMap.has(link.toPointId))) ||
        !['physical', 'internal', 'patch'].includes(link.kind) ||
        !['proposto', 'confirmado', 'rejeitado', 'revogado'].includes(link.status)) return { reason: 'invalid_graph' };
    if (link.status === 'rejeitado' || link.status === 'revogado') continue;
    const edges = outgoing.get(link.fromPointId) ?? [];
    edges.push(link);
    outgoing.set(link.fromPointId, edges);
  }
  const queue = [{ pointId: starts[0].id, seen: new Set(), complete: true, hasPatch: false }];
  const found = [];
  let steps = 0;
  let incomplete = false;
  while (queue.length) {
    if (++steps > 5000) return { reason: 'graph_too_complex' };
    const current = queue.pop();
    if (current.seen.has(current.pointId)) return { reason: 'path_cycle' };
    const point = pointMap.get(current.pointId);
    if (point.type === 'channel') {
      if (!Number.isInteger(point.channel) || point.channel < 1 || point.channel > 24) return { reason: 'invalid_channel' };
      found.push({ channel: point.channel, complete: current.complete, hasPatch: current.hasPatch });
      if (found.length > 1) return { reason: 'ambiguous_path' };
      continue;
    }
    const edges = outgoing.get(current.pointId) ?? [];
    if (!edges.length) { incomplete = true; continue; }
    for (const edge of edges) {
      if (edge.toPointId === null) { incomplete = true; continue; }
      const seen = new Set(current.seen); seen.add(current.pointId);
      queue.push({ pointId: edge.toPointId, seen, complete: current.complete && edge.status === 'confirmado',
        hasPatch: current.hasPatch || (edge.kind === 'patch' && edge.status === 'confirmado') });
    }
  }
  if (incomplete || found.length === 0) return { reason: 'path_incomplete' };
  if (!found[0].complete || !found[0].hasPatch) return { reason: 'patch_or_path_unconfirmed' };
  return { channel: found[0].channel };
}

/** Interpret a deliberately narrow transcription as data, never execute or persist it. */
export function analyzeVoiceAssignment(input = {}) {
  if (input?.authorized !== true) return { status: 'denied', reason: 'authorization_required' };
  const { sessionId, origin, phrase, sessions, people, equipment, points, links, assignments } = input;
  if (!validId(sessionId) || typeof origin !== 'string' || !origin.trim() || origin.length > 200 ||
      typeof phrase !== 'string' || !phrase.trim() || phrase.length > 2000) {
    return { status: 'invalid-input', reason: 'invalid_origin_session_or_phrase' };
  }
  const proposal = { sessionId, origin, phrase, personId: null, equipmentId: null, channel: null };
  const clarify = reason => ({ status: 'clarification', reason, proposal: { ...proposal }, requiresConfirmation: true });
  if (![sessions, people, equipment, points, links, assignments].every(Array.isArray)) return clarify('snapshot_incomplete');
  if (sessions.filter(session => session?.id === sessionId).length !== 1) return clarify('session_unknown_or_ambiguous');
  const normalizedPhrase = phrase.trim().replace(/^mesa\s*[,;:]\s*/iu, '');
  const equipmentFirst = /^(?:o\s+)?(?:microfone|mic)\s+([\p{L}]+)(?:\s+(sem\s+fio|com\s+fio))?\s+(?:(?:est[aá]\s+)?com|para|pertence\s+[aà])\s+(?:(?:a|o)\s+)?([\p{L}\p{M}][\p{L}\p{M} .'-]{0,100}?)[.!?]?$/iu.exec(normalizedPhrase);
  const personFirst = /^(?:(?:a|o)\s+)?([\p{L}\p{M}][\p{L}\p{M} .'-]{0,100}?)\s+(?:est[aá]\s+com|usa)\s+(?:o\s+)?(?:microfone|mic)\s+([\p{L}]+)(?:\s+(sem\s+fio|com\s+fio))?[.!?]?$/iu.exec(normalizedPhrase);
  if (!equipmentFirst && !personFirst) return clarify('unrecognized_or_ambiguous_phrase');
  const [spokenColor, spokenWireless, spokenName] = equipmentFirst
    ? [equipmentFirst[1], equipmentFirst[2], equipmentFirst[3]]
    : [personFirst[2], personFirst[3], personFirst[1]];
  const peopleMatches = people.filter(person => validId(person?.id) && typeof person.name === 'string' && norm(person.name) === norm(spokenName));
  if (peopleMatches.length !== 1) return clarify(peopleMatches.length ? 'person_ambiguous' : 'person_unknown');
  proposal.personId = peopleMatches[0].id;
  const wantedWireless = spokenWireless ? /^sem/iu.test(spokenWireless) : null;
  const candidates = equipment.filter(item => validId(item?.id) && typeof item.kind === 'string' &&
    ['microfone', 'mic'].includes(norm(item.kind)) && typeof item.color === 'string' && colorKey(item.color) === colorKey(spokenColor) &&
    (wantedWireless === null || item.wireless === null || item.wireless === undefined || item.wireless === wantedWireless));
  if (candidates.length !== 1) return clarify(candidates.length ? 'equipment_ambiguous' : 'equipment_unknown');
  if (wantedWireless !== null && typeof candidates[0].wireless !== 'boolean') return clarify('wireless_unknown');
  proposal.equipmentId = candidates[0].id;
  const path = candidateChannel(proposal.equipmentId, sessionId, points, links);
  if (!path.channel) return clarify(path.reason);
  proposal.channel = path.channel;
  if (assignments.some(item => item?.sessionId === sessionId && item.status === 'confirmado' &&
      (item.equipmentId === proposal.equipmentId || item.channel === proposal.channel))) {
    proposal.channel = null;
    return clarify('confirmed_assignment_conflict');
  }
  return { status: 'proposal', proposal: { ...proposal }, requiresConfirmation: true };
}
