import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResponseDestination } from '../src/response-routing.js';

const individual = { id: 'aux-1', confirmed: true, exclusive: true, available: true };

test('retorno confirmado, exclusivo e disponível tem prioridade em cada contexto', () => {
  for (const context of ['ensaio', 'passagem', 'culto']) {
    assert.deepEqual(selectResponseDestination({ context, returnPath: individual, paLimitDb: -20 }),
      { destination: 'individual-return', returnId: 'aux-1' });
  }
});

test('fallback ao PA requer ensaio ou passagem e limite explícito válido', () => {
  for (const returnPath of [undefined, { ...individual, confirmed: false }, { ...individual, exclusive: false },
    { ...individual, available: false }, { ...individual, available: null }, { ...individual, id: '' }]) {
    for (const context of ['ensaio', 'passagem']) {
      assert.deepEqual(selectResponseDestination({ context, returnPath, paLimitDb: -20 }),
        { destination: 'pa', maxLevelDb: -20, reason: 'individual-return-unavailable' });
    }
  }
  for (const paLimitDb of [undefined, null, NaN, Infinity, 1, '-20']) {
    assert.equal(selectResponseDestination({ context: 'passagem', paLimitDb }).destination, 'terminal');
  }
});

test('culto e contexto desconhecido nunca usam o PA', () => {
  assert.deepEqual(selectResponseDestination({ context: 'culto', paLimitDb: -20 }),
    { destination: 'terminal', reason: 'individual-return-unavailable' });
  for (const context of [undefined, 'pausado', 'teste', 'Passagem']) {
    assert.deepEqual(selectResponseDestination({ context, returnPath: individual, paLimitDb: -20 }),
      { destination: 'terminal', reason: 'unknown-context' });
  }
});
