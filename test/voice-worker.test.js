import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { VoiceWorker } from '../src/voice-worker.js';

const fake = fileURLToPath(new URL('../fixtures/voice-worker-fake.js', import.meta.url));
const createWorker = (mode = 'normal', options = {}) => new VoiceWorker({
  python: process.execPath,
  args: [fake, mode],
  startupTimeoutMs: 5000,
  requestTimeoutMs: 2000,
  ...options,
});

test('usa um processo persistente em pedidos consecutivos e fecha por EOF', async () => {
  const worker = createWorker();
  await worker.start();
  const child = worker.child;
  assert.equal(await worker.transcribe(), 'texto-1');
  assert.equal(await worker.transcribe(), 'texto-2');
  const exited = once(child, 'exit');
  await worker.close();
  await exited;
  assert.equal(worker.state, 'closed');
});

test('passa opções de modelo e dispositivo ao worker', async () => {
  let passedArgs;
  const worker = new VoiceWorker({
    python: process.execPath,
    model: 'base',
    device: 0,
    channel: 2,
    descrever: true,
    fimPorSilencio: true,
    spawn: (command, args, options) => {
      passedArgs = args;
      return spawn(command, [fake, 'normal'], options);
    },
    startupTimeoutMs: 5000,
  });
  await worker.start();
  assert.ok(passedArgs[0].endsWith('transcribe.py'));
  assert.deepEqual(passedArgs.slice(1), [
    '--worker', '--model', 'base', '--device', '0', '--channel', '2', '--descrever', '--fim-por-silencio',
  ]);
  await worker.close();
});

test('erro de um pedido não encerra o worker nem impede o próximo', async () => {
  const worker = createWorker('request-error');
  await worker.start();
  await assert.rejects(worker.transcribe(), /falha simulada/);
  assert.equal(await worker.transcribe(), 'texto-2');
  await worker.close();
});

test('recusa pedidos simultâneos', async () => {
  const worker = createWorker('delay');
  await worker.start();
  const first = worker.transcribe();
  await assert.rejects(worker.transcribe(), /em andamento/);
  assert.equal(await first, 'atrasada');
  await worker.close();
});

test('timeout encerra o processo e não reenvia o pedido', async () => {
  const worker = createWorker('timeout', { requestTimeoutMs: 80 });
  await worker.start();
  await assert.rejects(worker.transcribe(), /excedeu/);
  assert.equal(worker.state, 'failed');
  await assert.rejects(worker.transcribe(), /não está pronto/);
  await assert.rejects(worker.start(), /falhou/);
  await worker.close();
});

test('mensagem JSON nula falha com erro controlado', async () => {
  const worker = createWorker('null-response');
  await worker.start();
  await assert.rejects(worker.transcribe(), /Mensagem inválida/);
  await worker.close();
});

test('fim inesperado do processo rejeita o pedido', async () => {
  const worker = createWorker('crash');
  await worker.start();
  await assert.rejects(worker.transcribe(), /encerrou inesperadamente/);
  await worker.close();
});
