import { parseCommand } from './commands.js';
import { createModePolicy } from './mode-policy.js';
import { createVoiceActivation } from './voice-activation.js';
import { validateToolProposal } from './tool-validation.js';
import { AmbiguousFaderScaleError, parseFaderPoints } from './fader-scale.js';

function localProposal(command) {
  if (command.action === 'points_absolute' || command.action === 'points_relative') {
    return { intent: 'command', target: `canal ${command.channel}`,
      action: command.action === 'points_absolute' ? 'set_points' : 'adjust_points',
      value: command.points, relative: command.action === 'points_relative', clarification: null };
  }
  return {
    intent: 'command',
    target: `canal ${command.channel}`,
    action: command.action === 'level' ? 'set_level' : command.action,
    value: command.action === 'level' ? command.db : null,
    relative: false,
    clarification: null,
  };
}

function parseErrorIsUnknownCommand(error) {
  return error instanceof Error && error.message.startsWith('Comando não reconhecido.');
}

/**
 * Coordinates textual activation and interpretation into a proposal only.
 * It deliberately has no mixer transport and never executes a command.
 */
export function createVoiceOrchestrator({
  modePolicy = createModePolicy(),
  parseLocal = parseCommand,
  provider = null,
  authorizeActivation,
  authorizeCommand,
  now,
  windowMs,
} = {}) {
  if (!modePolicy || typeof modePolicy.isInputAllowed !== 'function') {
    throw new TypeError('modePolicy.isInputAllowed must be a function');
  }
  if (typeof parseLocal !== 'function') throw new TypeError('parseLocal must be a function');

  const authorize = typeof authorizeActivation === 'function'
    ? authorizeActivation
    : () => true;
  const activationMachine = createVoiceActivation({
    authorize: (inputId) => {
      try {
        return modePolicy.isInputAllowed(inputId) === true && authorize(inputId) === true;
      } catch {
        return false;
      }
    },
    ...(now === undefined ? {} : { now }),
    ...(windowMs === undefined ? {} : { windowMs }),
  });
  const generations = new Map();
  let policyGeneration = 0;
  function invalidate(inputId) {
    activationMachine.clear(inputId);
    generations.set(inputId, (generations.get(inputId) ?? 0) + 1);
  }
  modePolicy.subscribe?.(() => {
    policyGeneration += 1;
    activationMachine.clearAll();
  });

  function allowed(inputId) {
    try {
      return modePolicy.isInputAllowed(inputId) === true;
    } catch {
      return false;
    }
  }

  function activationAuthorized(inputId) {
    try {
      return authorize(inputId) === true;
    } catch {
      return false;
    }
  }

  async function process({ inputId, text, consentToProvider = false } = {}) {
    // This gate precedes activation, the local parser, and every provider call.
    if (!allowed(inputId)) {
      // The activation machine is owned here and uses this same mode policy;
      // its denied transition clears any stale follow-up for this input.
      if (typeof inputId === 'string' && inputId.trim() && typeof text === 'string') {
        activationMachine.processText(inputId, text);
        invalidate(inputId);
      }
      return { status: 'blocked', reason: 'mode_or_input_not_allowed' };
    }
    if (typeof inputId !== 'string' || inputId.trim() === '') {
      return { status: 'invalid-input', reason: 'input_id_required' };
    }
    if (typeof text !== 'string') return { status: 'invalid-input', reason: 'text_required' };
    if (!activationAuthorized(inputId)) { invalidate(inputId); return { status: 'denied', inputId }; }

    if (/^cancelar[.!?\s]*$/iu.test(text.trim())) {
      const result = activationMachine.processText(inputId, text);
      invalidate(inputId);
      return { status: result.status === 'cancelled' ? 'cancelled' : 'inactive', inputId };
    }

    let activationResult;
    try {
      activationResult = activationMachine.processText(inputId, text);
    } catch {
      return { status: 'rejected', reason: 'activation_failed' };
    }
    if (activationResult.status !== 'request') {
      return { status: activationResult.status, inputId, ...(activationResult.expiresAt === undefined ? {} : { expiresAt: activationResult.expiresAt }) };
    }

    const generation = (generations.get(inputId) ?? 0) + 1;
    generations.set(inputId, generation);
    const currentPolicyGeneration = policyGeneration;

    let proposal;
    let source = 'local';
    try {
      proposal = localProposal(parseFaderPoints(activationResult.request) ?? parseLocal(activationResult.request));
    } catch (error) {
      if (error instanceof AmbiguousFaderScaleError) {
        return { status: 'clarification', reason: 'ambiguous_fader_scale', clarification: 'O valor zero é em pontos ou dB?', inputId };
      }
      if (!parseErrorIsUnknownCommand(error)) {
        return { status: 'clarification', reason: 'local_command_invalid', inputId };
      }
      if (!provider || typeof provider.interpret !== 'function') {
        return { status: 'unavailable', reason: 'local_command_unrecognized', inputId };
      }
      if (typeof provider.status === 'function') {
        try {
          if (provider.status().available !== true) return { status: 'unavailable', reason: 'provider_unavailable', inputId };
        } catch { return { status: 'unavailable', reason: 'provider_unavailable', inputId }; }
      }
      if (consentToProvider !== true) {
        return { status: 'consent-required', inputId };
      }
      try {
        proposal = await provider.interpret({ text: activationResult.request, consent: true });
        source = 'provider';
      } catch {
        return { status: 'interpretation-failed', inputId };
      }
    }

    if (!allowed(inputId)) return { status: 'blocked', reason: 'mode_or_input_not_allowed' };
    if (source === 'provider' && !activationAuthorized(inputId)) return { status: 'denied', inputId };
    if (generations.get(inputId) !== generation || policyGeneration !== currentPolicyGeneration) {
      return { status: 'cancelled', inputId };
    }

    if (source === 'provider' && proposal?.intent === 'clarify' && typeof proposal.clarification === 'string') {
      return { status: 'clarification', reason: 'provider_requested_clarification', clarification: proposal.clarification, inputId };
    }

    let validation;
    try {
      validation = validateToolProposal(proposal, {
        authorize: authorizeCommand,
      });
    } catch (error) {
      return {
        status: error?.code === 'ambiguous_proposal' ? 'clarification' : 'rejected',
        reason: error?.code ?? 'invalid_proposal',
        inputId,
      };
    }

    return {
      status: 'proposal',
      inputId,
      source,
      proposal: validation.command,
      mode: validation.mode,
      requiresConfirmation: true,
      confirmed: false,
    };
  }

  return Object.freeze({ process, invalidate });
}
