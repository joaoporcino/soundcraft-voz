import { createConversationState } from './conversation-state.js';
import { createModePolicy } from './mode-policy.js';
import { createVoiceOrchestrator } from './voice-orchestrator.js';
import { validateToolProposal } from './tool-validation.js';
import { pointsToDb, prepareRelativePoints, relativeObservationUnchanged } from './fader-scale.js';

const INPUT = 'principal';
const TERMINAL = Object.freeze({ type: 'terminal', authorized: true });

function asProposal(command) {
  return { intent: 'command', target: `canal ${command.channel}`,
    action: command.action === 'level' ? 'set_level' : command.action,
    value: command.action === 'level' ? command.db : null,
    relative: false, clarification: null };
}

/** Internal service flow; authorization at the HTTP boundary is mandatory. */
export function createServiceCommandFlow({ isConnected, sendCommand, getObservedFader = () => null,
  invalidateFader = () => {}, getInputContext = () => null, provider = null, modeConfig = { passageInputs: [INPUT], masterInputId: null } }) {
  if ([isConnected, sendCommand, getObservedFader, invalidateFader, getInputContext].some(callback => typeof callback !== 'function')) throw new TypeError('Mixer callbacks required');
  const policy = createModePolicy(modeConfig);
  const orchestrator = createVoiceOrchestrator({ modePolicy: policy, provider, authorizeActivation: () => true, authorizeCommand: () => true });
  const conversations = createConversationState();
  const knownInputs = new Set();
  function invalidate(inputId) {
    if (inputId === undefined) {
      conversations.invalidateAll();
      for (const id of knownInputs) orchestrator.invalidate(id);
      return;
    }
    conversations.invalidate(inputId); orchestrator.invalidate(inputId);
  }
  policy.subscribe(invalidate);
  function connected() { try { return isConnected() === true; } catch { return false; } }
  function context(inputId) { try { return getInputContext(inputId); } catch { return false; } }
  function inputAllowed(inputId) { return policy.isInputAllowed(inputId) && context(inputId) !== false; }
  function setMode(mode) {
    return policy.setMode(mode, TERMINAL);
  }
  function configureMode(config) { return policy.configure(config, TERMINAL); }
  async function process({ inputId = INPUT, text, consentToProvider = false } = {}) {
    if (typeof inputId !== 'string' || !inputId || inputId.length > 200 || typeof text !== 'string' || text.length > 4096 || typeof consentToProvider !== 'boolean') return { status: 'invalid-input' };
    const source = context(inputId);
    if (!policy.isInputAllowed(inputId) || source === false) return { status: 'blocked', reason: 'mode_or_input_not_allowed' };
    knownInputs.add(inputId);
    const current = conversations.begin(inputId);
    if (!connected()) return { status: 'disconnected' };
    const result = await orchestrator.process({ inputId, text, consentToProvider });
    if (!conversations.current(inputId, current) || !connected() || JSON.stringify(source) !== JSON.stringify(context(inputId))) return { status: 'cancelled' };
    if (result.status !== 'proposal') return result;
    const providerRevision = result.source === 'provider' && typeof provider?.getRevision === 'function' ? provider.getRevision() : undefined;
    if (providerRevision === null) return { status: 'cancelled' };
    let command = result.proposal;
    let relative;
    let reviewed = command;
    try {
      if (command.action === 'points_absolute') {
        const db = pointsToDb(command.points);
        reviewed = { ...command, db };
        command = { action: 'level', channel: command.channel, db };
      } else if (command.action === 'points_relative') {
        relative = prepareRelativePoints(command.points, getObservedFader(command.channel));
        reviewed = { ...command, previousPoints: relative.previous, targetPoints: relative.points,
          db: relative.db, observedAt: relative.observedAt };
        command = { action: 'level', channel: command.channel, db: relative.db };
      }
    } catch {
      return { status: 'clarification', reason: 'fader_state_or_range_invalid',
        clarification: 'Não foi possível calcular o ajuste; confira o valor observado e os limites de 0 a 100.', inputId };
    }
    const id = conversations.propose(inputId, command, current, { relative, source, providerRevision });
    if (!id) return { status: 'cancelled' };
    return { ...result, proposal: reviewed, id, mode: 'live', sourceContext: source };
  }
  function confirm({ id } = {}) {
    if (typeof id !== 'string') return { status: 'not-found' };
    const taken = conversations.take(id);
    if (taken.status !== 'ready') return { status: taken.status };
    const item = taken.item;
    try {
      if (!connected() || !policy.isInputAllowed(item.inputId) || JSON.stringify(item.source) !== JSON.stringify(context(item.inputId)) || !conversations.current(item.inputId, item.token)) return { status: 'denied' };
      if (item.providerRevision !== undefined && provider?.getRevision?.() !== item.providerRevision) return { status: 'denied' };
      const { command } = validateToolProposal(asProposal(item.command), { authorize: () => true });
      if (!connected() || !policy.isInputAllowed(item.inputId) || JSON.stringify(item.source) !== JSON.stringify(context(item.inputId)) || !conversations.current(item.inputId, item.token)) return { status: 'denied' };
      if (item.relative && !relativeObservationUnchanged(item.relative, getObservedFader(command.channel))) {
        return { status: 'stale-observation', confirmed: false };
      }
      if (command.action === 'level') invalidateFader(command.channel);
      if (!conversations.markAttempt(item)) return { status: 'stale' };
      sendCommand(command);
      return { status: 'sent', command, delivery: 'unverified', confirmed: false };
    } catch {
      return { status: 'failed', confirmed: false };
    }
  }
  function invalidateProposal(id) { const inputId = conversations.invalidateProposal(id); if (inputId !== null) orchestrator.invalidate(inputId); }
  return Object.freeze({ process, confirm, invalidate, invalidateProposal, setMode, configureMode, inputAllowed, getInputContext: context, getStatus: () => policy.snapshot(), getGeneration: (inputId = INPUT) => conversations.version(inputId) });
}
