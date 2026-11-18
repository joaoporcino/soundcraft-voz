const ACTIVATION_PREFIX = /^mesa(?=$|[^\p{L}\p{N}\p{M}_])/iu;
const CANCEL_TEXT = /^cancelar[.!?\s]*$/iu;
const EMPTY_REQUEST = /^[\s.,!?;:…—-]*$/u;

/**
 * Creates an isolated, text-only activation state machine.
 * This does not listen to audio, identify a speaker, or execute a command.
 */
export function createVoiceActivation({ authorize, now = Date.now, windowMs = 8_000 } = {}) {
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function');
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError('windowMs must be a positive finite number');
  }

  const conversations = new Map();

  function authorized(inputId) {
    if (typeof authorize !== 'function') return false;
    try {
      return authorize(inputId) === true;
    } catch {
      return false;
    }
  }

  function processText(inputId, text) {
    if (typeof inputId !== 'string' || inputId.trim() === '') {
      return { status: 'invalid-input' };
    }
    if (typeof text !== 'string') return { status: 'invalid-text' };
    const key = inputId;
    if (!authorized(key)) {
      conversations.delete(key);
      return { status: 'denied' };
    }

    const timestamp = now();
    let conversation = conversations.get(key);
    if (conversation && timestamp >= conversation.expiresAt) {
      conversations.delete(key);
      conversation = undefined;
    }

    const phrase = text.trim();
    if (conversation) {
      if (CANCEL_TEXT.test(phrase)) {
        conversations.delete(key);
        return { status: 'cancelled', inputId: key };
      }
      if (phrase === '') return { status: 'waiting', inputId: key, expiresAt: conversation.expiresAt };
      conversations.delete(key);
      return { status: 'request', inputId: key, request: phrase, source: 'follow-up' };
    }

    const match = ACTIVATION_PREFIX.exec(phrase);
    if (!match) return { status: 'inactive', inputId: key };

    const request = phrase.slice(match[0].length).replace(/^[\s,.:;!?…—-]+/u, '').trim();
    if (ACTIVATION_PREFIX.test(request)) return { status: 'ambiguous', inputId: key };
    if (EMPTY_REQUEST.test(request)) {
      const expiresAt = timestamp + windowMs;
      conversations.set(key, { expiresAt });
      return { status: 'waiting', inputId: key, expiresAt };
    }

    return { status: 'request', inputId: key, request, source: 'same-phrase' };
  }

  function getState(inputId) {
    const conversation = conversations.get(inputId);
    if (!conversation) return 'inactive';
    if (now() >= conversation.expiresAt) {
      conversations.delete(inputId);
      return 'inactive';
    }
    return 'waiting';
  }

  function clear(inputId) { conversations.delete(inputId); }
  function clearAll() { conversations.clear(); }
  return Object.freeze({ processText, getState, clear, clearAll });
}
