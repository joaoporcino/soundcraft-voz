import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationState } from '../src/conversation-state.js';

test('conversas mantêm gerações independentes, e um envio invalida somente mesmo controle', () => {
  const state = createConversationState();
  const a = state.begin('a'), b = state.begin('b'), c = state.begin('c');
  const first = state.propose('a', { channel: 1, action: 'mute' }, a);
  const conflict = state.propose('b', { channel: 1, action: 'unmute' }, b);
  const distinct = state.propose('c', { channel: 1, action: 'level', db: -5 }, c);
  const firstItem = state.take(first).item;
  assert.equal(state.markAttempt(firstItem), true);
  assert.equal(state.take(conflict).status, 'stale');
  assert.equal(state.take(distinct).status, 'ready');
});

test('cancelamento e revogação descartam resultados tardios sem afetar outra entrada', () => {
  const state = createConversationState();
  const a = state.begin('a'), b = state.begin('b');
  state.invalidate('a');
  assert.equal(state.propose('a', { channel: 2, action: 'mute' }, a), null);
  assert.ok(state.propose('b', { channel: 2, action: 'mute' }, b));
  state.invalidateAll();
  assert.equal(state.current('b', b), false);
});
