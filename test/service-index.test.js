import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

test('terminal principal consulta serviço indisponível sem iniciar voz', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'soundcraft-service-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(promisify(execFile)(process.execPath, ['src/index.js', '--servico', 'status'], {
    env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: directory }, timeout: 5000,
  }), error => error.code === 1 && /parado ou indisponível/.test(error.stdout));
});
