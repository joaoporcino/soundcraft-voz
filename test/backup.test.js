import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBackup, restoreBackup } from '../src/backup.js';
import { openRegistry } from '../src/registry.js';
import { loadVoiceConfig, saveVoiceConfig } from '../src/voice-config.js';
import { createLlmState } from '../src/llm-state.js';

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'soundcraft-backup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function populate(directory) {
  const registry = openRegistry(path.join(directory, 'cadastros.sqlite'));
  const person = registry.addPerson('João 🎤');
  const equipment = registry.addEquipment({ name: 'Mic principal', kind: 'microfone', color: 'azul', wireless: true });
  const session = registry.createSession('Ensaio');
  registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment.id, channel: 4 });
  registry.close();
  await fs.writeFile(path.join(directory, 'config.json'), '{"ip":"192.168.1.24:8080"}\n');
}

test('creates a portable backup and restores config plus SQLite records', async (t) => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'backup.sfv');
  await populate(source);
  await createBackup({ directory: source, destination: backupPath });

  await restoreBackup({ directory: target, source: backupPath });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, 'config.json'), 'utf8')), { ip: '192.168.1.24:8080' });
  const registry = openRegistry(path.join(target, 'cadastros.sqlite'));
  try {
    assert.equal(registry.listPeople()[0].name, 'João 🎤');
    assert.equal(registry.listAssignments(1)[0].channel, 4);
  } finally { registry.close(); }
  assert.equal(await fs.readFile(path.join(target, 'unrelated.txt'), 'utf8').catch(() => null), null);
});

test('serializes a committed SQLite WAL snapshot while the registry connection remains open', async (t) => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'wal.sfv');
  const databasePath = path.join(source, 'cadastros.sqlite');
  const registry = openRegistry(databasePath);
  const wal = new DatabaseSync(databasePath);
  try {
    wal.exec('PRAGMA journal_mode = WAL');
    registry.addPerson('Registro confirmado no WAL');
    await createBackup({ directory: source, destination: backupPath });
  } finally { wal.close(); registry.close(); }

  await restoreBackup({ directory: target, source: backupPath });
  const restored = openRegistry(path.join(target, 'cadastros.sqlite'));
  try { assert.equal(restored.listPeople()[0].name, 'Registro confirmado no WAL'); } finally { restored.close(); }
});

test('refuses to overwrite existing target data by default', async (t) => {
  const source = await temporaryDirectory(t);
  const target = await temporaryDirectory(t);
  const backupPath = path.join(await temporaryDirectory(t), 'backup.sfv');
  await populate(source);
  await fs.writeFile(path.join(target, 'config.json'), '{"ip":"10.0.0.2"}\n');
  await createBackup({ directory: source, destination: backupPath });
  await assert.rejects(restoreBackup({ directory: target, source: backupPath }), /totalmente vazio/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, 'config.json'), 'utf8')), { ip: '10.0.0.2' });
});

test('rejects oversized backup before changing the destination', async (t) => {
  const root = await temporaryDirectory(t);
  const backupPath = path.join(root, 'oversized.sfv');
  const target = path.join(root, 'destination');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'marker.txt'), 'preservado');
  const file = await fs.open(backupPath, 'w');
  try { await file.truncate(100 * 1024 * 1024 + 1); } finally { await file.close(); }
  await assert.rejects(restoreBackup({ directory: target, source: backupPath }), /excede o limite/);
  assert.deepEqual(await fs.readdir(target), ['marker.txt']);
  assert.equal(await fs.readFile(path.join(target, 'marker.txt'), 'utf8'), 'preservado');
});

test('refuses restore into a directory containing SQLite files, including WAL sidecars', async (t) => {
  const source = await temporaryDirectory(t);
  const target = await temporaryDirectory(t);
  const backupPath = path.join(await temporaryDirectory(t), 'backup.sfv');
  await populate(source);
  await populate(target);
  await createBackup({ directory: source, destination: backupPath });
  const before = await fs.readFile(path.join(target, 'cadastros.sqlite'));
  await fs.writeFile(path.join(target, 'cadastros.sqlite-wal'), 'active WAL marker');
  await assert.rejects(restoreBackup({ directory: target, source: backupPath }), /totalmente vazio/);
  assert.deepEqual(await fs.readFile(path.join(target, 'cadastros.sqlite')), before);
});

test('rejects corrupted or unsupported backups without changing destination', async (t) => {
  const source = await temporaryDirectory(t);
  const target = await temporaryDirectory(t);
  const backupPath = path.join(await temporaryDirectory(t), 'backup.sfv');
  await populate(source);
  await createBackup({ directory: source, destination: backupPath });
  await fs.writeFile(path.join(target, 'config.json'), '{"ip":"10.0.0.2"}\n');
  const contents = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  contents.files['config.json'] = Buffer.from('{"ip":"not-an-ip"}').toString('base64');
  await fs.writeFile(backupPath, JSON.stringify(contents));
  await assert.rejects(restoreBackup({ directory: target, source: backupPath, overwrite: true }), /Checksum/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, 'config.json'), 'utf8')), { ip: '10.0.0.2' });
});

test('exports only the known IP config and rejects configs containing extra secret fields', async (t) => {
  const source = await temporaryDirectory(t);
  const backupPath = path.join(await temporaryDirectory(t), 'backup.sfv');
  await fs.writeFile(path.join(source, 'config.json'), JSON.stringify({ ip: '192.168.1.24', apiKey: 'must-not-export' }));
  await assert.rejects(createBackup({ directory: source, destination: backupPath }), /campos ausentes ou não suportados/);
  await assert.rejects(fs.access(backupPath));
});

test('does not allow the backup file to overwrite a local data file', async (t) => {
  const source = await temporaryDirectory(t);
  await populate(source);
  await assert.rejects(createBackup({ directory: source, destination: path.join(source, 'config.json') }), /não pode substituir/);
  await assert.rejects(createBackup({ directory: source, destination: path.join(source, 'voice-config.json') }), /não pode substituir/);
});

test('version 5 restores a voice-only backup with exact validated settings', async t => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'voice.sfv');
  const config = { python: path.resolve(source, 'venv', 'python.exe'), model: 'small', device: 'USB 2', channel: 2 };
  await saveVoiceConfig(config, { directory: source });
  await createBackup({ directory: source, destination: backupPath });
  const contents = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.equal(contents.version, 5);
  assert.equal(contents.files['config.json'], null);
  assert.equal(contents.files['cadastros.sqlite'], null);
  const result = await restoreBackup({ directory: target, source: backupPath });
  assert.deepEqual(result.restored, ['voice-config.json']);
  assert.deepEqual(await loadVoiceConfig({ directory: target }), config);
});

test('restores version 1 backup without manufacturing a voice file', async t => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'legacy.sfv');
  await populate(source);
  await createBackup({ directory: source, destination: backupPath });
  const { sha256: ignored, ...unsigned } = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  void ignored;
  unsigned.version = 1;
  delete unsigned.files['voice-config.json'];
  delete unsigned.files['mode-config.json'];
  delete unsigned.files['voice-inputs.json'];
  delete unsigned.files['llm-state.sqlite'];
  await fs.writeFile(backupPath, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
  const result = await restoreBackup({ directory: target, source: backupPath });
  assert.ok(!result.restored.includes('voice-config.json'));
  await assert.rejects(fs.access(path.join(target, 'voice-config.json')));
  const llm = createLlmState({ directory: target });
  try { assert.equal(llm.read().restore_lock, 1); } finally { llm.close(); }
  assert.equal(JSON.parse(await fs.readFile(path.join(target, 'config.json'), 'utf8')).ip, '192.168.1.24:8080');
});

test('restores version 2 backup without manufacturing a mode file', async t => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'legacy-v2.sfv');
  const config = { python: 'python', model: 'small', device: null, channel: 1 };
  await saveVoiceConfig(config, { directory: source });
  await createBackup({ directory: source, destination: backupPath });
  const { sha256: ignored, ...unsigned } = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  void ignored;
  unsigned.version = 2;
  delete unsigned.files['mode-config.json'];
  delete unsigned.files['voice-inputs.json'];
  delete unsigned.files['llm-state.sqlite'];
  await fs.writeFile(backupPath, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
  await restoreBackup({ directory: target, source: backupPath });
  assert.deepEqual(await loadVoiceConfig({ directory: target }), config);
  await assert.rejects(fs.access(path.join(target, 'mode-config.json')));
});

test('restores version 4 with quota locked until acknowledged', async t => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored-v4');
  const backupPath = path.join(await temporaryDirectory(t), 'legacy-v4.sfv');
  await populate(source);
  await createBackup({ directory: source, destination: backupPath });
  const { sha256: ignored, ...unsigned } = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  void ignored;
  unsigned.version = 4;
  delete unsigned.files['llm-state.sqlite'];
  await fs.writeFile(backupPath, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
  await restoreBackup({ directory: target, source: backupPath });
  const llm = createLlmState({ directory: target });
  try {
    assert.equal(llm.read().restore_lock, 1);
    const configured = llm.configure({ provider: 'gemini', model: 'modelo', dailyLimit: 1 });
    assert.throws(() => llm.reserve(configured.generation), /revisão/);
    llm.acknowledgeRestore();
    assert.equal(llm.reserve(llm.read().generation).used, 1);
  } finally { llm.close(); }
});

test('rejects a version 1 backup with no data as empty', async t => {
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'empty-v1.sfv');
  const unsigned = { format: 'soundcraft-voz-backup', version: 1, createdAt: new Date().toISOString(),
    files: { 'cadastros.sqlite': null, 'config.json': null } };
  await fs.writeFile(backupPath, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
  await assert.rejects(restoreBackup({ directory: target, source: backupPath }), /Backup vazio/);
  await assert.rejects(fs.access(target));
});

test('rejects voice config with extra secret or invalid channel, including checksum-valid tampering', async t => {
  const source = await temporaryDirectory(t);
  const target = path.join(await temporaryDirectory(t), 'restored');
  const backupPath = path.join(await temporaryDirectory(t), 'voice.sfv');
  const config = { python: 'python', model: 'small', device: null, channel: 1 };
  await saveVoiceConfig(config, { directory: source });
  await createBackup({ directory: source, destination: backupPath });
  const original = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  for (const invalid of [{ ...config, token: 'secret' }, { ...config, channel: 0 }]) {
    const { sha256: ignored, ...unsigned } = original;
    void ignored;
    unsigned.files = { ...unsigned.files, 'voice-config.json': Buffer.from(JSON.stringify(invalid)).toString('base64') };
    await fs.writeFile(backupPath, JSON.stringify({ ...unsigned, sha256: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }));
    await assert.rejects(restoreBackup({ directory: target, source: backupPath }), /Configuração de voz do backup inválida/);
    await assert.rejects(fs.access(target));
    await fs.writeFile(path.join(source, 'voice-config.json'), JSON.stringify(invalid));
    await assert.rejects(createBackup({ directory: source, destination: path.join(source, 'new-backup') }), /Configuração de voz do backup inválida/);
    await assert.rejects(fs.access(path.join(source, 'new-backup')));
  }
});

test('rejects altered schema and canonical schema with conflicting confirmed assignments', async (t) => {
  const source = await temporaryDirectory(t);
  const backupPath = path.join(await temporaryDirectory(t), 'backup.sfv');
  const target = path.join(await temporaryDirectory(t), 'restored');
  await populate(source);
  await createBackup({ directory: source, destination: backupPath });
  const original = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const dbPath = path.join(source, 'cadastros.sqlite');
  for (const mutate of [
    db => db.exec("DROP TABLE assignments; CREATE TABLE assignments (id, session_id, person_id, equipment_id, channel, status); CREATE INDEX assignments_session_idx ON assignments(session_id, id); INSERT INTO assignments VALUES (1,99,99,99,999,'confirmado')"),
    db => db.exec("UPDATE assignments SET status='confirmado'; INSERT INTO assignments(session_id,person_id,equipment_id,channel,status) SELECT session_id,person_id,equipment_id,channel,status FROM assignments"),
  ]) {
    await fs.writeFile(dbPath, Buffer.from(original.files['cadastros.sqlite'], 'base64'));
    const db = new DatabaseSync(dbPath);
    try { mutate(db); } finally { db.close(); }
    const { sha256: ignored, ...unsigned } = original;
    void ignored;
    unsigned.files = { ...unsigned.files, 'cadastros.sqlite': (await fs.readFile(dbPath)).toString('base64') };
    const sha256 = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
    await fs.writeFile(backupPath, JSON.stringify({ ...unsigned, sha256 }));
    await assert.rejects(restoreBackup({ directory: target, source: backupPath }), /Banco SQLite do backup inválido/);
    await assert.rejects(fs.access(target));
  }
});
