import { selectResponseDestination } from './response-routing.js';

/** In-memory simulation only: no transport, synthesizer, audio device or mixer adapter. */
export function createSimulatedResponseQueue({ maxItems = 32 } = {}) {
  if (!Number.isSafeInteger(maxItems) || maxItems < 1) throw new RangeError('Limite de fila inválido.');
  let state = { context: undefined, paLimitDb: undefined, returns: new Map() };
  let stopped = false;
  let active = null;
  let nextId = 1;
  const pending = [];
  const events = [];

  function route(item) {
    return selectResponseDestination({ context: state.context, paLimitDb: state.paLimitDb,
      returnPath: state.returns.get(item.recipientId) });
  }

  function sameDestination(a, b) {
    return a.destination === b.destination && a.returnId === b.returnId && a.maxLevelDb === b.maxLevelDb;
  }

  function event(type, item, extra = {}) {
    events.push({ type, id: item.id, recipientId: item.recipientId, ...extra });
    if (events.length > 512) events.shift();
  }

  function advance() {
    while (!stopped && !active && pending.length) {
      const item = pending.shift();
      const destination = route(item);
      if (destination.destination === 'terminal') {
        event('terminal', item, { text: item.text, reason: destination.reason });
      } else {
        active = { ...item, destination };
        event('started', item, { destination: { ...destination } });
      }
    }
  }

  function enqueue({ recipientId, text } = {}) {
    if (stopped) throw new Error('Fila encerrada.');
    if (typeof recipientId !== 'string' || !recipientId.trim() || recipientId.length > 256 ||
        typeof text !== 'string' || !text.trim() || text.length > 10000) throw new TypeError('Destinatário ou texto inválido.');
    if (pending.length + Number(active !== null) >= maxItems) throw new Error('Fila de respostas cheia.');
    const item = { id: nextId++, recipientId, text };
    pending.push(item);
    advance();
    return item.id;
  }

  function updateState({ context, paLimitDb, returns = {} } = {}) {
    if (stopped) throw new Error('Fila encerrada.');
    if (!returns || typeof returns !== 'object' || Array.isArray(returns)) throw new TypeError('Vínculos inválidos.');
    const paths = new Map();
    for (const [recipientId, value] of Object.entries(returns)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Vínculo inválido.');
      paths.set(recipientId, { id: value.id, confirmed: value.confirmed, exclusive: value.exclusive, available: value.available });
    }
    state = { context, paLimitDb, returns: paths };
    if (active && !sameDestination(active.destination, route(active))) {
      event('cancelled', active, { reason: 'destination-changed' });
      active = null;
    }
    advance();
  }

  function complete(id, { failed = false } = {}) {
    if (!active || active.id !== id) return false;
    if (typeof failed !== 'boolean') throw new TypeError('Estado de falha inválido.');
    event(failed ? 'failed' : 'finished', active);
    active = null;
    advance();
    return true;
  }

  function cancel(id) {
    if (active?.id === id) {
      event('cancelled', active, { reason: 'requested' });
      active = null;
      advance();
      return true;
    }
    const index = pending.findIndex(item => item.id === id);
    if (index < 0) return false;
    event('cancelled', pending.splice(index, 1)[0], { reason: 'requested' });
    return true;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (active) event('cancelled', active, { reason: 'stopped' });
    active = null;
    for (const item of pending.splice(0)) event('cancelled', item, { reason: 'stopped' });
  }

  function cancelAll(reason = 'context-changed') {
    if (active) event('cancelled', active, { reason });
    active = null;
    for (const item of pending.splice(0)) event('cancelled', item, { reason });
  }

  function snapshot() {
    return { stopped, active: active && { id: active.id, recipientId: active.recipientId, destination: { ...active.destination } },
      pending: pending.map(({ id, recipientId }) => ({ id, recipientId })),
      events: events.map(item => ({ ...item, ...(item.destination ? { destination: { ...item.destination } } : {}) })) };
  }

  return Object.freeze({ enqueue, updateState, complete, cancel, cancelAll, stop, snapshot });
}
