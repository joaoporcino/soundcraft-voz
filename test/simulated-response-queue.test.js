import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulatedResponseQueue } from '../src/simulated-response-queue.js';

const pathFor = id => ({ id, confirmed: true, exclusive: true, available: true });
const setup = (context = 'ensaio') => {
  const queue = createSimulatedResponseQueue();
  queue.updateState({ context, paLimitDb: -20, returns: { ana: pathFor('aux-3'), joao: pathFor('aux-5') } });
  return queue;
};

test('serializa uma saída e escolhe o retorno de cada destinatário no início', () => {
  const queue = setup();
  const ana = queue.enqueue({ recipientId: 'ana', text: 'Olá Ana' });
  const joao = queue.enqueue({ recipientId: 'joao', text: 'Olá João' });
  assert.equal(queue.snapshot().active.destination.returnId, 'aux-3');
  assert.deepEqual(queue.snapshot().pending, [{ id: joao, recipientId: 'joao' }]);
  assert.equal(queue.complete(ana), true);
  assert.equal(queue.snapshot().active.destination.returnId, 'aux-5');
  assert.equal(queue.complete(joao), true);
  assert.deepEqual(queue.snapshot().events.map(e => [e.type, e.id]),
    [['started', ana], ['finished', ana], ['started', joao], ['finished', joao]]);
});

test('reavalia item pendente após passar de ensaio para culto, sem usar PA', () => {
  const queue = setup();
  const ana = queue.enqueue({ recipientId: 'ana', text: 'Primeira' });
  const joao = queue.enqueue({ recipientId: 'joao', text: 'Segunda' });
  queue.updateState({ context: 'culto', paLimitDb: -20, returns: { ana: pathFor('aux-3') } });
  assert.equal(queue.complete(ana), true);
  assert.deepEqual(queue.snapshot().events.at(-1), { type: 'terminal', id: joao, recipientId: 'joao',
    text: 'Segunda', reason: 'individual-return-unavailable' });
  assert.equal(queue.snapshot().events.some(e => e.destination?.destination === 'pa'), false);
});

test('cancela PA ativo ao mudar para culto e não repete resposta', () => {
  const queue = createSimulatedResponseQueue();
  queue.updateState({ context: 'ensaio', paLimitDb: -20 });
  const id = queue.enqueue({ recipientId: 'ana', text: 'Resposta' });
  assert.equal(queue.snapshot().active.destination.destination, 'pa');
  queue.updateState({ context: 'culto', paLimitDb: -20 });
  assert.equal(queue.snapshot().active, null);
  assert.equal(queue.complete(id), false);
  assert.deepEqual(queue.snapshot().events.map(e => e.type), ['started', 'cancelled']);
});

test('vínculo atualizado é usado para item pendente e invalida retorno ativo alterado', () => {
  const queue = setup();
  const ana = queue.enqueue({ recipientId: 'ana', text: 'Primeira' });
  const joao = queue.enqueue({ recipientId: 'joao', text: 'Segunda' });
  queue.updateState({ context: 'passagem', paLimitDb: -20,
    returns: { ana: { ...pathFor('aux-3'), available: false }, joao: pathFor('aux-7') } });
  const current = queue.snapshot();
  assert.equal(current.events.find(e => e.id === ana && e.type === 'cancelled').reason, 'destination-changed');
  assert.equal(current.active.id, joao);
  assert.equal(current.active.destination.returnId, 'aux-7');
});

test('limite, falha, cancelamento e parada são explícitos e sem repetição', () => {
  const queue = createSimulatedResponseQueue({ maxItems: 2 });
  queue.updateState({ context: 'culto', returns: { ana: pathFor('a'), joao: pathFor('b') } });
  const first = queue.enqueue({ recipientId: 'ana', text: 'A' });
  const second = queue.enqueue({ recipientId: 'joao', text: 'B' });
  assert.throws(() => queue.enqueue({ recipientId: 'ana', text: 'C' }), /cheia/);
  assert.equal(queue.cancel(second), true);
  const third = queue.enqueue({ recipientId: 'joao', text: 'C' });
  assert.equal(queue.complete(first, { failed: true }), true);
  assert.equal(queue.snapshot().active.id, third);
  queue.stop();
  assert.equal(queue.complete(third), false);
  assert.throws(() => queue.enqueue({ recipientId: 'ana', text: 'D' }), /encerrada/);
  assert.deepEqual(queue.snapshot().events.map(e => [e.type, e.id]),
    [['started', first], ['cancelled', second], ['failed', first], ['started', third], ['cancelled', third]]);
});

test('estado e resultados são cópias e limite ausente mantém resposta no terminal', () => {
  const queue = setup();
  const first = queue.enqueue({ recipientId: 'ana', text: 'A' });
  const pending = queue.enqueue({ recipientId: 'joao', text: 'B' });
  const links = { ana: pathFor('aux-3'), joao: pathFor('aux-5') };
  queue.updateState({ context: 'ensaio', returns: links });
  links.joao.id = 'alterado';
  queue.snapshot().active.destination.returnId = 'alterado';
  queue.complete(first);
  assert.equal(queue.snapshot().active.destination.returnId, 'aux-5');
  queue.complete(pending);
  queue.enqueue({ recipientId: 'sem-retorno', text: 'Texto' });
  assert.equal(queue.snapshot().events.at(-1).reason, 'pa-limit-unavailable');
});
