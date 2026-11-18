import { randomUUID } from 'node:crypto';
import { MixerState } from './simulator/mixer-state.js';
import { createVoiceOrchestrator } from './voice-orchestrator.js';
import { validateToolProposal } from './tool-validation.js';

function asProposal(command) {
  return {
    intent: 'command', target: `canal ${command.channel}`,
    action: command.action === 'level' ? 'set_level' : command.action,
    value: command.action === 'level' ? command.db : null,
    relative: false, clarification: null,
  };
}

/** Isolated simulation: it owns its in-memory mixer and has no live transport. */
export function createSimulatedCommandFlow({ modePolicy, authorizeActivation, authorizeCommand, authorizeConfirmation, provider } = {}) {
  if (!modePolicy || typeof modePolicy.isInputAllowed !== 'function' || typeof modePolicy.subscribe !== 'function') {
    throw new TypeError('A subscribable mode policy is required');
  }
  if (typeof authorizeActivation !== 'function' || typeof authorizeCommand !== 'function' || typeof authorizeConfirmation !== 'function') {
    throw new TypeError('Explicit authorization callbacks are required');
  }
  const mixer = new MixerState();
  const pending = new Map();
  const generations = new Map();
  let connected = false;
  const orchestrator = createVoiceOrchestrator({ modePolicy, authorizeActivation, authorizeCommand, provider });

  function invalidate(inputId) {
    pending.delete(inputId);
    generations.set(inputId, (generations.get(inputId) ?? 0) + 1);
    orchestrator.invalidate(inputId);
  }
  function invalidateAll() {
    for (const inputId of generations.keys()) invalidate(inputId);
  }
  modePolicy.subscribe(invalidateAll);

  function setConnected(value) {
    if (typeof value !== 'boolean') throw new TypeError('connected must be boolean');
    if (connected !== value) invalidateAll();
    connected = value;
  }

  async function process({ inputId, text, consentToProvider = false } = {}) {
    if (typeof inputId !== 'string' || !inputId.trim()) return { status: 'invalid-input' };
    pending.delete(inputId);
    generations.set(inputId, (generations.get(inputId) ?? 0) + 1);
    const generation = generations.get(inputId);
    if (!connected) return { status: 'disconnected', mode: 'simulation' };
    const result = await orchestrator.process({ inputId, text, consentToProvider });
    if (!connected || generations.get(inputId) !== generation) return { status: 'cancelled', mode: 'simulation' };
    if (result.status !== 'proposal') return { ...result, mode: 'simulation' };
    const id = randomUUID();
    pending.set(inputId, { id, command: result.proposal, generation });
    return { ...result, id };
  }

  function confirm({ inputId, id, origin } = {}) {
    const item = pending.get(inputId);
    if (!item || item.id !== id) return { status: 'not-found', mode: 'simulation' };
    // Consume before calling any user-supplied authorization function.
    pending.delete(inputId);
    try {
      if (!connected || modePolicy.isInputAllowed(inputId) !== true || authorizeActivation(inputId) !== true ||
          authorizeConfirmation({ inputId, origin }) !== true) {
        return { status: 'denied', mode: 'simulation' };
      }
      const { command } = validateToolProposal(asProposal(item.command), { authorize: authorizeCommand });
      // Authorization callbacks may synchronously change policy or connection.
      if (!connected || modePolicy.isInputAllowed(inputId) !== true || generations.get(inputId) !== item.generation) {
        return { status: 'denied', mode: 'simulation' };
      }
      const state = command.action === 'level'
        ? mixer.setFader(command.channel, command.db)
        : mixer.setMute(command.channel, command.action === 'mute');
      return { status: 'executed', mode: 'simulation', command, state };
    } catch {
      return { status: 'rejected', mode: 'simulation' };
    }
  }

  return Object.freeze({ process, confirm, invalidate, setConnected, getChannel: (channel) => mixer.getChannel(channel) });
}
