import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createRegistrySchema, openRegistry } from '../src/registry.js';
import { createBackup, restoreBackup } from '../src/backup.js';

const execFileAsync = promisify(execFile);
const createTemp = () => mkdtempSync(path.join(tmpdir(), 'soundcraft-monitor-'));

test('retornos compartilhados mantêm propostas separadas, histórico e impedem conflito de pessoa', () => {
  const r = openRegistry(':memory:');
  try {
    r.setAuxConfig(8);
    const s = r.createSession('Ensaio');
    const other = r.createSession('Outro');
    const ana = r.addPerson('Ana'); const joao = r.addPerson('João');
    const a = r.addMonitorReturn({ sessionId: s.id, aux: 1 });
    const b = r.addMonitorReturn({ sessionId: s.id, aux: 2 });
    const c = r.addMonitorReturn({ sessionId: other.id, aux: 1 });
    assert.throws(() => r.addMonitorReturn({ sessionId: s.id, aux: 1 }), /UNIQUE/);
    assert.throws(() => r.addMonitorReturn({ sessionId: s.id, aux: 9 }), /AUX/);
    assert.throws(() => r.proposeMonitorAssignment({ sessionId: other.id, personId: ana.id, returnId: a.id }), /FOREIGN KEY/);
    const one = r.proposeMonitorAssignment({ sessionId: s.id, personId: ana.id, returnId: a.id });
    const two = r.proposeMonitorAssignment({ sessionId: s.id, personId: joao.id, returnId: a.id });
    const alternate = r.proposeMonitorAssignment({ sessionId: s.id, personId: ana.id, returnId: b.id });
    const separate = r.proposeMonitorAssignment({ sessionId: other.id, personId: ana.id, returnId: c.id });
    assert.equal(r.listMonitorReturns(s.id)[0].confirmedPeople, 0);
    r.confirmMonitorAssignment(one.id);
    assert.equal(r.listMonitorReturns(s.id)[0].confirmedPeople, 1);
    r.confirmMonitorAssignment(two.id);
    assert.equal(r.listMonitorReturns(s.id)[0].confirmedPeople, 2);
    assert.throws(() => r.confirmMonitorAssignment(alternate.id), /já possui/);
    assert.throws(() => r.rejectMonitorAssignment(one.id), /confirmado/);
    assert.equal(r.revokeMonitorAssignment(one.id).status, 'revogado');
    assert.throws(() => r.confirmMonitorAssignment(one.id), /revogado/);
    assert.equal(r.confirmMonitorAssignment(alternate.id).status, 'confirmado');
    assert.equal(r.confirmMonitorAssignment(separate.id).status, 'confirmado');
    assert.equal(r.listMonitorReturns(s.id)[0].confirmedPeople, 1);
    const rejected = r.proposeMonitorAssignment({ sessionId: s.id, personId: ana.id, returnId: a.id });
    assert.equal(r.rejectMonitorAssignment(rejected.id).status, 'rejeitado');
    assert.throws(() => r.confirmMonitorAssignment(rejected.id), /rejeitado/);
    assert.equal(r.listMonitorAssignments(s.id).find(row => row.id === one.id).status, 'revogado');
  } finally { r.close(); }
});

test('migração v1 concorrente preserva dados e restaura backup v1 antes de atualizar', async () => {
  const dir = createTemp();
  const filename = path.join(dir, 'cadastros.sqlite');
  const db = new DatabaseSync(filename);
  try {
    createRegistrySchema(db, { version: 1 });
    db.exec("INSERT INTO people(name) VALUES ('Ana'); INSERT INTO sessions(name) VALUES ('Ensaio')");
  } finally { db.close(); }
  try {
    const backup = path.join(dir, 'old.json');
    await createBackup({ directory: dir, destination: backup });
    const envelope = JSON.parse(readFileSync(backup, 'utf8'));
    const unsigned = { format: envelope.format, version: 1, createdAt: envelope.createdAt,
      files: { 'cadastros.sqlite': envelope.files['cadastros.sqlite'], 'config.json': envelope.files['config.json'] } };
    writeFileSync(backup, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned), 'utf8').digest('hex') }));
    const target = path.join(dir, 'restored');
    await restoreBackup({ directory: target, source: backup });
    const restored = openRegistry(path.join(target, 'cadastros.sqlite'));
    assert.equal(restored.listPeople()[0].name, 'Ana');
    assert.equal(restored.addMonitorReturn({ sessionId: 1, aux: 3 }).aux, 3);
    restored.close();

    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/registry.js')).href;
    const code = `import {openRegistry} from ${JSON.stringify(moduleUrl)}; const r=openRegistry(${JSON.stringify(filename)}); console.log(r.listPeople()[0].name); r.close();`;
    const outcomes = await Promise.all([execFileAsync(process.execPath, ['--input-type=module', '-e', code]), execFileAsync(process.execPath, ['--input-type=module', '-e', code])]);
    assert.deepEqual(outcomes.map(value => value.stdout.trim()), ['Ana', 'Ana']);
    const check = new DatabaseSync(filename);
    try { assert.equal(check.prepare('PRAGMA user_version').get().user_version, 7); }
    finally { check.close(); }
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('backup de banco atual restaura vínculo compartilhado com contagem correta', async () => {
  const dir = createTemp();
  try {
    const r = openRegistry(path.join(dir, 'cadastros.sqlite'));
    r.setAuxConfig(8);
    const s = r.createSession('Ensaio'); const a = r.addPerson('Ana'); const b = r.addPerson('Bia');
    const aux = r.addMonitorReturn({ sessionId: s.id, aux: 8 });
    for (const p of [a, b]) r.confirmMonitorAssignment(r.proposeMonitorAssignment({ sessionId: s.id, personId: p.id, returnId: aux.id }).id);
    r.close();
    const backup = path.join(dir, 'new.json');
    await createBackup({ directory: dir, destination: backup });
    const target = path.join(dir, 'restore');
    await restoreBackup({ directory: target, source: backup });
    const restored = openRegistry(path.join(target, 'cadastros.sqlite'));
    assert.equal(restored.listMonitorReturns(s.id)[0].confirmedPeople, 2);
    restored.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('confirmações simultâneas de AUX diferentes para a mesma pessoa não geram conflito confirmado', async () => {
  const dir = createTemp();
  const filename = path.join(dir, 'cadastros.sqlite');
  const r = openRegistry(filename);
  try {
    r.setAuxConfig(8);
    const session = r.createSession('Ensaio'); const person = r.addPerson('Ana');
    const a = r.addMonitorReturn({ sessionId: session.id, aux: 1 });
    const b = r.addMonitorReturn({ sessionId: session.id, aux: 2 });
    const one = r.proposeMonitorAssignment({ sessionId: session.id, personId: person.id, returnId: a.id });
    const two = r.proposeMonitorAssignment({ sessionId: session.id, personId: person.id, returnId: b.id });
    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/registry.js')).href;
    const invoke = id => execFileAsync(process.execPath, ['--input-type=module', '-e',
      `import {openRegistry} from ${JSON.stringify(moduleUrl)}; const r=openRegistry(${JSON.stringify(filename)}); try { r.confirmMonitorAssignment(${id}); console.log('ok'); } catch { console.log('conflict'); } finally { r.close(); }`]);
    const result = await Promise.all([invoke(one.id), invoke(two.id)]);
    assert.deepEqual(result.map(item => item.stdout.trim()).sort(), ['conflict', 'ok']);
    assert.equal(r.listMonitorAssignments(session.id).filter(row => row.status === 'confirmado').length, 1);
    assert.equal(r.listMonitorAssignments(session.id).filter(row => row.status === 'proposto').length, 1);
  } finally { r.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('terminal permite cadastrar e confirmar retorno em processos separados', () => {
  const dir = createTemp();
  const run = (...args) => spawnSync(process.execPath, ['src/index.js', '--cadastro', ...args], {
    cwd: process.cwd(), env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: dir }, encoding: 'utf8',
  });
  try {
    for (const args of [['aux-config', 'definir', '8'], ['pessoa', 'adicionar', 'Ana'], ['sessao', 'criar', 'Ensaio'], ['retorno', 'adicionar', '1', '4'],
      ['retorno-vinculo', 'propor', '1', '1', '1'], ['retorno-vinculo', 'confirmar', '1']]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
    }
    const result = run('retorno-vinculo', 'listar', '1');
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output[0].aux, 4);
    assert.equal(output[0].status, 'confirmado');
    assert.equal(output[0].confirmedPeople, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
