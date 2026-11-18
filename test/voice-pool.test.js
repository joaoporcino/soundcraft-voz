import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoicePool } from '../src/voice-pool.js';

test('workers distintos recebem configurações explícitas e capturam em paralelo', async () => {
  const waiting = new Map(), created = [];
  const pool = createVoicePool({ configs: { a: { channel: 1 }, b: { channel: 2 } },
    createWorker: (config, input) => {
      created.push([input, config.channel]);
      return { state: 'ready', start: async () => {}, close: async () => {},
        transcribe: () => new Promise(resolve => waiting.set(input, resolve)) };
    } });
  await Promise.all([pool.start('a'), pool.start('b')]);
  const a = pool.transcribe('a'), b = pool.transcribe('b');
  await new Promise(resolve => globalThis.setImmediate(resolve));
  assert.deepEqual(created, [['a', 1], ['b', 2]]);
  waiting.get('b')('texto B'); waiting.get('a')('texto A');
  assert.deepEqual(await Promise.all([a, b]), ['texto A', 'texto B']);
  await pool.stop();
  assert.throws(() => pool.start('a'), /encerrado/);
});

test('recusa entrada desconhecida e limite sem iniciar workers adicionais', async () => {
  const pool = createVoicePool({ configs: { a: {}, b: {} }, maxInputs: 1,
    createWorker: () => ({ state: 'ready', start: async () => {}, close: async () => {}, transcribe: async () => '' }) });
  assert.throws(() => pool.start('z'), /não configurada/);
  await pool.start('a');
  assert.throws(() => pool.start('b'), /Limite/);
  await pool.stop();
});

test('status lista entradas sem iniciar workers e informa falha apenas da origem afetada', async () => {
  let created = 0;
  const pool = createVoicePool({ configs: { principal: {}, cantor: {}, coral: {} },
    createWorker: (_config, inputId) => {
      created++;
      return { state: 'ready', start: async () => { if (inputId === 'coral') throw new Error('Dispositivo indisponível'); },
        close: async () => {}, transcribe: async () => '' };
    } });
  assert.deepEqual(pool.getStatuses(), [
    { inputId: 'principal', state: 'idle', error: null },
    { inputId: 'cantor', state: 'idle', error: null },
    { inputId: 'coral', state: 'idle', error: null },
  ]);
  assert.equal(created, 0);
  await pool.start('cantor');
  await assert.rejects(pool.start('coral'), /Dispositivo indisponível/);
  assert.deepEqual(pool.getStatuses(), [
    { inputId: 'principal', state: 'idle', error: null },
    { inputId: 'cantor', state: 'ready', error: null },
    { inputId: 'coral', state: 'failed', error: 'Dispositivo indisponível' },
  ]);
  assert.deepEqual(pool.getStatus(), { state: 'idle', error: null });
  await pool.stop();
});
