import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const LLM_STATE_FILE = 'llm-state.sqlite';
export const LLM_STATE_SCHEMA = `CREATE TABLE llm_state (
 id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL, model TEXT,
 daily_limit INTEGER, generation INTEGER NOT NULL, day TEXT, used INTEGER NOT NULL,
 last_at TEXT, restore_lock INTEGER NOT NULL
)`;

export function createLlmStateSchema(db) {
  db.exec(LLM_STATE_SCHEMA);
  db.prepare('INSERT INTO llm_state VALUES (1, ?, NULL, NULL, 0, NULL, 0, NULL, 0)').run('none');
  db.exec('PRAGMA user_version = 1');
}

export function validateLlmSettings({ provider, model, dailyLimit }) {
  if (!['none', 'gemini', 'openai', 'anthropic'].includes(provider)) throw new Error('Provedor inválido.');
  if (provider === 'none') {
    if (model !== null || (dailyLimit !== null && (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000))) throw new Error('Configuração none inválida.');
  } else if (typeof model !== 'string' || model.length > 100 || !/^[\w.-]+$/.test(model) ||
      !Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000) {
    throw new Error('Informe modelo e limite diário positivo.');
  }
  return { provider, model, dailyLimit };
}

export function validateLlmStateDatabase(db) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA user_version').get().user_version !== 1) throw new Error('Integridade do estado de LLM inválida.');
  const objects = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  if (objects.length !== 1 || objects[0].type !== 'table' || objects[0].name !== 'llm_state' || objects[0].sql !== LLM_STATE_SCHEMA) throw new Error('Esquema do estado de LLM inválido.');
  const rows = db.prepare('SELECT * FROM llm_state').all();
  if (rows.length !== 1 || rows[0].id !== 1) throw new Error('Estado de LLM inválido.');
  const row = rows[0];
  validateLlmSettings({ provider: row.provider, model: row.model, dailyLimit: row.daily_limit });
  if (!Number.isSafeInteger(row.generation) || row.generation < 0 || !Number.isSafeInteger(row.used) || row.used < 0 ||
      ![0, 1].includes(row.restore_lock) || (row.day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) ||
      (row.last_at !== null && (typeof row.last_at !== 'string' || !Number.isFinite(Date.parse(row.last_at)) || new Date(row.last_at).toISOString() !== row.last_at)) ||
      ((row.day === null) !== (row.last_at === null)) || (row.day === null && row.used !== 0) ||
      (row.last_at !== null && row.day !== row.last_at.slice(0, 10))) throw new Error('Contagem de LLM inválida.');
  return row;
}

export function createLlmState({ directory, now = () => new Date() } = {}) {
  if (directory) mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(directory ? path.join(directory, LLM_STATE_FILE) : ':memory:');
  db.exec('PRAGMA busy_timeout=5000');
  try {
    const count = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n;
    if (count === 0 && db.prepare('PRAGMA user_version').get().user_version === 0) createLlmStateSchema(db);
    validateLlmStateDatabase(db);
  } catch (error) { db.close(); throw error; }
  let closed = false;
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  function read() { return validateLlmStateDatabase(db); }
  function configure(value) {
    const config = validateLlmSettings(value);
    return transaction(() => {
      read();
      db.prepare('UPDATE llm_state SET provider=?, model=?, daily_limit=?, generation=generation+1 WHERE id=1').run(config.provider, config.model, config.dailyLimit);
      return read();
    });
  }
  function reserve(expectedGeneration) {
    return transaction(() => {
      const row = read();
      if (row.generation !== expectedGeneration || row.provider === 'none' || row.restore_lock === 1) throw new Error('Configuração indisponível ou requer revisão.');
      const date = now();
      if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Relógio inválido.');
      const timestamp = date.toISOString(), day = timestamp.slice(0, 10);
      if (row.last_at !== null && timestamp < row.last_at) throw new Error('Relógio retrocedeu; pedido bloqueado.');
      const used = row.day === day ? row.used : 0;
      if (used >= row.daily_limit) throw new Error('Limite diário de tentativas atingido.');
      db.prepare('UPDATE llm_state SET day=?, used=?, last_at=? WHERE id=1').run(day, used + 1, timestamp);
      return { day, used: used + 1 };
    });
  }
  function acknowledgeRestore() {
    return transaction(() => { read(); db.exec('UPDATE llm_state SET restore_lock=0, generation=generation+1 WHERE id=1'); return read(); });
  }
  function markRestored() {
    return transaction(() => { read(); db.exec('UPDATE llm_state SET restore_lock=1, generation=generation+1 WHERE id=1'); return read(); });
  }
  return Object.freeze({ read, configure, reserve, acknowledgeRestore, markRestored, close() { if (!closed) { closed = true; db.close(); } } });
}
