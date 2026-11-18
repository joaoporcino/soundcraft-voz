import { VoiceWorker } from './voice-worker.js';
import { randomUUID } from 'node:crypto';

/** Manual, single-input voice lifecycle; no capture starts on construction. */
export function createServiceVoice({ createWorker = () => new VoiceWorker() } = {}) {
  if (typeof createWorker !== 'function') throw new TypeError('createWorker deve ser uma função.');
  let worker;
  let state = 'idle';
  let error = null;
  let epoch = 0;
  let cancelActive;
  let startPromise;
  let stopPromise;
  let referenceIdentity = null;
  let candidateIdentity = null;
  let candidateRevision = null;

  function refresh() {
    if (worker?.state === 'failed' && ['ready', 'capturing'].includes(state)) {
      state = 'failed';
      error ??= 'Worker de voz encerrou inesperadamente.';
    }
  }

  function cancellable(operation) {
    const cancelled = new Promise((_, reject) => {
      cancelActive = () => reject(new Error('Operação de voz cancelada.'));
    });
    return Promise.race([operation, cancelled]);
  }

  async function start({ acceptDeviceRevision = null } = {}) {
    refresh();
    if (state === 'ready') return;
    if (state === 'starting') return startPromise;
    if (state === 'capturing') throw new Error('Transcrição em andamento.');
    if (state === 'stopped' || state === 'stopping') throw new Error('Controle de voz encerrado.');
    const generation = ++epoch;
    state = 'starting';
    error = null;
    startPromise = (async () => {
      try {
        if (worker) await worker.close();
        if (generation !== epoch) throw new Error('Operação de voz cancelada.');
        const candidate = createWorker();
        if (!candidate || typeof candidate.start !== 'function' || typeof candidate.transcribe !== 'function' || typeof candidate.close !== 'function') {
          throw new TypeError('Worker de voz inválido.');
        }
        worker = candidate;
        await cancellable(Promise.resolve().then(() => {
          if (generation !== epoch) throw new Error('Operação de voz cancelada.');
          return worker.start();
        }));
        if (generation !== epoch) throw new Error('Operação de voz cancelada.');
        const identity = worker.deviceIdentity ?? null;
        if (referenceIdentity !== null && JSON.stringify(identity) !== JSON.stringify(referenceIdentity) &&
            (typeof acceptDeviceRevision !== 'string' || candidateRevision === null || acceptDeviceRevision !== candidateRevision ||
              candidateIdentity === null || JSON.stringify(identity) !== JSON.stringify(candidateIdentity))) {
          candidateIdentity = identity;
          candidateRevision = identity === null ? null : randomUUID();
          await worker.close();
          throw new Error('Dispositivo mudou; confira a identidade e aceite explicitamente antes de reiniciar.');
        }
        if (referenceIdentity !== null && identity === null) {
          await worker.close();
          throw new Error('Identidade do dispositivo indisponível.');
        }
        if (identity !== null) referenceIdentity = [...identity];
        candidateIdentity = null;
        candidateRevision = null;
        state = 'ready';
      } catch (cause) {
        if (generation === epoch) { state = 'failed'; error = cause.message; }
        throw cause;
      } finally {
        if (generation === epoch) cancelActive = undefined;
      }
    })();
    return startPromise;
  }

  async function transcribe() {
    refresh();
    if (state !== 'ready') throw new Error('Worker de voz não está pronto.');
    state = 'capturing';
    const generation = ++epoch;
    try {
      const text = await cancellable(Promise.resolve().then(() => {
        if (generation !== epoch) throw new Error('Operação de voz cancelada.');
        return worker.transcribe();
      }));
      if (generation !== epoch) throw new Error('Operação de voz cancelada.');
      if (typeof text !== 'string') throw new Error('Transcrição inválida.');
      state = 'ready';
      error = null;
      return text;
    } catch (cause) {
      if (generation === epoch) {
        state = worker?.state === 'ready' ? 'ready' : 'failed';
        error = cause.message;
      }
      throw cause;
    } finally {
      if (generation === epoch) cancelActive = undefined;
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    ++epoch;
    state = 'stopping';
    cancelActive?.();
    cancelActive = undefined;
    stopPromise = Promise.resolve().then(() => worker?.close()).finally(() => { state = 'stopped'; });
    return stopPromise;
  }

  function getStatus() {
    refresh();
    return { state, error, ...(referenceIdentity === null ? {} : { deviceIdentity: [...referenceIdentity] }),
      ...(candidateIdentity === null ? {} : { candidateIdentity: [...candidateIdentity], candidateRevision }) };
  }

  return Object.freeze({ start, transcribe, stop, getStatus });
}
