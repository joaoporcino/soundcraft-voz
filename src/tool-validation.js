const PROPOSAL_KEYS = new Set([
  'intent', 'target', 'action', 'value', 'relative', 'clarification',
]);
const CHANNEL_TARGET = /^canal ([1-9]|1[0-9]|2[0-4])$/;

export class ToolValidationError extends Error {
  constructor(code) {
    super(`Proposta de ferramenta recusada: ${code}`);
    this.name = 'ToolValidationError';
    this.code = code;
  }
}

function reject(code) {
  throw new ToolValidationError(code);
}

/**
 * Validates an untrusted Gemini interpretation. This function never executes a
 * mixer command; its returned command is only suitable for a later guarded
 * execution path.
 */
export function validateToolProposal(proposal, {
  authorize,
  live = false,
  connected,
  confirmed,
} = {}) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    reject('invalid_proposal');
  }
  if (Object.keys(proposal).some((key) => !PROPOSAL_KEYS.has(key))) {
    reject('unknown_fields');
  }
  if (Object.keys(proposal).length !== PROPOSAL_KEYS.size) reject('missing_fields');
  if (proposal.intent !== 'command') reject('not_a_command');
  if (proposal.clarification !== null) reject('ambiguous_proposal');

  const targetMatch = typeof proposal.target === 'string' && proposal.target.match(CHANNEL_TARGET);
  if (!targetMatch) reject('explicit_channel_required');
  const channel = Number(targetMatch[1]);

  let command;
  if (proposal.action === 'mute' || proposal.action === 'unmute') {
    if (proposal.value !== null || proposal.relative !== false) reject('invalid_mute_parameters');
    command = { action: proposal.action, channel };
  } else if (proposal.action === 'set_level') {
    if (proposal.relative !== false || typeof proposal.value !== 'number' || !Number.isFinite(proposal.value)) {
      reject('invalid_fader_parameters');
    }
    if (proposal.value < -60 || proposal.value > 0) reject('fader_out_of_range');
    command = { action: 'level', channel, db: proposal.value };
  } else if (proposal.action === 'set_points' || proposal.action === 'adjust_points') {
    const relative = proposal.action === 'adjust_points';
    if (proposal.relative !== relative || typeof proposal.value !== 'number' || !Number.isFinite(proposal.value)) {
      reject('invalid_fader_parameters');
    }
    if (relative ? proposal.value === 0 || Math.abs(proposal.value) > 100 : proposal.value < 0 || proposal.value > 100) {
      reject('fader_out_of_range');
    }
    command = { action: relative ? 'points_relative' : 'points_absolute', channel, points: proposal.value };
  } else {
    reject('unsupported_action');
  }

  if (typeof authorize !== 'function') reject('authorization_unavailable');
  let authorized;
  try {
    authorized = authorize(Object.freeze({ ...command }));
  } catch {
    reject('authorization_failed');
  }
  if (authorized !== true) reject('not_authorized');

  if (typeof live !== 'boolean') reject('invalid_execution_mode');
  if (live && connected !== true) reject('live_connection_required');
  if (live && confirmed !== true) reject('live_confirmation_required');

  return Object.freeze({
    command: Object.freeze(command),
    mode: live ? 'live' : 'simulation',
    authorized: true,
    confirmed: live,
  });
}
