import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { createRegistrySchema, openRegistry } from '../src/registry.js';
import { createBackup, restoreBackup } from '../src/backup.js';
import { createServiceCommandFlow } from '../src/service-command-flow.js';
import { runRegistryCommand } from '../src/registry-cli.js';
import { soundcheckRevision } from '../src/soundcheck-review.js';

test('migra esquema v4, persiste fontes por sessão e preserva no backup', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-input-'));
  const dbPath = path.join(dir, 'cadastros.sqlite');
  const legacy = new DatabaseSync(dbPath);
  createRegistrySchema(legacy, { version: 4 });
  legacy.close();
  let registry = openRegistry(dbPath);
  try {
    const person = registry.addPerson('Pessoa');
    const equipment = registry.addEquipment({ name: 'Fonte', kind: 'voz' });
    const session = registry.createSession('Sessão');
    const other = registry.createSession('Outra');
    const assignment = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment.id, channel: 1 });
    assert.throws(() => registry.bindInputSource({ sessionId: session.id, inputId: 'mic-a', assignmentId: assignment.id }), /Fonte confirmada/);
    registry.confirmAssignment(assignment.id);
    assert.throws(() => registry.bindInputSource({ sessionId: other.id, inputId: 'mic-a', assignmentId: assignment.id }), /Fonte confirmada/);
    const request = { sessionId: session.id, inputId: 'mic-a', assignmentId: assignment.id };
    const output = [];
    await runRegistryCommand(['entrada-fonte', 'vincular', String(session.id), 'mic-a', String(assignment.id)], { directory: dir, output: value => output.push(value) });
    const binding = JSON.parse(output.at(-1));
    assert.throws(() => registry.bindInputSource(binding), /já vinculada/);
    assert.throws(() => registry.bindInputSource({ ...request, inputId: ' mic ' }), /inputId/);
    registry.close();
    registry = openRegistry(dbPath);
    assert.deepEqual(registry.listInputSources(session.id).map(x => ({ ...x })), [binding]);
    const backup = path.join(dir, 'backup');
    const restored = path.join(dir, 'restored');
    await createBackup({ directory: dir, destination: backup });
    await restoreBackup({ directory: restored, source: backup });
    const copy = openRegistry(path.join(restored, 'cadastros.sqlite'));
    try { assert.deepEqual(copy.listInputSources(session.id).map(x => ({ ...x })), [binding]); }
    finally { copy.close(); }
    assert.equal(registry.unbindInputSource(binding), true);
    assert.equal(registry.unbindInputSource(binding), false);
  } finally { registry.close(); await rm(dir, { recursive: true, force: true }); }
});

test('remoção e recriação do mesmo vínculo invalida proposta anterior', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-input-context-'));
  const registry = openRegistry(path.join(dir, 'cadastros.sqlite'));
  try {
    const person = registry.addPerson('Pessoa');
    const equipment = registry.addEquipment({ name: 'Fonte', kind: 'voz' });
    const session = registry.createSession('Sessão');
    const assignment = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment.id, channel: 1 });
    registry.confirmAssignment(assignment.id);
    const input = { sessionId: session.id, inputId: 'mic-a', assignmentId: assignment.id };
    registry.bindInputSource(input);
    let sent = false;
    const flow = createServiceCommandFlow({ isConnected: () => true, sendCommand: () => { sent = true; },
      modeConfig: { passageInputs: ['mic-a'], masterInputId: null },
      getInputContext: id => registry.listInputSources(session.id).find(item => item.inputId === id) ?? false });
    flow.setMode('passage');
    const proposal = await flow.process({ inputId: 'mic-a', text: 'mesa, mute canal 3' });
    registry.unbindInputSource(input);
    registry.bindInputSource(input);
    assert.equal(flow.confirm({ id: proposal.id }).status, 'denied');
    assert.equal(sent, false);
    const next = await flow.process({ inputId: 'mic-a', text: 'mesa, mute canal 3' });
    const external = new DatabaseSync(path.join(dir, 'cadastros.sqlite'));
    try { external.prepare("UPDATE assignments SET status='proposto' WHERE id=?").run(assignment.id); }
    finally { external.close(); }
    assert.equal(flow.confirm({ id: next.id }).status, 'denied');
  } finally { registry.close(); await rm(dir, { recursive: true, force: true }); }
});

test('criação de proposta valida a origem dentro da transação após troca concorrente', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-input-race-'));
  const file = path.join(dir, 'cadastros.sqlite');
  const registry = openRegistry(file);
  const other = openRegistry(file);
  try {
    const person = registry.addPerson('Pessoa');
    const equipment = registry.addEquipment({ name: 'Fonte', kind: 'voz' });
    const session = registry.createSession('Sessão');
    const assignment = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment.id, channel: 1 });
    registry.confirmAssignment(assignment.id);
    const input = { sessionId: session.id, inputId: 'mic-a', assignmentId: assignment.id };
    const expectedBinding = registry.bindInputSource(input);
    other.unbindInputSource(input);
    const fresh = other.bindInputSource(input);
    const proposal = { sessionId: session.id, origin: 'mic-a', phrase: 'microfone azul para Pessoa', authorized: true };
    assert.throws(() => registry.createVoiceProposal({ ...proposal, expectedBinding }), /alterado/);
    assert.equal(registry.listVoiceProposals(session.id).length, 0);
    const created = registry.createVoiceProposal({ ...proposal, expectedBinding: fresh });
    const revision = soundcheckRevision('voz', created);
    other.editVoiceProposal(created.id, { authorized: true, personId: person.id });
    assert.equal(registry.discardUnreviewedVoiceProposal(created.id, { authorized: true, expectedRevision: revision }), false);
    const edited = registry.listVoiceProposals(session.id)[0];
    assert.equal(edited.personId, person.id);
    assert.equal(registry.discardUnreviewedVoiceProposal(created.id, { authorized: true, expectedRevision: soundcheckRevision('voz', edited) }), true);
    assert.equal(registry.listVoiceProposals(session.id).length, 0);
  } finally { other.close(); registry.close(); await rm(dir, { recursive: true, force: true }); }
});
