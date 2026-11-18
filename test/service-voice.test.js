import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, URL } from 'node:url';
import { createServiceVoice } from '../src/service-voice.js';
import { VoiceWorker } from '../src/voice-worker.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeWorker() {
  return {
    state: 'idle', starts: 0, calls: 0, closes: 0,
    async start() { this.starts++; this.state = 'ready'; },
    async transcribe() { this.calls++; return 'mesa, mute canal 1'; },
    async close() { this.closes++; this.state = 'closed'; },
  };
}

test('controlador reutiliza processo real com protocolo simulado', async () => {
  const script = fileURLToPath(new URL('../fixtures/voice-worker-fake.js', import.meta.url));
  const worker = new VoiceWorker({ python: process.execPath, args: [script, 'normal'], startupTimeoutMs: 5000, requestTimeoutMs: 5000 });
  const voice = createServiceVoice({ createWorker: () => worker });
  try {
    await voice.start();
    assert.equal(await voice.transcribe(), 'texto-1');
    assert.equal(await voice.transcribe(), 'texto-2');
  } finally { await voice.stop(); }
  assert.equal(worker.state, 'closed');
});

test('inicialização explícita reutiliza processo e captura apenas sob demanda', async () => {
  const worker = fakeWorker();
  let created = 0;
  const voice = createServiceVoice({ createWorker: () => { created++; return worker; } });
  assert.equal(created, 0);
  await assert.rejects(voice.transcribe(), /não está pronto/);
  await voice.start();
  await voice.start();
  assert.equal(await voice.transcribe(), 'mesa, mute canal 1');
  assert.equal(await voice.transcribe(), 'mesa, mute canal 1');
  assert.equal(created, 1);
  assert.equal(worker.starts, 1);
  assert.equal(worker.calls, 2);
  assert.equal(voice.getStatus().state, 'ready');
  await voice.stop();
  assert.equal(worker.closes, 1);
  await assert.rejects(voice.start(), /encerrado/);
});

test('recusa transcrição concorrente, sem criar fila', async () => {
  const worker = fakeWorker();
  const pending = deferred();
  worker.transcribe = () => { worker.calls++; return pending.promise; };
  const voice = createServiceVoice({ createWorker: () => worker });
  await voice.start();
  const first = voice.transcribe();
  await assert.rejects(voice.transcribe(), /não está pronto/);
  pending.resolve('primeira');
  assert.equal(await first, 'primeira');
  assert.equal(worker.calls, 1);
  await voice.stop();
});

test('erro recuperável permite tentativa manual e não repete captura', async () => {
  const worker = fakeWorker();
  worker.transcribe = async () => { worker.calls++; if (worker.calls === 1) throw new Error('dispositivo indisponível'); return 'nova'; };
  const voice = createServiceVoice({ createWorker: () => worker });
  await voice.start();
  await assert.rejects(voice.transcribe(), /dispositivo indisponível/);
  assert.deepEqual(voice.getStatus(), { state: 'ready', error: 'dispositivo indisponível' });
  assert.equal(worker.calls, 1);
  assert.equal(await voice.transcribe(), 'nova');
  assert.equal(worker.calls, 2);
  await voice.stop();
});

test('falha fatal exige nova inicialização explícita e não repete pedido', async () => {
  const failed = fakeWorker();
  failed.transcribe = async () => { failed.calls++; failed.state = 'failed'; throw new Error('processo encerrado'); };
  const replacement = fakeWorker();
  let created = 0;
  const voice = createServiceVoice({ createWorker: () => (++created === 1 ? failed : replacement) });
  await voice.start();
  await assert.rejects(voice.transcribe(), /processo encerrado/);
  assert.equal(voice.getStatus().state, 'failed');
  assert.equal(created, 1);
  await assert.rejects(voice.transcribe(), /não está pronto/);
  await voice.start();
  assert.equal(created, 2);
  assert.equal(replacement.calls, 0);
  assert.equal(await voice.transcribe(), 'mesa, mute canal 1');
  await voice.stop();
});

test('erro fatal de dispositivo no protocolo exige reinício explícito sem repetir captura', async () => {
  const script = fileURLToPath(new URL('../fixtures/voice-worker-fake.js', import.meta.url));
  let created = 0;
  const voice = createServiceVoice({ createWorker: () => new VoiceWorker({ python: process.execPath,
    args: [script, ++created === 1 ? 'device-fatal' : 'normal'], onStderr: () => {}, startupTimeoutMs: 5000, requestTimeoutMs: 5000 }) });
  try {
    await voice.start();
    await assert.rejects(voice.transcribe(), /dispositivo alterado/);
    assert.equal(voice.getStatus().state, 'failed');
    await assert.rejects(voice.transcribe(), /não está pronto/);
    assert.equal(created, 1);
    await voice.start();
    assert.equal(created, 2);
    assert.equal(await voice.transcribe(), 'texto-1');
  } finally { await voice.stop(); }
});

test('retorno de índice para outro dispositivo exige apresentação e aceite explícito da identidade atual', async () => {
  const identities = [[0, 'Mic A', 0, 2], [0, 'Mic B', 0, 2], [0, 'Mic C', 0, 2], [0, 'Mic C', 0, 2], [0, 'Mic C', 0, 2]];
  let created = 0, captures = 0;
  const voice = createServiceVoice({ createWorker: () => {
    const worker = fakeWorker();
    worker.deviceIdentity = identities[created++];
    worker.transcribe = async () => { captures++; worker.state = 'failed'; throw new Error('USB removido'); };
    return worker;
  } });
  try {
    await voice.start();
    await assert.rejects(voice.transcribe(), /USB removido/);
    await assert.rejects(voice.start(), /Dispositivo mudou/);
    assert.deepEqual(voice.getStatus().deviceIdentity, identities[0]);
    assert.deepEqual(voice.getStatus().candidateIdentity, identities[1]);
    const reviewB = voice.getStatus().candidateRevision;
    assert.equal(typeof reviewB, 'string');
    await assert.rejects(voice.start({ acceptDeviceRevision: reviewB }), /Dispositivo mudou/);
    assert.deepEqual(voice.getStatus().candidateIdentity, identities[2]);
    assert.notEqual(voice.getStatus().candidateRevision, reviewB);
    await assert.rejects(voice.start({ acceptDeviceRevision: reviewB }), /Dispositivo mudou/);
    assert.equal(captures, 1);
    await voice.start({ acceptDeviceRevision: voice.getStatus().candidateRevision });
    assert.deepEqual(voice.getStatus().deviceIdentity, identities[4]);
    assert.equal(voice.getStatus().state, 'ready');
    assert.equal(captures, 1);
  } finally { await voice.stop(); }
});

test('encerramento cancela captura e descarta resultado tardio', async () => {
  const worker = fakeWorker();
  const pending = deferred();
  worker.transcribe = () => pending.promise;
  const voice = createServiceVoice({ createWorker: () => worker });
  await voice.start();
  const capture = voice.transcribe();
  await Promise.resolve();
  await voice.stop();
  await assert.rejects(capture, /cancelada/);
  pending.resolve('resultado tardio');
  assert.equal(voice.getStatus().state, 'stopped');
});

test('encerramento imediato impede início tardio da gravação', async () => {
  const worker = fakeWorker();
  const voice = createServiceVoice({ createWorker: () => worker });
  await voice.start();
  const capture = voice.transcribe();
  await voice.stop();
  await assert.rejects(capture, /cancelada/);
  assert.equal(worker.calls, 0);
});

test('encerramento cancela inicialização e falha espontânea é visível', async () => {
  const worker = fakeWorker();
  const pending = deferred();
  worker.start = () => pending.promise;
  const voice = createServiceVoice({ createWorker: () => worker });
  const started = voice.start();
  await Promise.resolve();
  await voice.stop();
  await assert.rejects(started, /cancelada/);
  pending.resolve();
  assert.equal(voice.getStatus().state, 'stopped');

  const otherWorker = fakeWorker();
  const other = createServiceVoice({ createWorker: () => otherWorker });
  await other.start();
  otherWorker.state = 'failed';
  assert.equal(other.getStatus().state, 'failed');
  await other.stop();
});
