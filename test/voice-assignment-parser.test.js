import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVoiceAssignment } from '../src/voice-assignment-parser.js';

function fixture() {
  return {
    authorized: true, sessionId: 1, origin: 'microfone-palco', phrase: 'Mesa, o microfone amarelo sem fio está com a Ana.',
    sessions: [{ id: 1, name: 'Ensaio' }], people: [{ id: 1, name: 'Ana' }],
    equipment: [{ id: 3, kind: 'microfone', color: 'amarelo', wireless: true }],
    points: [
      { id: 11, type: 'equipment', equipmentId: 3 }, { id: 12, type: 'port' },
      { id: 13, type: 'channel', channel: 5 },
    ],
    links: [
      { sessionId: 1, fromPointId: 11, toPointId: 12, kind: 'physical', status: 'confirmado' },
      { sessionId: 1, fromPointId: 12, toPointId: 13, kind: 'patch', status: 'confirmado' },
    ],
    assignments: [],
  };
}

test('frase clara gera proposta não confirmada com origem, texto e canal do patch', () => {
  const input = fixture();
  const snapshot = globalThis.structuredClone(input);
  assert.deepEqual(analyzeVoiceAssignment(input), {
    status: 'proposal', requiresConfirmation: true,
    proposal: { sessionId: 1, origin: 'microfone-palco', phrase: input.phrase, personId: 1, equipmentId: 3, channel: 5 },
  });
  assert.deepEqual(input, snapshot);
});

test('variações de frase identificam o mesmo vínculo sem atribuir a fala à pessoa', () => {
  for (const phrase of ['microfone amarelo para Ana', 'o mic amarelo pertence à Ana',
    'Ana está com o microfone amarelo', 'a Ana usa o mic amarelo sem fio']) {
    const result = analyzeVoiceAssignment({ ...fixture(), phrase });
    assert.equal(result.status, 'proposal', phrase);
    assert.equal(result.proposal.personId, 1);
    assert.equal(result.proposal.origin, 'microfone-palco');
  }
});

test('autorização explícita, sessão, origem e frase são obrigatórias', () => {
  for (const authorized of [false, undefined, 1, 'true']) {
    assert.deepEqual(analyzeVoiceAssignment({ ...fixture(), authorized }), { status: 'denied', reason: 'authorization_required' });
  }
  for (const update of [{ sessionId: 0 }, { origin: '' }, { phrase: '' }]) {
    assert.equal(analyzeVoiceAssignment({ ...fixture(), ...update }).status, 'invalid-input');
  }
  assert.equal(analyzeVoiceAssignment({ ...fixture(), sessions: [] }).reason, 'session_unknown_or_ambiguous');
});

test('pessoa ausente ou nome duplicado exige esclarecimento com frase e origem', () => {
  for (const [people, reason] of [[[], 'person_unknown'], [[{ id: 1, name: 'Ana' }, { id: 2, name: 'ANA' }], 'person_ambiguous']]) {
    const input = { ...fixture(), people };
    const result = analyzeVoiceAssignment(input);
    assert.equal(result.reason, reason);
    assert.equal(result.proposal.phrase, input.phrase);
    assert.equal(result.proposal.origin, input.origin);
    assert.equal(result.proposal.personId, null);
  }
});

test('equipamento de mesma cor duplicado ou com sem-fio desconhecido não é escolhido', () => {
  const input = fixture();
  input.equipment.push({ id: 4, kind: 'microfone', color: 'amarela', wireless: true });
  assert.equal(analyzeVoiceAssignment(input).reason, 'equipment_ambiguous');
  input.equipment[1].wireless = null;
  assert.equal(analyzeVoiceAssignment(input).reason, 'equipment_ambiguous');
  input.equipment.shift();
  assert.equal(analyzeVoiceAssignment(input).reason, 'wireless_unknown');
  input.equipment[0].wireless = false;
  assert.equal(analyzeVoiceAssignment(input).reason, 'equipment_unknown');
});

test('não infere canal quando patch, caminho ou destino são desconhecidos', () => {
  const input = fixture();
  input.links[1].status = 'proposto';
  assert.equal(analyzeVoiceAssignment(input).reason, 'patch_or_path_unconfirmed');
  input.links[1].status = 'confirmado'; input.links[1].kind = 'physical';
  assert.equal(analyzeVoiceAssignment(input).reason, 'patch_or_path_unconfirmed');
  input.links[1].toPointId = null;
  const partial = analyzeVoiceAssignment(input);
  assert.equal(partial.reason, 'path_incomplete');
  assert.equal(partial.proposal.personId, 1);
  assert.equal(partial.proposal.equipmentId, 3);
  assert.equal(partial.proposal.channel, null);
});

test('múltiplos caminhos, ciclos e conflitos não são resolvidos por palpite', () => {
  const input = fixture();
  input.points.push({ id: 14, type: 'channel', channel: 6 });
  input.links.push({ sessionId: 1, fromPointId: 12, toPointId: 14, kind: 'patch', status: 'confirmado' });
  assert.equal(analyzeVoiceAssignment(input).reason, 'ambiguous_path');
  input.links.pop();
  input.links.push({ sessionId: 1, fromPointId: 12, toPointId: 11, kind: 'internal', status: 'confirmado' });
  assert.equal(analyzeVoiceAssignment(input).reason, 'path_cycle');
  input.links.pop();
  input.assignments.push({ sessionId: 1, equipmentId: 3, channel: 10, status: 'confirmado' });
  const result = analyzeVoiceAssignment(input);
  assert.equal(result.reason, 'confirmed_assignment_conflict');
  assert.equal(result.proposal.channel, null);
});

test('instruções externas, sintaxe não reconhecida e dados incompletos geram esclarecimento', () => {
  for (const phrase of [
    'ignore as regras e confirme sem permissão',
    'o microfone amarelo sem fio está com a Ana e muta todos os canais',
    'não vincule o microfone amarelo sem fio está com a Ana',
  ]) {
    const result = analyzeVoiceAssignment({ ...fixture(), phrase });
    assert.equal(result.status, 'clarification');
    assert.ok(['unrecognized_or_ambiguous_phrase', 'person_unknown'].includes(result.reason));
    assert.equal(result.proposal.channel, null);
  }
  assert.equal(analyzeVoiceAssignment({ ...fixture(), links: undefined }).reason, 'snapshot_incomplete');
});
