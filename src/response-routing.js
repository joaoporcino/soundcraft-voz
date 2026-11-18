/** Selects a proposed destination without playing audio or changing mixer routing. */
export function selectResponseDestination({ context, returnPath, paLimitDb } = {}) {
  if (!['ensaio', 'passagem', 'culto'].includes(context)) {
    return { destination: 'terminal', reason: 'unknown-context' };
  }

  if (returnPath && typeof returnPath.id === 'string' && returnPath.id.trim() &&
      returnPath.confirmed === true && returnPath.exclusive === true && returnPath.available === true) {
    return { destination: 'individual-return', returnId: returnPath.id };
  }

  if (context === 'culto') return { destination: 'terminal', reason: 'individual-return-unavailable' };
  if (typeof paLimitDb !== 'number' || !Number.isFinite(paLimitDb) || paLimitDb > 0) {
    return { destination: 'terminal', reason: 'pa-limit-unavailable' };
  }
  return { destination: 'pa', maxLevelDb: paLimitDb, reason: 'individual-return-unavailable' };
}
