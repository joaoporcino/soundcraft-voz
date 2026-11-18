import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { openRegistry } from '../src/registry.js';

const execFileAsync = promisify(execFile);

async function withRegistry(run) {
  const dir = mkdtempSync(join(tmpdir(), 'soundcraft-registry-'));
  const path = join(dir, 'registry.sqlite');
  const registry = openRegistry(path);
  try { return await run(registry, path); } finally { registry.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('persists Unicode records across connections and a new Node process', () => withRegistry((registry, path) => {
  const person = registry.addPerson('João d’Ávila 🎤');
  const equipment = registry.addEquipment({ name: 'Voz principal', kind: 'microfone', color: 'Azul', wireless: true, capsule: 'SM58', model: 'ULX-D' });
  const session = registry.createSession('Culto de domingo');
  const proposal = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment.id });
  assert.equal(proposal.status, 'proposto');
  assert.equal(proposal.channel, null);
  registry.close();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {openRegistry} from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'src/registry.js')).href)}; const r=openRegistry(${JSON.stringify(path)}); console.log(JSON.stringify({p:r.listPeople(),e:r.listEquipment(),s:r.listSessions(),a:r.listAssignments(1)})); r.close();`], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.p[0].name, 'João d’Ávila 🎤');
  assert.equal(result.e[0].wireless, true);
  assert.equal(result.a[0].channel, null);
}));

test('allows duplicate names and colors and returns every color match', () => withRegistry((r) => {
  r.addEquipment({ name: 'Lapela A', kind: 'microfone', color: 'preto', wireless: true });
  r.addEquipment({ name: 'Lapela B', kind: 'microfone', color: 'preto', wireless: false });
  r.addEquipment({ name: 'Cabo', kind: 'acessório', color: 'preto', wireless: false });
  assert.equal(r.listEquipment({ color: 'preto' }).length, 3);
  assert.equal(r.listEquipment({ color: 'preto', kind: 'microfone' }).length, 2);
  assert.equal(r.listEquipment({ color: 'PRETO' }).length, 3);
}));

test('preserves unknown wireless state as null and explicit true/false values', () => withRegistry((r) => {
  const unknown = r.addEquipment({ name: 'Mic sem informação', kind: 'microfone' });
  const wired = r.addEquipment({ name: 'Mic com fio', kind: 'microfone', wireless: false });
  const radio = r.addEquipment({ name: 'Mic sem fio', kind: 'microfone', wireless: true });
  assert.equal(unknown.wireless, null);
  assert.deepEqual(r.listEquipment().map((item) => item.wireless), [null, false, true]);
  assert.equal(wired.wireless, false);
  assert.equal(radio.wireless, true);
}));

test('proposals require valid references and bounded channel; confirmed conflicts roll back', () => withRegistry((r) => {
  const p1 = r.addPerson('Ana'); const p2 = r.addPerson('Ana');
  const e1 = r.addEquipment({ name: 'Mic 1', kind: 'microfone', wireless: true });
  const e2 = r.addEquipment({ name: 'Mic 2', kind: 'microfone', wireless: true });
  const s = r.createSession('Ensaio');
  assert.throws(() => r.proposeAssignment({ sessionId: s.id, personId: p1.id, equipmentId: e1.id, channel: 25 }), /channel/);
  assert.throws(() => r.proposeAssignment({ sessionId: s.id, personId: 900, equipmentId: e1.id, channel: 1 }));
  const noChannel = r.proposeAssignment({ sessionId: s.id, personId: p1.id, equipmentId: e1.id });
  assert.throws(() => r.confirmAssignment(noChannel.id), /sem canal/);
  assert.equal(r.listAssignments(s.id)[0].status, 'proposto');
  const first = r.proposeAssignment({ sessionId: s.id, personId: p1.id, equipmentId: e1.id, channel: 1 });
  const sameChannel = r.proposeAssignment({ sessionId: s.id, personId: p2.id, equipmentId: e2.id, channel: 1 });
  const sameEquipment = r.proposeAssignment({ sessionId: s.id, personId: p2.id, equipmentId: e1.id, channel: 2 });
  assert.equal(r.confirmAssignment(first.id).status, 'confirmado');
  assert.throws(() => r.confirmAssignment(sameChannel.id), /Canal/);
  assert.throws(() => r.confirmAssignment(sameEquipment.id), /Equipamento/);
  assert.equal(r.listAssignments(s.id).find((a) => a.id === sameChannel.id).status, 'proposto');
  assert.equal(r.listAssignments(s.id).filter((a) => a.status === 'confirmado').length, 1);
}));

test('conflicts are scoped to session and multiple sources may belong to one person', () => withRegistry((r) => {
  const p = r.addPerson('Rui');
  const a = r.addEquipment({ name: 'Mic A', kind: 'microfone', wireless: false });
  const b = r.addEquipment({ name: 'Mic B', kind: 'microfone', wireless: false });
  const s1 = r.createSession('Hoje'); const s2 = r.createSession('Amanhã');
  const x = r.proposeAssignment({ sessionId: s1.id, personId: p.id, equipmentId: a.id, channel: 5 });
  const y = r.proposeAssignment({ sessionId: s1.id, personId: p.id, equipmentId: b.id, channel: 6 });
  const z = r.proposeAssignment({ sessionId: s2.id, personId: p.id, equipmentId: a.id, channel: 5 });
  r.confirmAssignment(x.id); r.confirmAssignment(y.id); r.confirmAssignment(z.id);
  assert.equal(r.listAssignments(s1.id).filter((item) => item.status === 'confirmado').length, 2);
  assert.equal(r.listAssignments(s2.id)[0].status, 'confirmado');
}));

test('parameterized values cannot inject SQL and invalid input is rejected', () => withRegistry((r) => {
  const literal = "x'); DROP TABLE people; --";
  r.addPerson(literal);
  assert.equal(r.listPeople()[0].name, literal);
  assert.equal(r.addPerson('Ana').name, 'Ana');
  assert.throws(() => r.addPerson('  '), TypeError);
  assert.throws(() => r.listAssignments('1'), TypeError);
  assert.throws(() => r.addEquipment({ name: 'Mic', kind: 'microfone', wireless: 'sim' }), TypeError);
}));

test('rejects future schema versions without changing them', () => withRegistry((r, path) => {
  r.close();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version = 99'); db.close();
  assert.throws(() => openRegistry(path), /mais recente/);
  const verify = new DatabaseSync(path);
  assert.equal(verify.prepare('PRAGMA user_version').get().user_version, 99);
  verify.close();
}));

test('serializes confirmation across two connections and preserves the losing proposal', () => withRegistry((first, path) => {
  const second = openRegistry(path);
  try {
    const person = first.addPerson('Lia');
    const mic1 = first.addEquipment({ name: 'A', kind: 'microfone', wireless: true });
    const mic2 = first.addEquipment({ name: 'B', kind: 'microfone', wireless: true });
    const session = first.createSession('Concorrência');
    const one = first.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: mic1.id, channel: 3 });
    const two = second.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: mic2.id, channel: 3 });
    first.confirmAssignment(one.id);
    assert.throws(() => second.confirmAssignment(two.id), /Canal/);
    assert.equal(first.listAssignments(session.id).length, 2);
    assert.equal(second.listAssignments(session.id).find((item) => item.id === two.id).status, 'proposto');
  } finally { second.close(); }
}));

test('simultaneous processes cannot confirm conflicting assignments', () => withRegistry(async (r, path) => {
  const person = r.addPerson('Marta');
  const mic1 = r.addEquipment({ name: 'Mic conc. 1', kind: 'microfone', wireless: true });
  const mic2 = r.addEquipment({ name: 'Mic conc. 2', kind: 'microfone', wireless: true });
  const session = r.createSession('Concorrência entre processos');
  const one = r.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: mic1.id, channel: 8 });
  const two = r.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: mic2.id, channel: 8 });
  const moduleUrl = pathToFileURL(join(process.cwd(), 'src/registry.js')).href;
  const invoke = (id) => execFileAsync(process.execPath, ['--input-type=module', '-e',
    `import {openRegistry} from ${JSON.stringify(moduleUrl)}; const r=openRegistry(${JSON.stringify(path)}); await new Promise(resolve=>setTimeout(resolve,100)); try { r.confirmAssignment(${id}); console.log('confirmed'); } catch(e) { console.log('rejected'); } finally { r.close(); }`]);
  const outcomes = await Promise.all([invoke(one.id), invoke(two.id)]);
  assert.deepEqual(outcomes.map(({ stdout }) => stdout.trim()).sort(), ['confirmed', 'rejected']);
  assert.equal(r.listAssignments(session.id).filter((item) => item.status === 'confirmado').length, 1);
  assert.equal(r.listAssignments(session.id).length, 2);
}));
