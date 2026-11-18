import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfigDirectory, validateAddress } from './config.js';
import { createRegistrySchema } from './registry.js';
import { validateVoiceConfig } from './voice-config.js';
import { validateModeConfig } from './mode-policy.js';
import { MODE_CONFIG_FILE } from './mode-config.js';
import { VOICE_INPUT_FILE, validateVoiceInputs } from './voice-input-config.js';
import { LLM_STATE_FILE, validateLlmStateDatabase, createLlmState } from './llm-state.js';

const FORMAT = 'soundcraft-voz-backup';
const FORMAT_VERSION = 5;
const SUPPORTED_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6, 7];
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const DATABASE_FILE = 'cadastros.sqlite';
const CONFIG_FILE = 'config.json';
const VOICE_CONFIG_FILE = 'voice-config.json';
const LEGACY_DATA_FILES = [DATABASE_FILE, CONFIG_FILE, VOICE_CONFIG_FILE, MODE_CONFIG_FILE, VOICE_INPUT_FILE];
const DATA_FILES = [...LEGACY_DATA_FILES, LLM_STATE_FILE];

const BASE_TABLE_COLUMNS = {
  people: ['id', 'name'],
  equipment: ['id', 'name', 'kind', 'color', 'wireless', 'capsule', 'model'],
  sessions: ['id', 'name'],
  assignments: ['id', 'session_id', 'person_id', 'equipment_id', 'channel', 'status'],
};
const MONITOR_TABLE_COLUMNS = {
  monitor_returns: ['id', 'session_id', 'aux'],
  monitor_assignments: ['id', 'session_id', 'person_id', 'return_id', 'status'],
};
const MONITOR_CONFIG_COLUMNS = { monitor_config: ['id', 'aux_count', 'source'] };
const PHYSICAL_COLUMNS = {
  physical_devices: ['id', 'name', 'type'],
  signal_points: ['id', 'type', 'label', 'direction', 'device_id', 'equipment_id', 'person_id', 'monitor_return_id', 'channel'],
  signal_links: ['id', 'session_id', 'from_point_id', 'to_point_id', 'kind', 'status', 'confirmation_origin', 'confirmed_at'],
  voice_proposals: ['id', 'session_id', 'phrase', 'origin', 'person_id', 'equipment_id', 'channel', 'status', 'assignment_id'],
};

function consistentDatabaseSnapshot(filename) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'soundcraft-sqlite-snapshot-'));
  const snapshotPath = path.join(temporaryDirectory, DATABASE_FILE);
  const db = new DatabaseSync(filename);
  try {
    // VACUUM INTO uses SQLite's read snapshot, including committed WAL pages, and
    // emits a standalone database image that can be validated and moved safely.
    db.prepare('VACUUM INTO ?').run(snapshotPath);
    return readFileSync(snapshotPath);
  } finally {
    db.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} inválido.`);
}

function assertKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contém campos ausentes ou não suportados.`);
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function validateConfigBytes(buffer) {
  let config;
  try { config = JSON.parse(buffer.toString('utf8')); } catch (error) {
    throw new Error(`Configuração do backup inválida: ${error.message}`, { cause: error });
  }
  assertKeys(config, ['ip'], 'Configuração do backup');
  return { ip: validateAddress(config.ip) };
}

function validateVoiceConfigBytes(buffer) {
  try { return validateVoiceConfig(JSON.parse(buffer.toString('utf8'))); }
  catch (error) { throw new Error(`Configuração de voz do backup inválida: ${error.message}`, { cause: error }); }
}

function validateLlmStateBytes(buffer) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'soundcraft-llm-validate-'));
  const temporaryPath = path.join(temporaryDirectory, LLM_STATE_FILE);
  writeFileSync(temporaryPath, buffer, { flag: 'wx' });
  const db = new DatabaseSync(temporaryPath);
  try { validateLlmStateDatabase(db); }
  finally { db.close(); rmSync(temporaryDirectory, { recursive: true, force: true }); }
}

function validateDatabase(buffer) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'soundcraft-sqlite-validate-'));
  const temporaryPath = path.join(temporaryDirectory, DATABASE_FILE);
  writeFileSync(temporaryPath, buffer, { flag: 'wx' });
  const db = new DatabaseSync(temporaryPath);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('integridade SQLite inválida');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) throw new Error(`versão de esquema SQLite não suportada: ${version}`);
    const tableColumns = version === 1 ? BASE_TABLE_COLUMNS : { ...BASE_TABLE_COLUMNS, ...MONITOR_TABLE_COLUMNS,
      ...(version >= 3 ? MONITOR_CONFIG_COLUMNS : {}), ...(version >= 4 ? PHYSICAL_COLUMNS : {}),
      ...(version >= 5 ? { input_sources: ['session_id', 'input_id', 'assignment_id', 'binding_id'] } : {}),
      ...(version >= 6 ? { registry_corrections: ['id', 'entity_type', 'entity_id', 'before_json', 'after_json', 'changed_at'],
        retired_assignments: ['assignment_id', 'replacement_id', 'inputs_json', 'changed_at'] } : {}),
      ...(version >= 7 ? { teams: ['id', 'name'], roles: ['id', 'name'],
        team_members: ['team_id', 'person_id'], team_member_roles: ['team_id', 'person_id', 'role_id'],
        session_teams: ['session_id', 'team_id'], session_members: ['session_id', 'team_id', 'person_id'],
        session_roles: ['session_id', 'team_id', 'person_id', 'role_id'] } : {}) };

    const canonical = new DatabaseSync(':memory:');
    try {
      createRegistrySchema(canonical, { version });
      const objects = (database) => database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
      if (JSON.stringify(objects(db)) !== JSON.stringify(objects(canonical))) throw new Error('esquema SQLite não corresponde ao esquema canônico');
    } finally { canonical.close(); }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => name);
    if (tables.length !== Object.keys(tableColumns).length || tables.some((name, index) => name !== Object.keys(tableColumns).sort()[index])) {
      throw new Error('o banco contém tabelas ausentes ou não suportadas');
    }
    for (const [table, expected] of Object.entries(tableColumns)) {
      const columns = db.prepare(`PRAGMA table_info('${table}')`).all().map(({ name }) => name);
      if (columns.length !== expected.length || columns.some((name, index) => name !== expected[index])) {
        throw new Error(`estrutura da tabela ${table} não suportada`);
      }
    }
    const customObjects = db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type <> 'table' ORDER BY type, name").all();
    const expectedIndexes = version === 1 ? ['assignments_session_idx'] :
      ['assignments_session_idx', 'monitor_assignments_confirmed_person_idx', 'monitor_assignments_session_idx',
        ...(version >= 4 ? ['signal_links_session_idx', 'voice_proposals_session_idx'] : [])];
    if (customObjects.length !== expectedIndexes.length || customObjects.some((item, index) => item.type !== 'index' || item.name !== expectedIndexes[index])) {
      throw new Error('o banco contém objetos SQLite não suportados');
    }
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length) throw new Error('o banco contém referências inválidas');
    const activeAssignment = version >= 6 ? ' AND NOT EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=assignments.id)' : '';
    const invalid = db.prepare(`SELECT 1 FROM assignments WHERE id <= 0 OR session_id <= 0 OR person_id <= 0 OR equipment_id <= 0 OR (status = 'confirmado' AND channel IS NULL)
      UNION ALL SELECT 1 FROM assignments WHERE status = 'confirmado' ${activeAssignment} GROUP BY session_id, equipment_id HAVING count(*) > 1
      UNION ALL SELECT 1 FROM assignments WHERE status = 'confirmado' ${activeAssignment} GROUP BY session_id, channel HAVING count(*) > 1
      UNION ALL SELECT 1 FROM people WHERE id <= 0 OR length(name) > 200 OR name <> trim(name)
      UNION ALL SELECT 1 FROM sessions WHERE id <= 0 OR length(name) > 200 OR name <> trim(name)
      UNION ALL SELECT 1 FROM equipment WHERE id <= 0 OR length(name) > 200 OR name <> trim(name) OR length(kind) > 200 OR kind <> trim(kind)
      OR (color IS NOT NULL AND (length(color) > 200 OR length(trim(color)) = 0 OR color <> trim(color)))
      OR (capsule IS NOT NULL AND (length(capsule) > 200 OR length(trim(capsule)) = 0 OR capsule <> trim(capsule)))
      OR (model IS NOT NULL AND (length(model) > 200 OR length(trim(model)) = 0 OR model <> trim(model))) LIMIT 1`).get();
    if (invalid) throw new Error('o banco contém dados fora das regras do cadastro');
    if (version >= 2) {
      const invalidMonitor = db.prepare(`SELECT 1 FROM monitor_returns WHERE id <= 0 OR session_id <= 0
        UNION ALL SELECT 1 FROM monitor_assignments WHERE id <= 0 OR session_id <= 0 OR person_id <= 0 OR return_id <= 0
        UNION ALL SELECT 1 FROM monitor_assignments WHERE status = 'confirmado' GROUP BY session_id, person_id HAVING count(*) > 1 LIMIT 1`).get();
      if (invalidMonitor) throw new Error('o banco contém retornos fora das regras do cadastro');
    }
    if (version >= 3) {
      const config = db.prepare('SELECT id, aux_count AS auxCount, source FROM monitor_config').all();
      if (config.length !== 1 || config[0].id !== 1 ||
          (config[0].source === 'nao_configurado' ? config[0].auxCount !== null :
            !['legado', 'configurado'].includes(config[0].source) || !Number.isSafeInteger(config[0].auxCount) ||
            config[0].auxCount < 1 || (config[0].source === 'legado' && config[0].auxCount !== 8))) {
        throw new Error('configuração de AUX inválida');
      }
      const count = config[0].auxCount;
      if (db.prepare('SELECT 1 FROM monitor_returns WHERE ? IS NULL OR aux > ? LIMIT 1').get(count, count)) {
        throw new Error('retorno excede a quantidade de AUX configurada');
      }
    }
    if (version >= 4) {
      const invalidPhysical = db.prepare(`SELECT 1 FROM physical_devices WHERE id <= 0 OR length(name)>200 OR name<>trim(name)
        UNION ALL SELECT 1 FROM signal_points WHERE id<=0 OR length(label)>200 OR label<>trim(label)
          OR (type='snake_way' AND NOT EXISTS (SELECT 1 FROM physical_devices d WHERE d.id=device_id AND d.type='medusa'))
        UNION ALL SELECT 1 FROM signal_links l JOIN signal_points p ON p.id=l.from_point_id
          LEFT JOIN signal_points q ON q.id=l.to_point_id
          WHERE l.id<=0 OR l.session_id<=0 OR l.from_point_id<=0 OR (l.to_point_id IS NOT NULL AND l.to_point_id<=0)
            OR (p.monitor_return_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM monitor_returns r WHERE r.id=p.monitor_return_id AND r.session_id=l.session_id))
            OR (q.monitor_return_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM monitor_returns r WHERE r.id=q.monitor_return_id AND r.session_id=l.session_id))
            OR (l.status='confirmado' AND (p.direction='unknown' OR q.direction='unknown'
              OR length(trim(l.confirmation_origin))=0 OR length(l.confirmation_origin)>200 OR l.confirmation_origin<>trim(l.confirmation_origin)
              OR (l.kind='physical' AND (p.direction NOT IN ('output','bidirectional') OR q.direction NOT IN ('input','bidirectional')))
              OR (l.kind='patch' AND (p.type<>'port' OR p.direction NOT IN ('input','bidirectional') OR q.type<>'channel'
                OR NOT EXISTS (SELECT 1 FROM physical_devices d WHERE d.id=p.device_id AND d.type='mesa')))))
        UNION ALL SELECT 1 FROM signal_links l JOIN signal_points q ON q.id=l.to_point_id
          WHERE l.status='confirmado' AND q.type<>'mix' GROUP BY l.session_id,l.to_point_id HAVING count(*)>1
        UNION ALL SELECT 1 FROM voice_proposals WHERE id<=0 OR session_id<=0 OR length(phrase)>4000 OR phrase<>trim(phrase)
          OR length(origin)>200 OR origin<>trim(origin)
        UNION ALL SELECT 1 FROM voice_proposals v JOIN assignments a ON a.id=v.assignment_id
          WHERE v.status='confirmado' AND (a.status<>'confirmado' OR a.session_id<>v.session_id OR a.person_id<>v.person_id
            OR a.equipment_id<>v.equipment_id OR a.channel<>v.channel) LIMIT 1`).get();
      if (invalidPhysical) throw new Error('o banco contém caminhos ou propostas fora das regras do cadastro');
      const confirmedTimes = db.prepare("SELECT confirmed_at FROM signal_links WHERE status='confirmado'").all();
      if (confirmedTimes.some(({ confirmed_at }) => !Number.isFinite(Date.parse(confirmed_at)))) throw new Error('data de confirmação inválida');
      const cycle = db.prepare(`WITH RECURSIVE reach(session_id,from_id,to_id) AS (
        SELECT session_id,from_point_id,to_point_id FROM signal_links WHERE status='confirmado'
        UNION SELECT r.session_id,r.from_id,l.to_point_id FROM reach r JOIN signal_links l
          ON l.session_id=r.session_id AND l.from_point_id=r.to_id AND l.status='confirmado'
      ) SELECT 1 FROM reach WHERE from_id=to_id LIMIT 1`).get();
      if (cycle) throw new Error('o banco contém ciclo de ligações confirmadas');
    }
    if (version >= 5) {
      const invalidInput = db.prepare(`SELECT 1 FROM input_sources i JOIN assignments a ON a.id=i.assignment_id
        WHERE i.session_id<=0 OR i.assignment_id<=0 OR length(i.input_id)>200 OR i.input_id<>trim(i.input_id)
          OR a.session_id<>i.session_id OR a.status<>'confirmado' LIMIT 1`).get();
      if (invalidInput) throw new Error('o banco contém vínculos de entrada inválidos');
      const ids = db.prepare('SELECT input_id,binding_id FROM input_sources').all();
      if (ids.some(({ input_id, binding_id }) => [...input_id].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(binding_id))) throw new Error('identificador de entrada inválido');
    }
    if (version >= 6) {
      const invalidRetired = db.prepare(`SELECT 1 FROM retired_assignments r JOIN assignments a ON a.id=r.assignment_id
        JOIN assignments b ON b.id=r.replacement_id WHERE a.status<>'confirmado' OR a.session_id<>b.session_id OR r.replacement_id<=r.assignment_id
        OR EXISTS(SELECT 1 FROM input_sources i WHERE i.assignment_id=r.assignment_id) LIMIT 1`).get();
      if (invalidRetired) throw new Error('o banco contém substituições de vínculo inválidas');
      const retired = db.prepare('SELECT inputs_json,changed_at FROM retired_assignments').all();
      for (const row of retired) {
        const inputs = JSON.parse(row.inputs_json);
        if (!Array.isArray(inputs) || inputs.some(input => !input || Object.keys(input).sort().join(',') !== 'bindingId,inputId' ||
          typeof input.inputId !== 'string' || !input.inputId || input.inputId !== input.inputId.trim() || input.inputId.length > 200 ||
          [...input.inputId].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(input.bindingId)) ||
          !Number.isFinite(Date.parse(row.changed_at))) throw new Error('histórico de vínculo inválido');
      }
      const corrections = db.prepare('SELECT entity_type,entity_id,before_json,after_json,changed_at FROM registry_corrections').all();
      for (const row of corrections) {
        const before = JSON.parse(row.before_json), after = JSON.parse(row.after_json);
        const validText = value => typeof value === 'string' && value.length <= 200 && value.length > 0 && value === value.trim();
        const validSnapshot = value => {
          if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== row.entity_id || !validText(value.name)) return false;
          if (row.entity_type === 'pessoa') return Object.keys(value).sort().join(',') === 'id,name';
          return Object.keys(value).sort().join(',') === 'capsule,color,id,kind,model,name,wireless' && validText(value.kind) &&
            [value.color, value.capsule, value.model].every(field => field === null || validText(field)) &&
            (value.wireless === null || typeof value.wireless === 'boolean');
        };
        if (!validSnapshot(before) || !validSnapshot(after) || !Number.isFinite(Date.parse(row.changed_at))) throw new Error('histórico de cadastro inválido');
        const table = row.entity_type === 'pessoa' ? 'people' : 'equipment';
        if (!db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(row.entity_id)) throw new Error('histórico referencia cadastro inexistente');
      }
    }
    if (version >= 7) {
      const invalidTeam = db.prepare(`SELECT 1 FROM teams WHERE id<=0 OR length(name)>200 OR name<>trim(name)
        UNION ALL SELECT 1 FROM roles WHERE id<=0 OR length(name)>200 OR name<>trim(name)
        UNION ALL SELECT 1 FROM team_members WHERE team_id<=0 OR person_id<=0
        UNION ALL SELECT 1 FROM team_member_roles WHERE team_id<=0 OR person_id<=0 OR role_id<=0
        UNION ALL SELECT 1 FROM session_teams WHERE session_id<=0 OR team_id<=0
        UNION ALL SELECT 1 FROM session_members WHERE session_id<=0 OR team_id<=0 OR person_id<=0
        UNION ALL SELECT 1 FROM session_roles WHERE session_id<=0 OR team_id<=0 OR person_id<=0 OR role_id<=0 LIMIT 1`).get();
      if (invalidTeam) throw new Error('o banco contém equipes ou formações inválidas');
    }
  } catch (error) {
    throw new Error(`Banco SQLite do backup inválido: ${error.message}`, { cause: error });
  } finally {
    db.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseBackup(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BACKUP_BYTES) throw new Error('Arquivo de backup excede o limite permitido.');
  let backup;
  try { backup = JSON.parse(buffer.toString('utf8')); } catch (error) {
    throw new Error(`Arquivo de backup inválido: ${error.message}`, { cause: error });
  }
  assertKeys(backup, ['format', 'version', 'createdAt', 'files', 'sha256'], 'Backup');
  if (backup.format !== FORMAT || ![1, 2, 3, 4, FORMAT_VERSION].includes(backup.version)) throw new Error('Formato ou versão de backup não suportado.');
  if (typeof backup.createdAt !== 'string' || !Number.isFinite(Date.parse(backup.createdAt))) throw new Error('Data de criação do backup inválida.');
  const filenames = backup.version === 1 ? [DATABASE_FILE, CONFIG_FILE] : backup.version === 2 ? [DATABASE_FILE, CONFIG_FILE, VOICE_CONFIG_FILE]
    : backup.version === 3 ? [DATABASE_FILE, CONFIG_FILE, VOICE_CONFIG_FILE, MODE_CONFIG_FILE] : backup.version === 4 ? LEGACY_DATA_FILES : DATA_FILES;
  assertKeys(backup.files, filenames, 'Conteúdo do backup');
  if (backup[DATABASE_FILE] !== undefined || backup[CONFIG_FILE] !== undefined) throw new Error('Backup contém conteúdo em posição inesperada.');

  const { sha256, ...unsigned } = backup;
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) || digest(unsigned) !== sha256) throw new Error('Checksum do backup não confere.');
  const result = { [VOICE_CONFIG_FILE]: null, [MODE_CONFIG_FILE]: null, [VOICE_INPUT_FILE]: null, [LLM_STATE_FILE]: null };
  for (const filename of filenames) {
    const encoded = backup.files[filename];
    if (encoded === null) { result[filename] = null; continue; }
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_BACKUP_BYTES * 4 / 3)) throw new Error(`Conteúdo de ${filename} inválido.`);
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error(`Codificação de ${filename} inválida.`);
    if (filename === DATABASE_FILE) validateDatabase(bytes);
    else if (filename === CONFIG_FILE) validateConfigBytes(bytes);
    else if (filename === VOICE_CONFIG_FILE) validateVoiceConfigBytes(bytes);
    else if (filename === MODE_CONFIG_FILE) validateModeConfig(JSON.parse(bytes.toString('utf8')));
    else if (filename === VOICE_INPUT_FILE) validateVoiceInputs(JSON.parse(bytes.toString('utf8')));
    else validateLlmStateBytes(bytes);
    result[filename] = bytes;
  }
  return { createdAt: backup.createdAt, files: result };
}

async function readOptional(filename) {
  try { return await fs.readFile(filename); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Check the open file and bound every read: a file may grow after stat().
async function readBackupFile(filename) {
  const file = await fs.open(filename, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('O backup precisa ser um arquivo regular.');
    if (info.size > MAX_BACKUP_BYTES) throw new Error('Arquivo de backup excede o limite permitido.');
    const chunks = [];
    let total = 0;
    while (total <= MAX_BACKUP_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_BACKUP_BYTES + 1 - total));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_BACKUP_BYTES) throw new Error('Arquivo de backup excede o limite permitido.');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await file.close();
  }
}

async function existingDataFiles(directory) {
  return Promise.all(DATA_FILES.map(async (name) => ({ name, bytes: await readOptional(path.join(directory, name)) })));
}

/** Exporta snapshot SQLite consistente e configurações locais conhecidas. */
export async function createBackup({ directory = getConfigDirectory(), destination } = {}) {
  if (typeof destination !== 'string' || !destination) throw new TypeError('Informe o caminho do arquivo de backup.');
  const entries = await existingDataFiles(directory);
  const files = Object.fromEntries(entries.map(({ name, bytes }) => [name, bytes?.toString('base64') ?? null]));
  let dbEntry = entries.find(({ name }) => name === DATABASE_FILE).bytes;
  const configEntry = entries.find(({ name }) => name === CONFIG_FILE).bytes;
  const voiceEntry = entries.find(({ name }) => name === VOICE_CONFIG_FILE).bytes;
  const modeEntry = entries.find(({ name }) => name === MODE_CONFIG_FILE).bytes;
  const voiceInputsEntry = entries.find(({ name }) => name === VOICE_INPUT_FILE).bytes;
  let llmEntry = entries.find(({ name }) => name === LLM_STATE_FILE).bytes;
  if (dbEntry) {
    dbEntry = consistentDatabaseSnapshot(path.join(directory, DATABASE_FILE));
    files[DATABASE_FILE] = dbEntry.toString('base64');
  }
  if (dbEntry) validateDatabase(dbEntry);
  if (configEntry) {
    const normalized = validateConfigBytes(configEntry);
    files[CONFIG_FILE] = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8').toString('base64');
  }
  if (voiceEntry) {
    const normalized = validateVoiceConfigBytes(voiceEntry);
    files[VOICE_CONFIG_FILE] = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8').toString('base64');
  }
  if (modeEntry) {
    const normalized = validateModeConfig(JSON.parse(modeEntry.toString('utf8')));
    files[MODE_CONFIG_FILE] = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8').toString('base64');
  }
  if (voiceInputsEntry) {
    const normalized = validateVoiceInputs(JSON.parse(voiceInputsEntry.toString('utf8')));
    files[VOICE_INPUT_FILE] = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8').toString('base64');
  }
  if (llmEntry) {
    llmEntry = consistentDatabaseSnapshot(path.join(directory, LLM_STATE_FILE));
    validateLlmStateBytes(llmEntry);
    files[LLM_STATE_FILE] = llmEntry.toString('base64');
  }
  const unsigned = { format: FORMAT, version: FORMAT_VERSION, createdAt: new Date().toISOString(), files };
  const payload = Buffer.from(JSON.stringify({ ...unsigned, sha256: digest(unsigned) }, null, 2) + '\n', 'utf8');
  if (payload.length > MAX_BACKUP_BYTES) throw new Error('Backup excede o limite de tamanho permitido.');
  const target = path.resolve(destination);
  if (DATA_FILES.some(name => target === path.resolve(directory, name))) throw new Error('O arquivo de backup não pode substituir os dados locais.');
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, payload, { flag: 'wx' });
    // Link exclusivo impede substituir silenciosamente um backup existente,
    // inclusive se outro processo criar o destino durante a exportação.
    await fs.link(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new Error(`Não foi possível gravar o backup: ${error.message}`, { cause: error });
  }
  await fs.rm(temporary, { force: true }).catch(() => {});
  return { destination: target, createdAt: unsigned.createdAt, bytes: payload.length };
}

/** Restaura em um diretório vazio, sem substituir cadastros ou configuração existentes. */
export async function restoreBackup({ directory = getConfigDirectory(), source } = {}) {
  if (typeof source !== 'string' || !source) throw new TypeError('Informe o caminho do arquivo de backup.');
  const sourcePath = path.resolve(source);
  const targetDirectory = path.resolve(directory);
  const backup = parseBackup(await readBackupFile(sourcePath));
  if (DATA_FILES.every(name => backup.files[name] === null)) throw new Error('Backup vazio não pode ser restaurado.');

  const parentDirectory = path.dirname(targetDirectory);
  await fs.mkdir(parentDirectory, { recursive: true });
  const id = `${process.pid}.${randomUUID()}`;
  const stageDirectory = path.join(parentDirectory, `.${path.basename(targetDirectory)}.${id}.new`);
  const previousDirectory = path.join(parentDirectory, `.${path.basename(targetDirectory)}.${id}.old`);
  let targetExists = false;
  let previousMoved = false;
  let stageInstalled = false;
  try {
    try {
      const info = await fs.lstat(targetDirectory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('O destino da restauração precisa ser um diretório vazio.');
      targetExists = true;
      if ((await fs.readdir(targetDirectory)).length !== 0) throw new Error('O destino da restauração precisa estar totalmente vazio.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await fs.mkdir(stageDirectory);
    for (const name of DATA_FILES) {
      if (backup.files[name] !== null) await fs.writeFile(path.join(stageDirectory, name), backup.files[name], { flag: 'wx' });
    }
    // Every restore, including legacy backups, starts locked: quotas may have rolled back.
    const llmState = createLlmState({ directory: stageDirectory });
    try { llmState.markRestored(); } finally { llmState.close(); }
    if (targetExists) {
      await fs.rename(targetDirectory, previousDirectory);
      previousMoved = true;
    }
    await fs.rename(stageDirectory, targetDirectory);
    stageInstalled = true;
  } catch (error) {
    if (previousMoved) await fs.rename(previousDirectory, targetDirectory).catch(() => {});
    await fs.rm(stageDirectory, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Restauração não concluída; o destino anterior foi preservado quando possível: ${error.message}`, { cause: error });
  }

  const cleanupWarnings = [];
  if (stageInstalled && previousMoved) {
    try { await fs.rmdir(previousDirectory); } catch (error) { cleanupWarnings.push(`Não foi possível remover diretório vazio anterior ${path.basename(previousDirectory)}: ${error.message}`); }
  }
  return {
    directory: targetDirectory,
    restored: Object.keys(backup.files).filter((name) => backup.files[name] !== null),
    cleanupWarnings,
  };
}

export const BACKUP_FORMAT_VERSION = FORMAT_VERSION;
