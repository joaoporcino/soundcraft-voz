import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadVoiceConfig, saveVoiceConfig } from '../src/voice-config.js';
import { runVoiceConfigCli } from '../src/voice-config-cli.js';

async function temp(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'voice-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('defaults and validated configuration persist across processes', async t => {
  const directory = await temp(t);
  assert.deepEqual(await loadVoiceConfig({ directory }), { python: 'python', model: 'small', device: null, channel: 1 });
  const python = path.resolve(directory, 'Python virtual', 'python.exe');
  await saveVoiceConfig({ python, model: 'tiny', device: 'USB interface', channel: 2 }, { directory });
  const result = spawnSync(process.execPath, ['src/voice-config-cli.js', 'show'], {
    cwd: process.cwd(), env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: directory }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { python, model: 'tiny', device: 'USB interface', channel: 2 });
});

test('partial updates preserve fields and reset device to default', async t => {
  const directory = await temp(t);
  const output = [];
  const opts = { directory, stdout: value => output.push(value), stderr: value => output.push(value) };
  assert.equal(await runVoiceConfigCli(['set', '--modelo', 'base', '--dispositivo', '3', '--canal', '2'], opts), 0);
  assert.equal(await runVoiceConfigCli(['set', '--dispositivo', 'padrao'], opts), 0);
  assert.deepEqual(await loadVoiceConfig({ directory }), { python: 'python', model: 'base', device: null, channel: 2 });
});

test('invalid arguments or malformed existing file never overwrite data', async t => {
  const directory = await temp(t);
  await saveVoiceConfig({ python: 'python', model: 'small', device: null, channel: 1 }, { directory });
  const filename = path.join(directory, 'voice-config.json');
  const before = await readFile(filename, 'utf8');
  const options = { directory, stdout() {}, stderr() {} };
  for (const args of [ ['set', '--canal', '0'], ['set', '--canal', '257'], ['set', '--python', 'relative/python'],
    ['set', '--modelo', '../tiny'], ['set', '--canal', '1', '--canal', '2'], ['set', '--x', '1'], ['set', '--modelo'] ]) {
    assert.equal(await runVoiceConfigCli(args, options), 1, args.join(' '));
    assert.equal(await readFile(filename, 'utf8'), before);
  }
  await writeFile(filename, '{broken');
  assert.equal(await runVoiceConfigCli(['set', '--canal', '2'], options), 1);
  assert.equal(await readFile(filename, 'utf8'), '{broken');
});

test('rejects unknown fields, malformed types and unsafe values before writing', async t => {
  const directory = await temp(t);
  const base = { python: 'python', model: 'small', device: null, channel: 1 };
  for (const changes of [ { extra: 1 }, { python: '' }, { model: '-option' }, { device: '--help' },
    { channel: 1.5 }, { channel: '1' }, { model: 'x\ny' } ]) {
    await assert.rejects(saveVoiceConfig({ ...base, ...changes }, { directory }));
  }
  assert.deepEqual(await loadVoiceConfig({ directory }), base);
});

test('portable absolute paths can be restored independent of the current operating system', async t => {
  const directory = await temp(t);
  for (const python of ['C:\\Users\\Example\\python.exe', '/opt/example/bin/python']) {
    const config = { python, model: 'small', device: null, channel: 1 };
    await saveVoiceConfig(config, { directory });
    assert.deepEqual(await loadVoiceConfig({ directory }), config);
  }
});
