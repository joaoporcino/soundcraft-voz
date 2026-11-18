const MODES = new Set(["paused", "passage", "worship"]);

export function validateModeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("Configuration must be an object");
  }
  const { passageInputs, masterInputId = null } = config;
  if (!Array.isArray(passageInputs)) {
    throw new TypeError("passageInputs must be an array of input IDs");
  }
  if (Object.keys(config).some(key => !['passageInputs', 'masterInputId'].includes(key)) || passageInputs.length > 256 ||
      passageInputs.some((id) => typeof id !== "string" || id.trim() === "" || id !== id.trim() || id.length > 200 || [...id].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) {
    throw new TypeError("Input IDs must be non-empty strings");
  }
  if (new Set(passageInputs).size !== passageInputs.length) {
    throw new TypeError("Input IDs must be unique");
  }
  if (masterInputId !== null &&
      (typeof masterInputId !== "string" || masterInputId.trim() === "" || !passageInputs.includes(masterInputId))) {
    throw new TypeError("masterInputId must identify a configured input or be null");
  }
  return Object.freeze({
    passageInputs: Object.freeze([...passageInputs]),
    masterInputId,
  });
}

function isAuthorizedTerminal(origin) {
  return origin?.type === "terminal" && origin.authorized === true;
}

function allowedFor(mode, config) {
  if (mode === "passage") return [...config.passageInputs];
  if (mode === "worship" && config.masterInputId !== null) return [config.masterInputId];
  return [];
}

function removedInputs(previous, next) {
  const nextSet = new Set(next);
  return previous.filter((inputId) => !nextSet.has(inputId));
}

/** A pure in-memory gate for voice-command origins. It never controls audio or a mixer. */
export function createModePolicy(initialConfig = { passageInputs: [], masterInputId: null }) {
  let config = validateModeConfig(initialConfig);
  let mode = "paused";
  const listeners = new Set();
  function notify() { for (const listener of listeners) listener(); }

  function snapshot() {
    return Object.freeze({
      mode,
      passageInputs: [...config.passageInputs],
      masterInputId: config.masterInputId,
      allowedInputs: allowedFor(mode, config),
    });
  }

  function configure(nextConfig, origin) {
    if (!isAuthorizedTerminal(origin)) {
      return { ok: false, reason: "unauthorized_origin", state: snapshot() };
    }
    let validated;
    try {
      validated = validateModeConfig(nextConfig);
    } catch (error) {
      return { ok: false, reason: "invalid_configuration", message: error.message, state: snapshot() };
    }
    if (mode === "worship" && validated.masterInputId === null) {
      return { ok: false, reason: "master_required_in_worship", state: snapshot() };
    }
    const before = allowedFor(mode, config);
    const after = allowedFor(mode, validated);
    config = validated;
    notify();
    return { ok: true, state: snapshot(), removedInputs: removedInputs(before, after) };
  }

  function setMode(nextMode, origin) {
    if (!isAuthorizedTerminal(origin)) {
      return { ok: false, reason: "unauthorized_origin", state: snapshot() };
    }
    if (!MODES.has(nextMode)) {
      return { ok: false, reason: "invalid_mode", state: snapshot() };
    }
    if (nextMode === "worship" && config.masterInputId === null) {
      return { ok: false, reason: "master_not_configured", state: snapshot() };
    }
    const before = allowedFor(mode, config);
    mode = nextMode;
    notify();
    const after = allowedFor(mode, config);
    return { ok: true, state: snapshot(), removedInputs: removedInputs(before, after) };
  }

  function isInputAllowed(inputId) {
    return allowedFor(mode, config).includes(inputId);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return Object.freeze({ snapshot, configure, setMode, isInputAllowed, subscribe });
}
