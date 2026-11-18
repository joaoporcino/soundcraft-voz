import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createUi24rServer } from '../src/simulator/websocket-server.js';

const root = process.cwd();
const waitFor = async (predicate, description, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Tempo esgotado aguardando ${description}.`);
};

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('terminal live não bloqueia desconectado, descarta pedido offline e reconecta usando --ip', { timeout: 15000 }, async t => {
  const port = await unusedPort();
  const targetIP = `127.0.0.1:${port}`;
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soundcraft-cli-'));
  await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify({ ip: '127.0.0.1:1' }));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));

  const child = spawn(process.execPath, ['src/index.js', '--live', '--texto', '--ip', targetIP], {
    cwd: root,
    env: { ...process.env, SOUNDCRAFT_CONFIG_DIR: configDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { errors += chunk; });
  let exited = false;
  child.once('exit', () => { exited = true; });
  const stopChild = async () => {
    if (exited) return;
    child.kill();
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
  };
  t.after(stopChild);

  const outputHas = text => output.includes(text) || errors.includes(text);
  try {
    await waitFor(() => output.includes(`MODO REAL: comandos reconhecidos serão enviados para ${targetIP}.`)
      && output.includes('Digite o comando'), 'inicialização do prompt sem servidor');
    child.stdin.write('muta canal 2\n');
    await waitFor(() => outputHas('Mesa desconectada; comando não enviado.'), 'rejeição imediata offline');

    const mixer = await createUi24rServer({ port });
    t.after(() => mixer.close());
    await waitFor(() => output.includes('[Mesa] conectada'), 'reconexão ao servidor local');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(mixer.commands.some(command => command.includes('SETD^i.1.mute')), false,
      'o comando recusado enquanto offline não pode ser reenviado');

    child.stdin.write('muta canal 2\n');
    await waitFor(() => mixer.mixerState.getChannel(2).mute, 'aplicação do comando válido');
    await waitFor(() => mixer.commands.some(command => command.includes('SETD^i.1.mute')),
      'envio do comando após conexão');
    assert.match(output, /Comando enviado; confira o resultado na interface da mesa\./);

    child.stdin.write('sair\n');
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CLI não encerrou após "sair".')), 2000);
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(exitCode, 0, errors);
  } finally {
    await stopChild();
  }
});
