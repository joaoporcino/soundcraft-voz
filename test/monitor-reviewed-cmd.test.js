import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { runRegistryCommand } from '../src/registry-cli.js';
import { runRegistryScreens } from '../src/terminal-registry-screens.js';

async function createContext(directory) {
  const call = async (...args) => {
    const lines = [];
    await runRegistryCommand(args, { directory, output: value => lines.push(value) });
    return JSON.parse(lines.at(-1));
  };
  await call('aux-config', 'definir', '8');
  const session = await call('sessao', 'criar', 'Ensaio');
  const ana = await call('pessoa', 'adicionar', 'Ana');
  const bia = await call('pessoa', 'adicionar', 'Bia');
  await call('retorno', 'adicionar', String(session.id), '1');
  return { call, session, ana, bia };
}

async function runScreens(directory, answers, registry) {
  const output = [];
  const queue = [...answers];
  await runRegistryScreens({ registry, ask: async () => queue.shift() ?? null, write: value => output.push(value),
    screen: (_section, _title, lines) => output.push(lines.join('\n')) });
  return output.join('\n');
}

test('CMD recusa criação se AUX mudou após a revisão e recarrega lista', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-return-cmd-race-'));
  const raw = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
  let transactionDb;
  try {
    const { call } = await createContext(directory);
    assert.equal((await call('retorno', 'listar', '1')).length, 1);
    transactionDb = new DatabaseSync(path.join(directory, 'cadastros.sqlite'));
    let injected = false;
    const registry = async (args, options) => {
      if (args[0] === 'retorno' && args[1] === 'adicionar-revisado' && !injected) {
        injected = true;
        transactionDb.prepare('UPDATE monitor_config SET aux_count=7 WHERE id=1').run();
      }
      return runRegistryCommand(args, { directory, ...options });
    };
    const output = await runScreens(directory, ['3', '1', '1', '4', 'n', '2', 'SIM', '', '0', '0', '0', '0'], registry);
    assert.equal(injected, true);
    assert.match(output, /Cadastro alterado desde a revisão/);
    assert.match(output, /1\s+1/);
    assert.equal((await call('retorno', 'listar', '1')).length, 1);
    assert.equal((await call('aux-config', 'mostrar')).auxCount, 7);
  } finally { transactionDb?.close(); raw.close(); await rm(directory, { recursive: true, force: true }); }
});

test('CMD recusa proposta se contagem do AUX muda após a revisão, conserva vínculo concorrente e atualiza lista', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-return-link-cmd-race-'));
  try {
    const { call, bia } = await createContext(directory);
    assert.equal((await call('retorno', 'listar', '1')).length, 1);
    let injected = false;
    const registry = async (args, options) => {
      if (args[0] === 'retorno-vinculo' && args[1] === 'propor-revisado' && !injected) {
        injected = true;
        const aux = (await call('retorno', 'listar', '1'))[0];
        const proposal = await call('retorno-vinculo', 'propor', '1', String(bia.id), String(aux.id));
        await call('retorno-vinculo', 'confirmar', String(proposal.id));
      }
      return runRegistryCommand(args, { directory, ...options });
    };
    const output = await runScreens(directory, ['3', '1', '1', '5', 'v', '1', '1', 'SIM', '', '1', '0', '0', '0', '0', '0'], registry);
    assert.equal(injected, true);
    assert.match(output, /Cadastro alterado desde a revisão/);
    assert.match(output, /Estado: confirmado/);
    const linked = await call('retorno-vinculo', 'listar', '1');
    assert.equal(linked.length, 1);
    assert.equal(linked[0].personId, bia.id);
    assert.equal(linked[0].status, 'confirmado');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CMD cancela criação e proposta sem persistir', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-return-cmd-cancel-'));
  try {
    const { call } = await createContext(directory);
    const registry = (args, options) => runRegistryCommand(args, { directory, ...options });
    const createOutput = await runScreens(directory, ['3', '1', '1', '4', 'n', '2', 'NÃO', '0', '0', '0', '0'], registry);
    assert.match(createOutput, /Cadastro cancelado/);
    const proposalOutput = await runScreens(directory, ['3', '1', '1', '5', 'v', '1', '1', 'NÃO', '0', '0', '0', '0'], registry);
    assert.match(proposalOutput, /Proposta cancelada/);
    assert.equal((await call('retorno', 'listar', '1')).length, 1);
    assert.equal((await call('retorno-vinculo', 'listar', '1')).length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
