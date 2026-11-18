import { afterEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig, validateAddress } from '../src/config.js';

const directories = new Set();
async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-config-'));
  directories.add(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all([...directories].map((directory) => rm(directory, { recursive: true, force: true })));
  directories.clear();
});

test('validates IPv4 literals and optional ports', () => {
  assert.equal(validateAddress('192.168.1.20'), '192.168.1.20');
  assert.equal(validateAddress('127.0.0.1:8080'), '127.0.0.1:8080');
  assert.equal(validateAddress(' 10.0.0.1:65535 '), '10.0.0.1:65535');
  for (const address of ['localhost', '256.1.1.1', '1.2.3', '1.2.3.4:0', '1.2.3.4:65536', '1.2.3.4:abc', '::1', '', null]) {
    if (address === null) assert.throws(() => validateAddress(address), TypeError);
    else assert.throws(() => validateAddress(address), Error);
  }
});

test('loads missing configuration as null and saves/loads a valid address', async () => {
  const directory = await temporaryDirectory();
  assert.equal(await loadConfig({ directory }), null);
  assert.deepEqual(await saveConfig('127.0.0.1:8080', { directory }), { ip: '127.0.0.1:8080' });
  assert.deepEqual(await loadConfig({ directory }), { ip: '127.0.0.1:8080' });
});

test('reports malformed or invalid configuration and does not overwrite on validation error', async () => {
  const directory = await temporaryDirectory();
  const filename = path.join(directory, 'config.json');
  await saveConfig('192.168.1.20', { directory });
  const original = await readFile(filename, 'utf8');
  await assert.rejects(saveConfig('300.1.1.1', { directory }));
  assert.equal(await readFile(filename, 'utf8'), original);

  await writeFile(filename, '{broken');
  await assert.rejects(loadConfig({ directory }), /Configuração inválida/);
  await writeFile(filename, JSON.stringify({ ip: 'localhost' }));
  await assert.rejects(loadConfig({ directory }), /Configuração inválida/);
});
