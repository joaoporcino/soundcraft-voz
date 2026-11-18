import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('terminal salva e consulta endereço sem depender de voz ou mesa', { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'soundcraft-config-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: directory }, timeout: 5000 };
  const saved = await run(process.execPath, ['src/index.js', '--configurar-ip', '192.168.1.55'], options);
  assert.match(saved.stdout, /Endereço salvo: 192\.168\.1\.55/);
  const loaded = await run(process.execPath, ['src/index.js', '--mostrar-ip'], options);
  assert.match(loaded.stdout, /192\.168\.1\.55/);
  await assert.rejects(run(process.execPath, ['src/index.js', '--configurar-ip', '999.1.1.1'], options));
  const after = await run(process.execPath, ['src/index.js', '--mostrar-ip'], options);
  assert.match(after.stdout, /192\.168\.1\.55/);
});
