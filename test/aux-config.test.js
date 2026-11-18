import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createRegistrySchema, openRegistry } from '../src/registry.js';
import { createBackup, restoreBackup } from '../src/backup.js';

const runProcess = promisify(execFile);

test('quantidade precisa ser definida em banco novo e respeita limites sem apagar dados', () => {
  const registry = openRegistry(':memory:');
  try {
    assert.deepEqual({ ...registry.getAuxConfig() }, { auxCount: null, source: 'nao_configurado' });
    const session = registry.createSession('Ensaio');
    assert.throws(() => registry.addMonitorReturn({ sessionId: session.id, aux: 1 }), /não configurada/);
    for (const value of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1, '8', null]) {
      assert.throws(() => registry.setAuxConfig(value));
    }
    assert.deepEqual({ ...registry.setAuxConfig(12) }, { auxCount: 12, source: 'configurado' });
    assert.equal(registry.addMonitorReturn({ sessionId: session.id, aux: 9 }).aux, 9);
    assert.throws(() => registry.addMonitorReturn({ sessionId: session.id, aux: 13 }), /quantidade configurada/);
    assert.throws(() => registry.setAuxConfig(8), /AUX 9 já cadastrado/);
    assert.equal(registry.getAuxConfig().auxCount, 12);
    assert.equal(registry.listMonitorReturns(session.id)[0].aux, 9);
  } finally { registry.close(); }
});

test('migra banco v2 e backup legado preservando dados e registrando origem não confirmada', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-aux-v2-'));
  const filename = path.join(dir, 'cadastros.sqlite');
  const db = new DatabaseSync(filename);
  try {
    createRegistrySchema(db, { version: 2 });
    db.exec("INSERT INTO sessions(id,name) VALUES(1,'Ensaio'); INSERT INTO people(id,name) VALUES(1,'Ana'); INSERT INTO monitor_returns(id,session_id,aux) VALUES(1,1,8); INSERT INTO monitor_assignments(id,session_id,person_id,return_id,status) VALUES(1,1,1,1,'confirmado');");
  } finally { db.close(); }
  try {
    const backup = path.join(dir, 'backup.json');
    await createBackup({ directory: dir, destination: backup });
    const target = path.join(dir, 'restored');
    await restoreBackup({ directory: target, source: backup });
    const registry = openRegistry(path.join(target, 'cadastros.sqlite'));
    try {
      assert.deepEqual({ ...registry.getAuxConfig() }, { auxCount: 8, source: 'legado' });
      assert.equal(registry.listMonitorAssignments(1)[0].status, 'confirmado');
      assert.throws(() => registry.setAuxConfig(7), /AUX 8 já cadastrado/);
      registry.setAuxConfig(10);
      assert.equal(registry.addMonitorReturn({ sessionId: 1, aux: 9 }).aux, 9);
      assert.equal(registry.getAuxConfig().source, 'configurado');
    } finally { registry.close(); }
    const currentBackup = path.join(dir, 'backup-v3.json');
    await createBackup({ directory: target, destination: currentBackup });
    const target2 = path.join(dir, 'restored-v3');
    await restoreBackup({ directory: target2, source: currentBackup });
    const restored = openRegistry(path.join(target2, 'cadastros.sqlite'));
    try {
      assert.deepEqual({ ...restored.getAuxConfig() }, { auxCount: 10, source: 'configurado' });
      assert.deepEqual(restored.listMonitorReturns(1).map(row => row.aux), [8, 9]);
    } finally { restored.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('backup v3 preserva configuração ausente e rejeita retorno inconsistente com checksum válido', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-aux-backup-'));
  try {
    const filename = path.join(dir, 'cadastros.sqlite');
    const registry = openRegistry(filename);
    registry.createSession('Ensaio');
    registry.close();
    const good = path.join(dir, 'good.json');
    await createBackup({ directory: dir, destination: good });
    const target = path.join(dir, 'empty-restored');
    await restoreBackup({ directory: target, source: good });
    const restored = openRegistry(path.join(target, 'cadastros.sqlite'));
    try { assert.equal(restored.getAuxConfig().source, 'nao_configurado'); } finally { restored.close(); }

    const altered = new DatabaseSync(filename);
    altered.exec('INSERT INTO monitor_returns(session_id,aux) VALUES(1,9)');
    altered.close();
    const envelope = JSON.parse(readFileSync(good, 'utf8'));
    const unsigned = { format: envelope.format, version: envelope.version, createdAt: envelope.createdAt,
      files: { ...envelope.files, 'cadastros.sqlite': readFileSync(filename).toString('base64') } };
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
    await assert.rejects(restoreBackup({ directory: path.join(dir, 'refused'), source: bad }), /quantidade de AUX/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('configuração por terminal persiste e permite cadastrar AUX acima de oito', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-aux-cli-'));
  const run = (...args) => spawnSync(process.execPath, ['src/index.js', '--cadastro', ...args], {
    cwd: process.cwd(), env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: dir }, encoding: 'utf8',
  });
  try {
    assert.deepEqual(JSON.parse(run('aux-config', 'mostrar').stdout), { auxCount: null, source: 'nao_configurado' });
    for (const args of [['aux-config', 'definir', '10'], ['sessao', 'criar', 'Ensaio'], ['retorno', 'adicionar', '1', '9']]) {
      const result = run(...args); assert.equal(result.status, 0, result.stderr);
    }
    assert.deepEqual(JSON.parse(run('aux-config', 'mostrar').stdout), { auxCount: 10, source: 'configurado' });
    assert.notEqual(run('aux-config', 'definir', '8').status, 0);
    assert.equal(JSON.parse(run('retorno', 'listar', '1').stdout)[0].aux, 9);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('alterar limite e cadastrar retorno concorrentemente nunca produz dados fora do limite', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-aux-race-'));
  const filename = path.join(dir, 'cadastros.sqlite');
  const registry = openRegistry(filename);
  registry.setAuxConfig(12);
  registry.createSession('Ensaio');
  registry.close();
  try {
    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/registry.js')).href;
    const program = action => `import {openRegistry} from ${JSON.stringify(moduleUrl)}; const r=openRegistry(${JSON.stringify(filename)}); try { ${action}; console.log('ok'); } catch { console.log('refused'); } finally { r.close(); }`;
    const results = await Promise.all([
      runProcess(process.execPath, ['--input-type=module', '-e', program('r.setAuxConfig(8)')]),
      runProcess(process.execPath, ['--input-type=module', '-e', program('r.addMonitorReturn({sessionId:1,aux:9})')]),
    ]);
    assert.deepEqual(results.map(result => result.stdout.trim()).sort(), ['ok', 'refused']);
    const check = openRegistry(filename);
    try { assert.ok(check.listMonitorReturns(1).every(row => row.aux <= check.getAuxConfig().auxCount)); }
    finally { check.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('falha na migração reverte schema e preserva versão e cadastros anteriores', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'soundcraft-aux-rollback-'));
  const filename = path.join(dir, 'cadastros.sqlite');
  try {
    const db = new DatabaseSync(filename);
    try {
      createRegistrySchema(db, { version: 2 });
      db.exec("INSERT INTO people(name) VALUES ('Ana'); DROP TABLE monitor_assignments; DROP TABLE monitor_returns;");
    } finally { db.close(); }
    assert.throws(() => openRegistry(filename), /monitor_returns/);
    const check = new DatabaseSync(filename);
    try {
      assert.equal(check.prepare('PRAGMA user_version').get().user_version, 2);
      assert.equal(check.prepare('SELECT name FROM people').get().name, 'Ana');
      assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'monitor_config'").get().n, 0);
    } finally { check.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
