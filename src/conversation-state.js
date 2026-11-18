import { randomUUID } from 'node:crypto';

// Tracks ownership and a version for each independently controlled mixer parameter.
// A send attempt advances the version even when transport reports failure: its
// real effect may be unknown and an older proposal must not be replayed.
export function createConversationState() {
  const pending = new Map();
  const generations = new Map();
  const revisions = new Map();
  let epoch = 0;
  let sequence = 0;

  function keyFor(command) {
    if (!command || !Number.isInteger(command.channel) || command.channel < 1 || command.channel > 24) throw new Error('Canal inválido');
    if (!['mute', 'unmute', 'level'].includes(command.action)) throw new Error('Ação inválida');
    return `${command.channel}:${command.action === 'level' ? 'level' : 'mute'}`;
  }
  function invalidate(inputId) {
    pending.delete(inputId);
    generations.set(inputId, (generations.get(inputId) ?? 0) + 1);
  }
  function invalidateAll() { pending.clear(); epoch += 1; }
  function begin(inputId) {
    invalidate(inputId);
    return { epoch, generation: generations.get(inputId), sequence };
  }
  function current(inputId, token) {
    return token?.epoch === epoch && token.generation === generations.get(inputId);
  }
  function propose(inputId, command, token, metadata = {}) {
    if (!current(inputId, token)) return null;
    const key = keyFor(command);
    const revision = revisions.get(key) ?? 0;
    const item = { id: randomUUID(), inputId, command, key, revision, stale: revision > token.sequence, token, ...metadata };
    pending.set(inputId, item);
    return item.id;
  }
  function take(id) {
    for (const [inputId, item] of pending) {
      if (item.id !== id) continue;
      pending.delete(inputId);
      if (item.stale || !current(inputId, item.token) || item.revision !== (revisions.get(item.key) ?? 0)) return { status: 'stale' };
      return { status: 'ready', item };
    }
    return { status: 'not-found' };
  }
  function markAttempt(item) {
    if (!current(item.inputId, item.token) || item.revision !== (revisions.get(item.key) ?? 0)) return false;
    revisions.set(item.key, ++sequence);
    return true;
  }
  function invalidateProposal(id) {
    for (const [inputId, item] of pending) if (item.id === id) { invalidate(inputId); return inputId; }
    return null;
  }
  function version(inputId) { return `${epoch}:${generations.get(inputId) ?? 0}`; }
  return Object.freeze({ begin, current, invalidate, invalidateAll, invalidateProposal, propose, take, markAttempt, version });
}
