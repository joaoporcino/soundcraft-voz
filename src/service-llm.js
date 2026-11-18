import { createGeminiProvider } from './gemini-provider.js';
import { createOpenAIProvider } from './openai-provider.js';
import { createAnthropicProvider } from './anthropic-provider.js';
import { createLlmProviderSelector } from './llm-provider-selector.js';
import { createLlmState, validateLlmSettings } from './llm-state.js';

/** Persist only configuration and quota; never persist secrets, consent or requests. */
export function createServiceLlm({ directory, fetchImpl = globalThis.fetch, env = process.env,
  createProvider = createGeminiProvider, factories = {}, state = createLlmState({ directory }) } = {}) {
  const factory = { gemini: createProvider, openai: createOpenAIProvider, anthropic: createAnthropicProvider, ...factories };
  let selector, selected, model, generation, currentVersion = 0;
  const keyNames = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
  function hasCredential(provider) {
    const key = keyNames[provider];
    return typeof key === 'string' && typeof env?.[key] === 'string' && env[key].trim().length > 0;
  }

  function build(row) {
    const next = createLlmProviderSelector(row.provider === 'none' ? {} : { adapters: {
      [row.provider]: factory[row.provider]({ enabled: true, model: row.model, fetchImpl, env }),
    } });
    next.select(row.provider);
    return next;
  }
  function install(row, next = build(row)) {
    selector = next; selected = row.provider; model = row.model; generation = row.generation; currentVersion += 1;
  }
  install(state.read());
  function status() {
    try {
      const row = state.read();
      const current = row.generation === generation;
      const credentialAvailable = hasCredential(selected);
      return { selected, model, available: current && row.restore_lock === 0 && credentialAvailable && selector.status().available, credentialAvailable,
        costLimit: 'not-configured', dailyLimit: row.daily_limit, used: row.used, day: row.day,
        restoreReviewRequired: row.restore_lock === 1, reloadRequired: !current };
    } catch {
      return { selected, model, available: false, credentialAvailable: false, costLimit: 'not-configured', error: 'storage_unavailable' };
    }
  }
  function configure(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['provider', 'model', 'dailyLimit'].includes(key))) throw new TypeError('Configuração de LLM inválida');
    const previous = state.read();
    const config = validateLlmSettings({ provider: input.provider, model: input.provider === 'none' ? (input.model ?? null) : input.model,
      dailyLimit: input.dailyLimit === undefined ? previous.daily_limit : input.dailyLimit });
    const next = build(config);
    const row = state.configure(config);
    install(row, next);
    return status();
  }
  function acknowledgeRestore() { const row = state.acknowledgeRestore(); install(row); return status(); }
  function getRevision() {
    try { const row = state.read(); return row.generation === generation && row.provider !== 'none' && row.restore_lock === 0 && hasCredential(selected) ? generation : null; }
    catch { return null; }
  }
  async function interpret(input) {
    if (!input || typeof input !== 'object' || input.consent !== true || typeof input.text !== 'string' ||
        !input.text.trim() || input.text.length > 2000 || (input.context !== undefined && (typeof input.context !== 'string' || input.context.length > 1000))) throw new Error('invalid_input_or_consent');
    const version = currentVersion, active = selector, expectedGeneration = generation;
    if (!active.status().available || !hasCredential(selected)) throw new Error('provider_unavailable');
    try {
      state.reserve(expectedGeneration);
      const result = await active.interpret(input);
      if (currentVersion !== version || state.read().generation !== expectedGeneration) throw new Error('selection_changed');
      return result;
    } catch { throw new Error(currentVersion !== version ? 'selection_changed' : 'interpretation_unavailable'); }
  }
  return Object.freeze({ status, configure, acknowledgeRestore, getRevision, interpret, close: () => state.close() });
}
