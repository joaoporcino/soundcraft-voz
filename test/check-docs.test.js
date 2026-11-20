import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkDocumentation } from '../scripts/check-docs.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'soundcraft-docs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs', 'especificacoes'), { recursive: true });
  await fs.writeFile(path.join(root, 'README.md'), '[Guia](docs/guia.md) [externo](https://example.com)\n');
  await fs.writeFile(path.join(root, 'AGENTS.md'), '[seção](#local)\n');
  await fs.writeFile(path.join(root, 'docs', 'guia.md'), 'Guia\n');
  return root;
}

test('aceita campos completos, links existentes, externos e exemplos de código', async t => {
  const root = await fixture(t);
  const spec = '## Situação atual\n\n- Estado: parcial\n- Integração: serviço\n- Validação: simulada\n\n# Exemplo\n\n' +
    '[guia](../guia.md#secao)\n`[exemplo](inexistente.md)`\n```md\n[exemplo](inexistente.md)\n```\n';
  await fs.writeFile(path.join(root, 'docs', 'especificacoes', 'exemplo.md'), spec);
  assert.deepEqual(await checkDocumentation(root), []);
});

test('informa campo vazio ou ausente e link local quebrado', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'docs', 'especificacoes', 'falha.md'),
    '## Situação atual\n- Estado:\n- Integração: serviço\n\n[arquivo](ausente.md)\n');
  const errors = await checkDocumentation(root);
  assert.equal(errors.length, 3);
  assert.ok(errors.some(error => error.includes('Estado ausente ou vazio')));
  assert.ok(errors.some(error => error.includes('Validação ausente ou vazio')));
  assert.ok(errors.some(error => error.includes('destino local não encontrado: ausente.md')));
});

test('exige situação atual no início, inclusive quando há título ou outra seção antes', async t => {
  const root = await fixture(t);
  const dir = path.join(root, 'docs', 'especificacoes');
  const fields = '## Situação atual\n- Estado: parcial\n- Integração: serviço\n- Validação: simulada\n';
  await fs.writeFile(path.join(dir, 'titulo.md'), '# Título\n\n' + fields);
  await fs.writeFile(path.join(dir, 'secao.md'), '## Outra seção\n\n' + fields);
  await fs.writeFile(path.join(dir, 'modelo.md'), '# Modelo\n');
  const errors = await checkDocumentation(root);
  assert.equal(errors.length, 2);
  assert.ok(errors.every(error => error.includes('deve ser a primeira seção')));
});
