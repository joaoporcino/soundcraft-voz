import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createRegistrySchema, openRegistry } from '../src/registry.js';
import { createBackup, restoreBackup } from '../src/backup.js';

const recordLink = (r, sessionId, from, to, kind = 'physical') => {
  const proposed = r.proposeSignalLink({ sessionId, fromPointId: from.id, toPointId: to?.id ?? null, kind });
  return to ? r.confirmSignalLink(proposed.id, { origin: 'operador' }) : proposed;
};

function setup(r) {
  const session = r.createSession('Ensaio');
  const person = r.addPerson('Ana');
  const equipment = r.addEquipment({ name: 'Voz', kind: 'microfone', color: 'amarelo', wireless: true });
  const mesa = r.addPhysicalDevice({ name: 'Principal', type: 'mesa' });
  const medusa = r.addPhysicalDevice({ name: 'Palco', type: 'medusa' });
  const mic = r.addSignalPoint({ type: 'equipment', label: 'Saída do microfone', equipmentId: equipment.id, direction: 'output' });
  const entry = r.addSignalPoint({ type: 'port', label: 'Entrada 5', deviceId: mesa.id, direction: 'input' });
  const channel = r.addSignalPoint({ type: 'channel', label: 'Canal 12', channel: 12, direction: 'bidirectional' });
  return { session, person, equipment, mesa, medusa, mic, entry, channel };
}

test('caminho direto registra patch explícito e confirma proposta de voz apenas após revisão', () => {
  const r = openRegistry(':memory:');
  try {
    const { session, person, equipment, mic, entry, channel } = setup(r);
    recordLink(r, session.id, mic, entry);
    const patch = recordLink(r, session.id, entry, channel, 'patch');
    assert.equal(patch.confirmationOrigin, 'operador');
    assert.ok(Number.isFinite(Date.parse(patch.confirmedAt)));
    const trace = r.traceSignalPath({ sessionId: session.id, startPointId: mic.id });
    assert.deepEqual(trace.links.map(item => item.kind), ['physical', 'patch']);
    assert.equal(trace.points.find(item => item.type === 'channel').channel, 12);
    const proposal = r.createVoiceProposal({ sessionId: session.id, phrase: 'microfone amarelo com Ana', origin: 'entrada 1', authorized: true });
    assert.equal(proposal.personId, null);
    assert.throws(() => r.confirmVoiceProposal(proposal.id, { authorized: true }), /incompleta/);
    r.editVoiceProposal(proposal.id, { personId: person.id, equipmentId: equipment.id, channel: 12, authorized: true });
    assert.throws(() => r.confirmVoiceProposal(proposal.id), /não autorizada/);
    assert.equal(r.confirmVoiceProposal(proposal.id, { authorized: true }).status, 'confirmado');
    assert.equal(r.listAssignments(session.id)[0].status, 'confirmado');
  } finally { r.close(); }
});

test('patch revogado impede confirmação tardia e rejeição é persistente', () => {
  const r = openRegistry(':memory:');
  try {
    const { session, person, equipment, mic, entry, channel } = setup(r);
    recordLink(r, session.id, mic, entry);
    const patch = recordLink(r, session.id, entry, channel, 'patch');
    const proposal = r.createVoiceProposal({ sessionId: session.id, phrase: 'Ana no amarelo', origin: 'entrada 1',
      personId: person.id, equipmentId: equipment.id, channel: 12, authorized: true });
    r.revokeSignalLink(patch.id);
    assert.throws(() => r.confirmVoiceProposal(proposal.id, { authorized: true }), /incompleto|ambíguo/);
    assert.equal(r.listAssignments(session.id).length, 0);
    assert.equal(r.rejectVoiceProposal(proposal.id, { authorized: true }).status, 'rejeitado');
    assert.throws(() => r.confirmVoiceProposal(proposal.id, { authorized: true }), /pendente/);
  } finally { r.close(); }
});

test('ramificação a canal sem patch impede confirmação apesar de outro caminho ter patch', () => {
  const r = openRegistry(':memory:');
  try {
    const { session, person, equipment, mic, entry, channel } = setup(r);
    recordLink(r, session.id, mic, entry);
    recordLink(r, session.id, entry, channel, 'patch');
    const other = r.addSignalPoint({ type: 'channel', label: 'Canal 8', channel: 8, direction: 'bidirectional' });
    recordLink(r, session.id, mic, other, 'internal');
    const proposal = r.createVoiceProposal({ sessionId: session.id, phrase: 'Ana no amarelo', origin: 'entrada 1',
      personId: person.id, equipmentId: equipment.id, channel: 12, authorized: true });
    assert.throws(() => r.confirmVoiceProposal(proposal.id, { authorized: true }), /incompleto|ambíguo/);
    assert.equal(r.listAssignments(session.id).length, 0);
  } finally { r.close(); }
});

test('caminhos com medusa, destinos desconhecidos, conflito e ciclo são explícitos', () => {
  const r = openRegistry(':memory:');
  try {
    const { session, medusa, mic, entry, channel } = setup(r);
    const input = r.addSignalPoint({ type: 'port', label: 'Palco 1', deviceId: medusa.id, direction: 'input' });
    const way = r.addSignalPoint({ type: 'snake_way', label: 'Via 1', deviceId: medusa.id, direction: 'bidirectional' });
    const output = r.addSignalPoint({ type: 'port', label: 'Mesa 1', deviceId: medusa.id, direction: 'output' });
    recordLink(r, session.id, mic, input);
    recordLink(r, session.id, input, way, 'internal');
    recordLink(r, session.id, way, output, 'internal');
    recordLink(r, session.id, output, entry);
    recordLink(r, session.id, entry, channel, 'patch');
    const incomplete = recordLink(r, session.id, way, null);
    assert.equal(incomplete.status, 'proposto');
    assert.throws(() => r.confirmSignalLink(incomplete.id, { origin: 'operador' }), /desconhecida/);
    const conflict = r.proposeSignalLink({ sessionId: session.id, fromPointId: mic.id, toPointId: entry.id, kind: 'physical' });
    assert.throws(() => r.confirmSignalLink(conflict.id, { origin: 'operador' }), /Destino/);
    const cycle = r.proposeSignalLink({ sessionId: session.id, fromPointId: channel.id, toPointId: mic.id, kind: 'internal' });
    assert.throws(() => r.confirmSignalLink(cycle.id, { origin: 'operador' }), /ciclo/);
    const trace = r.traceSignalPath({ sessionId: session.id, startPointId: mic.id });
    assert.ok(trace.links.some(item => item.toPointId === null));
    assert.ok(trace.issues.some(item => item.code === 'destino_desconhecido' && item.linkId === incomplete.id));
    assert.equal(r.rejectSignalLink(incomplete.id).status, 'rejeitado');
  } finally { r.close(); }
});

test('consulta distingue ligação pendente de ponto sem continuidade', () => {
  const r = openRegistry(':memory:');
  try {
    const { session, mic, entry } = setup(r);
    const proposed = r.proposeSignalLink({ sessionId: session.id, fromPointId: mic.id, toPointId: entry.id, kind: 'physical' });
    const trace = r.traceSignalPath({ sessionId: session.id, startPointId: mic.id });
    assert.ok(trace.issues.some(issue => issue.code === 'ligacao_pendente' && issue.linkId === proposed.id));
    assert.ok(trace.issues.some(issue => issue.code === 'sem_ligacao' && issue.pointId === entry.id));
  } finally { r.close(); }
});

test('confirmações concorrentes de entradas para a mesma porta preservam um único caminho', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-physical-race-'));
  const filename = path.join(dir, 'cadastros.sqlite');
  const r = openRegistry(filename);
  try {
    const { session, mic, entry } = setup(r);
    const anotherEquipment = r.addEquipment({ name: 'Outro', kind: 'microfone' });
    const another = r.addSignalPoint({ type: 'equipment', label: 'Outro mic', equipmentId: anotherEquipment.id, direction: 'output' });
    const first = r.proposeSignalLink({ sessionId: session.id, fromPointId: mic.id, toPointId: entry.id, kind: 'physical' });
    const second = r.proposeSignalLink({ sessionId: session.id, fromPointId: another.id, toPointId: entry.id, kind: 'physical' });
    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/registry.js')).href;
    const run = promisify(execFile);
    const invoke = id => run(process.execPath, ['--input-type=module', '-e',
      `import {openRegistry} from ${JSON.stringify(moduleUrl)};const r=openRegistry(${JSON.stringify(filename)});try{r.confirmSignalLink(${id},{origin:'teste'});console.log('ok')}catch{console.log('conflict')}finally{r.close()}`]);
    const outcomes = await Promise.all([invoke(first.id), invoke(second.id)]);
    assert.deepEqual(outcomes.map(value => value.stdout.trim()).sort(), ['conflict', 'ok']);
    assert.equal(r.listSignalLinks(session.id).filter(link => link.status === 'confirmado').length, 1);
    assert.equal(r.listSignalLinks(session.id).filter(link => link.status === 'proposto').length, 1);
  } finally { r.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('retorno AUX até fone e pessoa é registrado em sessão e preserva vínculo já confirmado', () => {
  const r = openRegistry(':memory:');
  try {
    const { session, person, mesa, medusa } = setup(r);
    r.setAuxConfig(8);
    const aux = r.addMonitorReturn({ sessionId: session.id, aux: 2 });
    r.confirmMonitorAssignment(r.proposeMonitorAssignment({ sessionId: session.id, personId: person.id, returnId: aux.id }).id);
    const source = r.addSignalPoint({ type: 'monitor_return', label: 'AUX 2', monitorReturnId: aux.id, direction: 'output' });
    const out = r.addSignalPoint({ type: 'port', label: 'Saída mesa', deviceId: mesa.id, direction: 'bidirectional' });
    const snake = r.addSignalPoint({ type: 'snake_way', label: 'Retorno 3', deviceId: medusa.id, direction: 'bidirectional' });
    const regulator = r.addSignalPoint({ type: 'other', label: 'Regulador', direction: 'bidirectional' });
    const headphone = r.addSignalPoint({ type: 'other', label: 'Fone', direction: 'bidirectional' });
    const listener = r.addSignalPoint({ type: 'person', label: 'Ana', personId: person.id, direction: 'input' });
    for (const [a, b, kind] of [[source, out, 'internal'], [out, snake, 'physical'], [snake, regulator, 'physical'],
      [regulator, headphone, 'physical'], [headphone, listener, 'physical']]) recordLink(r, session.id, a, b, kind);
    const trace = r.traceSignalPath({ sessionId: session.id, startPointId: source.id });
    assert.equal(trace.links.length, 5);
    assert.ok(trace.links.every(item => item.status === 'confirmado'));
    assert.equal(trace.points.find(item => item.type === 'person').personId, person.id);
    const other = r.createSession('Outra');
    assert.throws(() => r.proposeSignalLink({ sessionId: other.id, fromPointId: source.id, toPointId: out.id, kind: 'internal' }), /outra sessão/);
  } finally { r.close(); }
});

test('migração v3 e backup v4 preservam conexões e propostas', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-physical-'));
  try {
    const file = path.join(dir, 'cadastros.sqlite');
    const old = new DatabaseSync(file); createRegistrySchema(old, { version: 3 }); old.close();
    const r = openRegistry(file);
    const { session, mic, entry, channel } = setup(r);
    recordLink(r, session.id, mic, entry); recordLink(r, session.id, entry, channel, 'patch');
    r.createVoiceProposal({ sessionId: session.id, phrase: 'amarelo com Ana', origin: 'mic 1', authorized: true });
    r.close();
    const backup = path.join(dir, 'backup.json'); await createBackup({ directory: dir, destination: backup });
    const target = path.join(dir, 'restored'); await restoreBackup({ directory: target, source: backup });
    const restored = openRegistry(path.join(target, 'cadastros.sqlite'));
    try {
      assert.equal(restored.listSignalLinks(session.id).length, 2);
      assert.equal(restored.listVoiceProposals(session.id)[0].phrase, 'amarelo com Ana');
    } finally { restored.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('restauração rejeita ciclo confirmado adulterado mesmo com checksum recalculado', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-physical-corrupt-'));
  try {
    const file = path.join(dir, 'cadastros.sqlite');
    const r = openRegistry(file);
    const { session, mic, entry, channel } = setup(r);
    recordLink(r, session.id, mic, entry); recordLink(r, session.id, entry, channel, 'patch');
    r.close();
    const good = path.join(dir, 'good.json'); await createBackup({ directory: dir, destination: good });
    const db = new DatabaseSync(file);
    try {
      db.prepare("INSERT INTO signal_links(session_id,from_point_id,to_point_id,kind,status,confirmation_origin,confirmed_at) VALUES(?,?,?,'internal','confirmado','operador',?)")
        .run(session.id, channel.id, mic.id, new Date().toISOString());
    } finally { db.close(); }
    const envelope = JSON.parse(readFileSync(good, 'utf8'));
    const unsigned = { format: envelope.format, version: envelope.version, createdAt: envelope.createdAt,
      files: { ...envelope.files, 'cadastros.sqlite': readFileSync(file).toString('base64') } };
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
    await assert.rejects(restoreBackup({ directory: path.join(dir, 'refused'), source: bad }), /ciclo/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
