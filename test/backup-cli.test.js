import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('terminal exporta e restaura sem substituir dados existentes', { timeout: 25000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'soundcraft-backup-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, 'dados');
  const backup = join(root, 'backup.json');
  const restored = join(root, 'restaurado');
  const options = { env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: data }, timeout: 5000 };
  const invoke = (...args) => run(process.execPath, ['src/index.js', ...args], options);
  await invoke('--configurar-ip', '192.168.1.55');
  await invoke('--cadastro', 'pessoa', 'adicionar', 'Ana');
  await invoke('--exportar-backup', backup);
  await assert.rejects(invoke('--exportar-backup', backup));
  await invoke('--restaurar-backup', backup, '--destino', restored);
  await assert.rejects(invoke('--restaurar-backup', backup, '--destino', data));
  const recovered = await run(process.execPath, ['src/index.js', '--cadastro', 'pessoa', 'listar'], {
    ...options, env: { ...options.env, SOUNDCRAFT_CONFIG_DIR: restored },
  });
  assert.match(recovered.stdout, /Ana/);
});
