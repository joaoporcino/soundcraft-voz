import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

/** Content token for the exact team/session context reviewed by the operator. */
export function teamSessionRevision(operation, context) {
  if (typeof operation !== 'string' || !operation || !context || typeof context !== 'object' || Array.isArray(context)) {
    throw new TypeError('Contexto de revisão de equipe inválido');
  }
  return createHash('sha256').update(JSON.stringify(['team-session-v1', operation, canonical(context)])).digest('hex');
}

export function assertTeamSessionRevision(operation, context, expected) {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected) ||
      teamSessionRevision(operation, context) !== expected) {
    throw new Error('Equipe ou formação alterada desde a revisão');
  }
}
