import { DatabaseSync } from 'node:sqlite';
import { createRegistrySchema } from './registry.js';
import { terminalCatalog } from './terminal-catalog.js';

// Explicit presentation contract; schema and result shape never grant write access.
const CONTRACTS = Object.freeze({
  pessoa: { table: 'people', action: 'adicionar', columns: { id: 'INTEGER', name: 'TEXT' }, public: ['name'], readonly: ['id'], internal: [], computed: [], optional: [] },
  equipamento: { table: 'equipment', columns: { id: 'INTEGER', name: 'TEXT', kind: 'TEXT', color: 'TEXT', wireless: 'INTEGER', capsule: 'TEXT', model: 'TEXT' },
    action: 'adicionar', public: ['name', 'kind', 'color', 'wireless', 'capsule', 'model'], readonly: ['id'], internal: [], computed: [], optional: ['color', 'wireless', 'capsule', 'model'] },
  sessao: { table: 'sessions', action: 'criar', columns: { id: 'INTEGER', name: 'TEXT' }, public: ['name'], readonly: ['id'], internal: [], computed: [], optional: [] },
  grupo: { table: 'teams', action: 'adicionar', columns: { id: 'INTEGER', name: 'TEXT' }, public: ['name'], readonly: ['id'], internal: [], computed: [], optional: [] },
  papel: { table: 'roles', action: 'adicionar', columns: { id: 'INTEGER', name: 'TEXT' }, public: ['name'], readonly: ['id'], internal: [], computed: [], optional: [] },
  'fisico-dispositivo': { table: 'physical_devices', action: 'adicionar', columns: { id: 'INTEGER', name: 'TEXT', type: 'TEXT' },
    public: ['name', 'type'], readonly: ['id'], internal: [], computed: [], optional: [] },
});

let canonicalSchema;
function schema() {
  if (canonicalSchema) return canonicalSchema;
  const db = new DatabaseSync(':memory:');
  try {
    createRegistrySchema(db);
    canonicalSchema = Object.fromEntries(Object.entries(CONTRACTS).map(([key, contract]) => [key,
      db.prepare(`PRAGMA table_info(${contract.table})`).all().map(column => ({ name: column.name, type: column.type }))]));
    return canonicalSchema;
  } finally { db.close(); }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = category => { throw new Error(`Catálogo incompatível para ${category}; operação bloqueada.`); };

export function validateCatalogEntity(category, { schemaColumns } = {}) {
  const contract = CONTRACTS[category], entry = terminalCatalog[category];
  if (!contract || !entry || typeof entry.title !== 'string' || !entry.title.trim() || !entry.storage || !entry.labels || !entry.create || !Array.isArray(entry.create.fields) || typeof entry.create.arguments !== 'function' ||
      !same(entry.list, [category, 'listar'])) fail(category);
  if (!same(Object.keys(entry.storage).sort(), ['computed', 'internal', 'public', 'readonly'])) fail(category);
  for (const kind of ['public', 'readonly', 'internal', 'computed']) {
    if (!same(entry.storage[kind], contract[kind])) fail(category);
  }
  if (entry.create.fields.some(field => !field || typeof field !== 'object') ||
      !same(entry.create.fields.map(field => field.key), contract.public) ||
      entry.create.fields.some(field => typeof field.label !== 'string' || !field.label.trim() || (field.optional !== undefined && field.optional !== true) ||
        Boolean(field.optional) !== contract.optional.includes(field.key) ||
        (field.key === 'wireless' ? !same(field.options, ['1', '2']) :
          category === 'fisico-dispositivo' && field.key === 'type' ? !same(field.options, ['mesa', 'medusa', 'outro']) : field.options !== undefined))) fail(category);
  const columns = schemaColumns ?? schema()[category];
  if (!Array.isArray(columns) || columns.some(column => !column || typeof column !== 'object') ||
      !same(columns.map(({ name, type }) => ({ name, type })), Object.entries(contract.columns).map(([name, type]) => ({ name, type })))) fail(category);
  if (!same(Object.keys(entry.labels), [...contract.readonly, ...contract.public]) ||
      Object.values(entry.labels).some(label => typeof label !== 'string' || !label.trim())) fail(category);
}

export function validateCatalogRecords(category, records) {
  validateCatalogEntity(category);
  const fields = [...CONTRACTS[category].readonly, ...CONTRACTS[category].public];
  if (!Array.isArray(records) || records.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
      !same(Object.keys(item).sort(), [...fields].sort()))) fail(category);
  for (const item of records) {
    if (!Number.isSafeInteger(item.id) || item.id < 1 || typeof item.name !== 'string') fail(category);
    if (category === 'equipamento' && (typeof item.kind !== 'string' ||
        ['color', 'capsule', 'model'].some(key => item[key] !== null && typeof item[key] !== 'string') ||
        item.wireless !== null && typeof item.wireless !== 'boolean')) fail(category);
    if (category === 'fisico-dispositivo' && !['mesa', 'medusa', 'outro'].includes(item.type)) fail(category);
  }
}

export function validateCatalogArguments(category, args) {
  validateCatalogEntity(category);
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string') || args[0] !== category || args[1] !== CONTRACTS[category].action) fail(category);
}
