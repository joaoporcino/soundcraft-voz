const PROVIDERS = Object.freeze(['none', 'gemini', 'openai', 'anthropic']);
const FIELDS = ['intent', 'target', 'action', 'value', 'relative', 'clarification'];

export class LlmProviderError extends Error {
  constructor(code) {
    super(`Interpretação indisponível: ${code}`);
    this.name = 'LlmProviderError';
    this.code = code;
  }
}

function fail(code) { throw new LlmProviderError(code); }

function validateOutput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(value, key)) ||
      !['command', 'query', 'clarify', 'unknown'].includes(value.intent) ||
      !['mute', 'unmute', 'set_level', 'adjust_level', 'set_points', 'adjust_points', 'none'].includes(value.action) ||
      (value.target !== null && (typeof value.target !== 'string' || value.target.length > 160)) ||
      (value.value !== null && (typeof value.value !== 'number' || !Number.isFinite(value.value))) ||
      typeof value.relative !== 'boolean' ||
      (value.clarification !== null && (typeof value.clarification !== 'string' || value.clarification.length > 500)) ||
      (value.intent !== 'command' && value.action !== 'none')) fail('invalid_response');
  return Object.freeze(Object.fromEntries(FIELDS.map(key => [key, value[key]])));
}

/** In-memory selection only; downstream authorization and command validation remain mandatory. */
export function createLlmProviderSelector({ adapters = {} } = {}) {
  if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)) throw new TypeError('Adaptadores inválidos.');
  const allowed = new Set(PROVIDERS.filter(name => name !== 'none'));
  if (Object.keys(adapters).some(name => !allowed.has(name))) throw new TypeError('Provedor desconhecido.');
  const registered = new Map();
  for (const [name, adapter] of Object.entries(adapters)) {
    if (!adapter || typeof adapter.interpret !== 'function') throw new TypeError('Adaptador inválido.');
    registered.set(name, adapter);
  }
  let selected = 'none';
  let generation = 0;
  function select(name) {
    if (!PROVIDERS.includes(name)) throw new TypeError('Provedor desconhecido.');
    if (selected !== name) { selected = name; generation += 1; }
    return status();
  }
  function status() {
    return { selected, available: selected !== 'none' && registered.has(selected), providers: PROVIDERS.map(name => ({
      id: name, available: name === 'none' || registered.has(name),
    })) };
  }
  async function interpret(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_input');
    if (input.consent !== true) fail('consent_required');
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000 ||
        (input.context !== undefined && (typeof input.context !== 'string' || input.context.length > 1000))) fail('invalid_input');
    const adapter = registered.get(selected);
    if (!adapter) fail('provider_unavailable');
    const currentGeneration = generation;
    let result;
    try {
      result = await adapter.interpret({ text: input.text, ...(input.context === undefined ? {} : { context: input.context }), consent: true });
    } catch { fail(currentGeneration === generation ? 'provider_failed' : 'selection_changed'); }
    if (currentGeneration !== generation) fail('selection_changed');
    try { return validateOutput(result); } catch { fail('invalid_response'); }
  }
  return Object.freeze({ select, status, interpret });
}
