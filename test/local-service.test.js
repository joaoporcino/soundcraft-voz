import { afterEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { getStatus, runLocalServiceCli } from '../src/local-service-cli.js';

const directories = new Set();
const services = new Set();

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-local-service-'));
  directories.add(directory);
  const service = await createLocalService({
    port: 0,
    runtimeDirectory: directory,
    readConfig: async () => null,
  });
  services.add(service);
  return { directory, service };
}

afterEach(async () => {
  await Promise.all([...services].map(service => service.close()));
  services.clear();
  await Promise.all([...directories].map(directory => rm(directory, { recursive: true, force: true })));
  directories.clear();
});

test('refuses a non-loopback bind address', async () => {
  await assert.rejects(createLocalService({ host: '0.0.0.0', runtimeDirectory: os.tmpdir() }), /somente o endereço loopback/);
});

test('serves status only with the local secret and rejects unknown routes', async () => {
  const { directory, service } = await setup();
  const manifest = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
  const base = `http://127.0.0.1:${service.address.port}`;

  const unauthorized = await globalThis.fetch(`${base}/status`);
  assert.equal(unauthorized.status, 401);

  const status = await globalThis.fetch(`${base}/status`, { headers: { 'x-soundcraft-token': manifest.token } });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), {
    service: 'requer-configuracao',
    pid: process.pid,
    mixer: { status: 'sem-configuracao', connected: false, appliedIp: null, restartRequired: false },
    observation: { connected: false, channels: {} },
    commands: { mode: 'paused', passageInputs: ['principal'], masterInputId: null, allowedInputs: [], activeSessionId: null },
    voice: { state: 'idle', error: null },
    voiceInputs: [{ inputId: 'principal', state: 'idle', error: null }],
    llm: { selected: 'none', model: null, available: false, credentialAvailable: false, costLimit: 'not-configured', dailyLimit: null, used: 0, day: null, restoreReviewRequired: false, reloadRequired: false },
  });

  const unknown = await globalThis.fetch(`${base}/anything`, { headers: { 'x-soundcraft-token': manifest.token } });
  assert.equal(unknown.status, 404);
});

test('reports mocked mixer state and stops it through the administrative CLI', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-local-service-mixer-'));
  directories.add(directory);
  let started = 0;
  let stopped = 0;
  const service = await createLocalService({
    port: 0,
    runtimeDirectory: directory,
    readConfig: async () => ({ ip: '192.0.2.10' }),
    createConnection: () => ({
      status: 'conectada',
      start() { started += 1; },
      isConnected() { return true; },
      async stop() { stopped += 1; },
    }),
  });
  services.add(service);
  assert.equal(started, 1);

  const output = [];
  const errors = [];
  const exitCode = await runLocalServiceCli(['status'], { directory, stdout: value => output.push(value), stderr: value => errors.push(value) });
  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(JSON.parse(output[0]), {
    service: 'ativo', pid: process.pid, mixer: { status: 'conectada', connected: true, appliedIp: '192.0.2.10', restartRequired: false },
    observation: { connected: false, channels: {} },
    commands: { mode: 'paused', passageInputs: ['principal'], masterInputId: null, allowedInputs: [], activeSessionId: null },
    voice: { state: 'idle', error: null },
    voiceInputs: [{ inputId: 'principal', state: 'idle', error: null }],
    llm: { selected: 'none', model: null, available: false, credentialAvailable: false, costLimit: 'not-configured', dailyLimit: null, used: 0, day: null, restoreReviewRequired: false, reloadRequired: false },
  });

  const stopCode = await runLocalServiceCli(['stop'], { directory, stdout: value => output.push(value), stderr: value => errors.push(value) });
  assert.equal(stopCode, 0);
  assert.equal(stopped, 1);
  assert.equal(service.getState(), 'encerrado');
});

test('reports a stopped service and rejects administrative calls without a manifest', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-local-service-empty-'));
  directories.add(directory);
  const output = [];
  const exitCode = await runLocalServiceCli(['status'], { directory, stdout: value => output.push(value), stderr: () => {} });
  assert.equal(exitCode, 1);
  assert.match(output[0], /parado ou indisponível/);
});

test('starts, queries and stops a separate simulated daemon process', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-local-service-cli-'));
  directories.add(directory);
  const output = [];
  const errors = [];
  const options = { directory, stdout: value => output.push(value), stderr: value => errors.push(value) };

  assert.equal(await runLocalServiceCli(['start'], { ...options, startOptions: { port: 0, timeoutMs: 10000 } }), 0);
  assert.match(output.at(-1), /iniciado/);
  assert.deepEqual(errors, []);

  assert.equal(await runLocalServiceCli(['status'], options), 0);
  assert.equal(JSON.parse(output.at(-1)).mixer.status, 'sem-configuracao');

  assert.equal(await runLocalServiceCli(['stop'], { ...options, stopOptions: { timeoutMs: 5000 } }), 0);
  assert.match(output.at(-1), /encerrado/);
  assert.equal(await runLocalServiceCli(['status'], options), 1);
});

test('closes the listener and mixer when publishing the runtime manifest fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-local-service-publish-'));
  directories.add(directory);
  const { mkdirSync } = await import('node:fs');
  let stopped = 0;
  await assert.rejects(createLocalService({
    port: 0,
    runtimeDirectory: directory,
    readConfig: async () => ({ ip: '192.0.2.10' }),
    createConnection: () => ({ start() { mkdirSync(path.join(directory, `local-service.json.${process.pid}.tmp`)); }, async stop() { stopped += 1; } }),
  }));
  assert.equal(stopped, 1);
});

test('reports spawn errors and terminates a child when the startup deadline expires', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-local-service-start-failure-'));
  directories.add(directory);
  const output = [];
  const errors = [];
  const options = { directory, stdout: value => output.push(value), stderr: value => errors.push(value) };

  const spawnCode = await runLocalServiceCli(['start'], {
    ...options,
    startOptions: { executable: path.join(directory, 'missing-node.exe'), timeoutMs: 300 },
  });
  assert.equal(spawnCode, 1);
  assert.match(errors.at(-1), /Não foi possível iniciar o processo/);

  const timeoutCode = await runLocalServiceCli(['start'], {
    ...options,
    startOptions: { port: 0, timeoutMs: 0 },
  });
  assert.equal(timeoutCode, 1);
  assert.match(errors.at(-1), /não ficou pronto/);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await getStatus(directory), null);
});
