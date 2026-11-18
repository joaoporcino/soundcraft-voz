import { createServiceVoice } from './service-voice.js';

// One explicitly started controller per configured input. The pool itself
// never chooses a device or starts capture; callers enforce authorization.
export function createVoicePool({ configs, createVoice = options => createServiceVoice(options), createWorker, maxInputs = 4 } = {}) {
  if (!configs || typeof configs !== 'object' || Array.isArray(configs) || typeof createWorker !== 'function') throw new TypeError('Configuração de entradas inválida');
  if (!Number.isSafeInteger(maxInputs) || maxInputs < 1) throw new TypeError('Limite de entradas inválido');
  const controllers = new Map();
  let stopped = false;
  let stopping;
  function controller(inputId, create = false) {
    if (typeof inputId !== 'string' || !Object.hasOwn(configs, inputId)) throw new Error('Entrada de áudio não configurada');
    if (stopped) throw new Error('Controle de voz encerrado');
    if (!controllers.has(inputId) && create) {
      if (controllers.size >= maxInputs) throw new Error('Limite de workers de voz atingido');
      controllers.set(inputId, createVoice({ createWorker: () => createWorker(configs[inputId], inputId) }));
    }
    const found = controllers.get(inputId);
    if (!found) throw new Error('Entrada de voz não iniciada');
    return found;
  }
  function getStatus(inputId = 'principal') {
    if (!Object.hasOwn(configs, inputId)) return { state: 'unconfigured', error: null };
    return controllers.get(inputId)?.getStatus() ?? { state: 'idle', error: null };
  }
  return Object.freeze({
    start: (inputId = 'principal', options) => controller(inputId, true).start(options),
    transcribe: (inputId = 'principal') => controller(inputId).transcribe(),
    getStatus,
    getStatuses: () => Object.keys(configs).map(inputId => ({ inputId, ...getStatus(inputId) })),
    stop() {
      if (stopping) return stopping;
      stopped = true;
      stopping = Promise.allSettled([...controllers.values()].map(voice => Promise.resolve().then(() => voice.stop())))
        .then(results => {
          const failed = results.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
        });
      return stopping;
    },
  });
}
