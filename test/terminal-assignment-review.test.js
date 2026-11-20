import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runRegistryCommand } from '../src/registry-cli.js';
import { reviewAssignment } from '../src/terminal-assignment-review.js';
import { correctSource, replaceSource } from '../src/terminal-source-correction.js';
import { unbindInput } from '../src/terminal-input-source.js';
import { openRegistry } from '../src/registry.js';
import { correctVoice } from '../src/terminal-voice-correction.js';
import { correctGlobalRecord } from '../src/terminal-global-correction.js';

async function call(registry, type, id, action, answer = 'SIM') {
  const messages = [], answers = type === 'ligacao' && action === 'confirmar' ? ['operador', answer, ''] : [answer, ''];
  await reviewAssignment({ session: { id: 1, name: 'Ensaio' }, record: { id }, type, action, registry,
    screen: (section, title, lines) => messages.push(...lines), ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
  return messages.join('\n');
}

test('revisa fonte e retorno, preserva cancelamento e histórico de revogação e rejeição', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-review-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'],
      ['vinculo', 'propor', '1', '1', '1', '3'], ['aux-config', 'definir', '8'], ['retorno', 'adicionar', '1', '2'],
      ['retorno-vinculo', 'propor', '1', '1', '1'], ['retorno-vinculo', 'propor', '1', '1', '1']]) await registry(args, silent);
    const cancelled = await call(registry, 'vinculo', 1, 'confirmar', 'NÃO');
    assert.match(cancelled, /Ação cancelada/);
    assert.match(cancelled, /Pessoa: Pessoa \(ID 1\)/);
    assert.match(cancelled, /Equipamento: Mic \(ID 1\)/);
    assert.match(await call(registry, 'vinculo', 1, 'confirmar'), /Vínculo confirmado/);
    assert.match(await call(registry, 'retorno', 1, 'confirmar'), /Vínculo confirmado/);
    assert.match(await call(registry, 'retorno', 2, 'confirmar'), /Não foi possível executar a ação/);
    assert.match(await call(registry, 'retorno', 1, 'revogar'), /Vínculo revogado/);
    assert.match(await call(registry, 'retorno', 2, 'rejeitar'), /Vínculo rejeitado/);
    const output = [];
    await registry(['retorno-vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0]).map(item => item.status), ['revogado', 'rejeitado']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('revisão de ligação recusa destino desconhecido e preserva revogação e rejeição', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-link-review-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['fisico-ponto', 'adicionar', 'other', 'Saída', '--direcao', 'output'],
      ['fisico-ponto', 'adicionar', 'other', 'Entrada', '--direcao', 'input'], ['fisico-ligacao', 'propor', '1', '1', 'desconhecido', 'physical'],
      ['fisico-ligacao', 'propor', '1', '1', '2', 'physical'], ['fisico-ligacao', 'propor', '1', '1', '2', 'physical']]) await registry(args, silent);
    assert.match(await call(registry, 'ligacao', 1, 'confirmar'), /Não foi possível executar a ação/);
    assert.match(await call(registry, 'ligacao', 1, 'rejeitar'), /Vínculo rejeitado/);
    const confirmed = await call(registry, 'ligacao', 2, 'confirmar');
    assert.match(confirmed, /Vínculo confirmado/);
    assert.match(confirmed, /Origem: Saída \(ID 1; output\)/);
    assert.match(await call(registry, 'ligacao', 3, 'confirmar'), /Não foi possível executar a ação/);
    assert.match(await call(registry, 'ligacao', 2, 'revogar'), /Vínculo revogado/);
    const output = [];
    await registry(['fisico-ligacao', 'listar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0]).map(item => item.status), ['rejeitado', 'revogado', 'proposto']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('confirmação recusa revisão alterada após apresentação', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-review-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3']]) await base(args, { output: () => {} });
    const registry = async (args, options) => {
      if (args[0] === 'passagem' && args[1] === 'confirmar') await base(['passagem', 'corrigir', '1', 'vinculo', '1', '1', '1', '4'], { output: () => {} });
      return base(args, options);
    };
    assert.match(await call(registry, 'vinculo', 1, 'confirmar'), /Não foi possível executar a ação/);
    const output = [];
    await base(['vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.equal(JSON.parse(output[0])[0].status, 'proposto');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção recusa mudança observada durante seleção', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-source-edit-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3']]) await base(args, { output: () => {} });
    let reads = 0;
    const registry = async (args, options) => {
      if (args[0] === 'passagem' && args[1] === 'mostrar' && ++reads === 2) await base(['passagem', 'corrigir', '1', 'vinculo', '1', '1', '1', '5'], { output: () => {} });
      return base(args, options);
    };
    const answers = ['1', '1', '4', 'SIM'], messages = [];
    await correctSource({ session: { id: 1, name: 'Ensaio' }, record: { id: 1 }, registry,
      screen: () => {}, ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
    assert.match(messages.join('\n'), /alterados/);
    const output = [];
    await base(['vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.equal(JSON.parse(output[0])[0].channel, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção revisada recusa alteração após última consulta', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-edit-atomic-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3']]) await base(args, { output: () => {} });
    const registry = async (args, options) => {
      if (args[0] === 'passagem' && args[1] === 'corrigir-referencias-revisadas') await base(['passagem', 'corrigir', '1', 'vinculo', '1', '1', '1', '5'], { output: () => {} });
      return base(args, options);
    };
    const answers = ['1', '1', '4', 'SIM', ''], messages = [];
    await correctSource({ session: { id: 1, name: 'Ensaio' }, record: { id: 1 }, registry,
      screen: () => {}, ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
    assert.match(messages.join('\n'), /Não foi possível corrigir/);
    const output = [];
    await base(['vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.equal(JSON.parse(output[0])[0].channel, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rejeição e revogação revisadas recusam token antigo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-reject-revoke-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['aux-config', 'definir', '8'],
      ['retorno', 'adicionar', '1', '2'], ['retorno-vinculo', 'propor', '1', '1', '1'], ['retorno-vinculo', 'propor', '1', '1', '1'],
      ['retorno-vinculo', 'confirmar', '1']]) await registry(args, silent);
    for (const [action, id] of [['revogar-revisado', '1'], ['rejeitar-revisado', '2']]) {
      await assert.rejects(registry(['passagem', action, '1', 'retorno', id, '0'.repeat(64)], silent), /alterada desde a revisão/);
    }
    const result = [];
    await registry(['retorno-vinculo', 'listar', '1'], { output: value => result.push(value) });
    assert.deepEqual(JSON.parse(result[0]).map(item => item.status), ['confirmado', 'proposto']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('menu recusa rejeição de voz alterada depois da confirmação do operador', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-reject-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    await base(['sessao', 'criar', 'Ensaio'], silent);
    await base(['voz-vinculo', 'propor', '1', 'entrada', 'microfone para alguém'], silent);
    const registry = async (args, options) => {
      if (args[1] === 'rejeitar-revisado') {
        await base(['voz-vinculo', 'corrigir', '1', 'desconhecido', 'desconhecido', '5'], silent);
      }
      return base(args, options);
    };
    assert.match(await call(registry, 'voz', 1, 'rejeitar'), /alterada desde a revisão/);
    const result = [];
    await base(['voz-vinculo', 'listar', '1'], { output: value => result.push(value) });
    const [voice] = JSON.parse(result[0]);
    assert.equal(voice.status, 'proposto');
    assert.equal(voice.channel, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('variantes revisadas preservam voz e ligação quando revisão é antiga', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-link-revision-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['voz-vinculo', 'propor', '1', 'entrada', 'microfone amarelo para alguém'],
      ['fisico-ponto', 'adicionar', 'other', 'Saída', '--direcao', 'output'], ['fisico-ponto', 'adicionar', 'other', 'Entrada', '--direcao', 'input'],
      ['fisico-ligacao', 'propor', '1', '1', '2', 'physical'], ['fisico-ligacao', 'confirmar', '1', 'operador']]) await registry(args, silent);
    await assert.rejects(registry(['passagem', 'corrigir-revisado', '1', 'voz', '1', '0'.repeat(64), 'desconhecido', 'desconhecido', '3'], silent), /alterada desde a revisão/);
    await assert.rejects(registry(['passagem', 'rejeitar-revisado', '1', 'voz', '1', '0'.repeat(64)], silent), /alterada desde a revisão/);
    await assert.rejects(registry(['passagem', 'revogar-revisado', '1', 'ligacao', '1', '0'.repeat(64)], silent), /alterada desde a revisão/);
    const voice = [], links = [];
    await registry(['voz-vinculo', 'listar', '1'], { output: value => voice.push(value) });
    await registry(['fisico-ligacao', 'listar', '1'], { output: value => links.push(value) });
    assert.equal(JSON.parse(voice[0])[0].status, 'proposto');
    assert.equal(JSON.parse(links[0])[0].status, 'confirmado');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('substituição recusa entrada associada depois da revisão sem retirar a fonte', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-source-replace-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'],
      ['vinculo', 'propor', '1', '1', '1', '3'], ['vinculo', 'confirmar', '1']]) await base(args, { output: () => {} });
    const registry = async (args, options) => {
      if (args[0] === 'passagem' && args[1] === 'substituir-referencias-revisadas') await base(['entrada-fonte', 'vincular', '1', 'nova', '1'], { output: () => {} });
      return base(args, options);
    };
    const answers = ['1', '1', '4', 'SIM', ''], messages = [];
    await replaceSource({ session: { id: 1, name: 'Ensaio' }, record: { id: 1 }, registry,
      screen: () => {}, ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
    assert.match(messages.join('\n'), /Não foi possível substituir/);
    const links = [], inputs = [];
    await base(['vinculo', 'listar', '1'], { output: value => links.push(value) });
    await base(['entrada-fonte', 'listar', '1'], { output: value => inputs.push(value) });
    assert.equal(JSON.parse(links[0]).length, 1);
    assert.equal(JSON.parse(links[0])[0].status, 'confirmado');
    assert.equal(JSON.parse(inputs[0])[0].inputId, 'nova');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('remoção revisada não remove associação substituída por outro processo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-input-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'],
      ['vinculo', 'propor', '1', '1', '1', '3'], ['vinculo', 'confirmar', '1'], ['entrada-fonte', 'vincular', '1', 'principal', '1']]) await base(args, { output: () => {} });
    const initial = [];
    await base(['entrada-fonte', 'listar', '1'], { output: value => initial.push(value) });
    const record = JSON.parse(initial[0])[0];
    const registry = async (args, options) => {
      if (args[1] === 'remover-revisado') {
        await base(['entrada-fonte', 'remover', '1', 'principal'], { output: () => {} });
        await base(['entrada-fonte', 'vincular', '1', 'principal', '1'], { output: () => {} });
      }
      return base(args, options);
    };
    const answers = ['SIM', ''], messages = [];
    await unbindInput({ session: { id: 1, name: 'Ensaio' }, record, registry, screen: () => {},
      ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
    assert.match(messages.join('\n'), /alterada ou removida/);
    const output = [];
    await base(['entrada-fonte', 'listar', '1'], { output: value => output.push(value) });
    assert.notEqual(JSON.parse(output[0])[0].bindingId, record.bindingId);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('revisão de voz mostra frase, recusa incompleta e confirma somente com patch declarado', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-review-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const r = openRegistry(path.join(directory, 'cadastros.sqlite'));
    try {
      const session = r.createSession('Ensaio'), person = r.addPerson('Pessoa');
      const equipment = r.addEquipment({ name: 'Mic', kind: 'microfone' });
      const mixer = r.addPhysicalDevice({ name: 'Mesa', type: 'mesa' });
      const mic = r.addSignalPoint({ type: 'equipment', label: 'Mic', equipmentId: equipment.id, direction: 'output' });
      const port = r.addSignalPoint({ type: 'port', label: 'Porta', deviceId: mixer.id, direction: 'input' });
      const channel = r.addSignalPoint({ type: 'channel', label: 'Canal', channel: 3, direction: 'bidirectional' });
      for (const [from, to, kind] of [[mic, port, 'physical'], [port, channel, 'patch']]) {
        const link = r.proposeSignalLink({ sessionId: session.id, fromPointId: from.id, toPointId: to.id, kind });
        r.confirmSignalLink(link.id, { origin: 'operador' });
      }
      r.createVoiceProposal({ sessionId: session.id, phrase: 'frase incompleta', origin: 'entrada', authorized: true });
      r.createVoiceProposal({ sessionId: session.id, phrase: 'microfone para pessoa', origin: 'entrada', personId: person.id, equipmentId: equipment.id, channel: 3, authorized: true });
    } finally { r.close(); }
    const incomplete = await call(registry, 'voz', 1, 'confirmar');
    assert.match(incomplete, /Frase: frase incompleta/);
    assert.match(incomplete, /Não foi possível executar a ação/);
    assert.match(await call(registry, 'voz', 1, 'rejeitar'), /Vínculo rejeitado/);
    assert.match(await call(registry, 'voz', 2, 'confirmar'), /Vínculo confirmado/);
    const output = [];
    await registry(['voz-vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0]).map(item => item.status), ['rejeitado', 'confirmado']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção de voz recusa proposta alterada durante seleção', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-edit-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['voz-vinculo', 'propor', '1', 'entrada', 'microfone amarelo para alguém']]) await base(args, { output: () => {} });
    let reads = 0;
    const registry = async (args, options) => {
      if (args[0] === 'passagem' && args[1] === 'mostrar' && ++reads === 2) await base(['voz-vinculo', 'corrigir', '1', 'desconhecido', 'desconhecido', '5'], { output: () => {} });
      return base(args, options);
    };
    const answers = ['d', 'd', '3', 'SIM'], messages = [];
    await correctVoice({ session: { id: 1, name: 'Ensaio' }, record: { id: 1 }, registry,
      screen: () => {}, ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
    assert.match(messages.join('\n'), /alterada/);
    const output = [];
    await base(['voz-vinculo', 'listar', '1'], { output: value => output.push(value) });
    assert.equal(JSON.parse(output[0])[0].channel, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção global recusa revisão alterada antes da gravação', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-global-edit-race-'));
  const base = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa']]) await base(args, { output: () => {} });
    const registry = async (args, options) => {
      if (args[0] === 'passagem' && args[1] === 'corrigir') await base([...args.slice(0, -1), 'Concorrente'], { output: () => {} });
      return base(args, options);
    };
    const answers = ['1', 'Novo', 'SIM', ''], messages = [];
    await correctGlobalRecord({ category: 'pessoa', record: { id: 1 }, registry, screen: () => {},
      ask: async () => answers.shift() ?? null, write: value => messages.push(value) });
    assert.match(messages.join('\n'), /Não foi possível corrigir/);
    const output = [];
    await base(['pessoa', 'listar'], { output: value => output.push(value) });
    assert.equal(JSON.parse(output[0])[0].name, 'Concorrente');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
