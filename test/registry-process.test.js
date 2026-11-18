import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('cadastros e vínculos são recuperados pelo terminal em processos separados', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'soundcraft-registry-process-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: directory }, timeout: 5000 };
  const run = (...args) => execute(process.execPath, ['src/index.js', '--cadastro', ...args], options);
  await run('pessoa', 'adicionar', 'Ana');
  await run('equipamento', 'adicionar', 'Voz', 'microfone', 'amarelo', '--sem-fio');
  await run('sessao', 'criar', 'Ensaio');
  await run('vinculo', 'propor', '1', '1', '1', '3');
  const before = await run('vinculo', 'listar', '1');
  assert.match(before.stdout, /proposto/);
  await run('vinculo', 'confirmar', '1');
  const after = await run('vinculo', 'listar', '1');
  assert.match(after.stdout, /confirmado/);
  const equipment = await run('equipamento', 'listar', 'AMARELO');
  assert.match(equipment.stdout, /amarelo/);
  await assert.rejects(run('vinculo', 'propor', '1', '1', '1', '25'));
});
