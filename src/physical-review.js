import { createHash } from 'node:crypto';

const fields = Object.freeze({
  sessao: ['id', 'name'],
  dispositivo: ['id', 'name', 'type'],
  equipamento: ['id', 'name', 'kind', 'color', 'wireless', 'capsule', 'model'],
  pessoa: ['id', 'name'],
  retorno: ['id', 'sessionId', 'aux', 'confirmedPeople'],
  ponto: ['id', 'type', 'label', 'direction', 'deviceId', 'equipmentId', 'personId', 'monitorReturnId', 'channel'],
});

/** Revision token for physical registry selections; a content token, not authentication. */
export function physicalRevision(type, item) {
  const keys = fields[type];
  if (!keys || !item || keys.some(key => !Object.hasOwn(item, key))) throw new TypeError(`Registro de revisão ${type} inválido`);
  const entries = keys.map(key => [key, item[key]]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return createHash('sha256').update(JSON.stringify([type, entries])).digest('hex');
}
