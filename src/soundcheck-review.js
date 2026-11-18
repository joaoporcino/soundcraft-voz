import { createHash } from 'node:crypto';

const FIELDS = Object.freeze({
  pessoa: ['id', 'name'],
  equipamento: ['id', 'name', 'kind', 'color', 'wireless', 'capsule', 'model'],
  vinculo: ['id', 'sessionId', 'personId', 'equipmentId', 'channel', 'status'],
  substituicao: ['id', 'sessionId', 'personId', 'equipmentId', 'channel', 'status', 'entradasAssociadas'],
  retorno: ['id', 'sessionId', 'personId', 'returnId', 'status'],
  ligacao: ['id', 'sessionId', 'fromPointId', 'toPointId', 'kind', 'status', 'confirmationOrigin', 'confirmedAt'],
  voz: ['id', 'sessionId', 'phrase', 'origin', 'personId', 'equipmentId', 'channel', 'status', 'assignmentId'],
});

/** Content token for the fields being reviewed; not an authentication token. */
export function soundcheckRevision(type, item) {
  const fields = FIELDS[type];
  if (!fields || !item || fields.some(field => !Object.hasOwn(item, field))) throw new TypeError('Registro de revisão inválido');
  return createHash('sha256').update(JSON.stringify([type, ...fields.map(field => item[field])])).digest('hex');
}

export function assertSoundcheckRevision(type, item, expected) {
  if (expected === undefined) return; // Other registry operations keep their prior contract.
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || soundcheckRevision(type, item) !== expected) {
    throw new Error('Proposta alterada desde a revisão; consulte a passagem novamente');
  }
}
