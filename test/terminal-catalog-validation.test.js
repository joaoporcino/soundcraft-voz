import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalCatalog } from '../src/terminal-catalog.js';
import { validateCatalogArguments, validateCatalogEntity, validateCatalogRecords } from '../src/terminal-catalog-validation.js';
import { createRegistryRecord } from '../src/terminal-registry-forms.js';
import { runRegistryScreens } from '../src/terminal-registry-screens.js';

test('catálogo confere esquema canônico, classificações e operações explícitas', () => {
  validateCatalogEntity('pessoa');
  validateCatalogEntity('equipamento');
  for (const kind of ['sessao', 'grupo', 'papel', 'fisico-dispositivo']) validateCatalogEntity(kind);
  assert.throws(() => validateCatalogEntity('pessoa', { schemaColumns: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }, { name: 'novo', type: 'TEXT' }] }), /operação bloqueada/);
  assert.throws(() => validateCatalogEntity('pessoa', { schemaColumns: [{ name: 'id', type: 'INTEGER' }] }), /operação bloqueada/);
  assert.throws(() => validateCatalogEntity('pessoa', { schemaColumns: [{ name: 'id', type: 'TEXT' }, { name: 'name', type: 'TEXT' }] }), /operação bloqueada/);
  assert.throws(() => validateCatalogArguments('pessoa', ['equipamento', 'adicionar', 'x']), /operação bloqueada/);
  assert.throws(() => validateCatalogRecords('pessoa', [{ id: 1, name: 'x', interno: 'x' }]), /operação bloqueada/);
  assert.throws(() => validateCatalogRecords('pessoa', [{ id: 1 }]), /operação bloqueada/);
});

test('operação fora do contrato não chega ao cadastro', async () => {
  const form = terminalCatalog.pessoa.create, previous = form.arguments;
  const answers = ['Pessoa', 'SIM', ''], messages = [];
  let writes = 0;
  form.arguments = () => ['grupo', 'adicionar', 'x'];
  try {
    await createRegistryRecord({ category: 'pessoa', ask: async () => answers.shift() ?? null, screen: () => {},
      write: value => messages.push(value), registry: async () => { writes++; } });
    assert.equal(writes, 0);
    assert.match(messages.join('\n'), /operação bloqueada/);
  } finally { form.arguments = previous; }
});

test('lista bloqueia operação incompatível antes de chamar o cadastro', async () => {
  const previous = terminalCatalog.pessoa.list;
  const answers = ['1', '', '0'], screens = [];
  let calls = 0;
  terminalCatalog.pessoa.list = ['grupo', 'listar'];
  try {
    await runRegistryScreens({ screen: (section, title, lines) => screens.push(...lines),
      ask: async () => answers.shift() ?? null, write: () => {}, registry: async () => { calls++; } });
    assert.equal(calls, 0);
    assert.match(screens.join('\n'), /operação bloqueada/);
  } finally { terminalCatalog.pessoa.list = previous; }
});

test('campo inesperado impede formulário antes de perguntar ou gravar', async () => {
  const fields = terminalCatalog.pessoa.create.fields;
  let calls = 0;
  const messages = [];
  fields.push({ key: 'desconhecido', label: 'Campo' });
  try {
    const result = await createRegistryRecord({ category: 'pessoa', ask: async () => { calls++; return null; }, screen: () => {},
      write: value => messages.push(value), registry: async () => { calls++; } });
    assert.equal(result, true);
    assert.equal(calls, 0);
    assert.match(messages.join('\n'), /operação bloqueada/);
  } finally { fields.pop(); }
});
