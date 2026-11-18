import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runRegistryCommand } from '../src/registry-cli.js';

test('passagem orienta revisão, corrige e confirma propostas sem presumir patch', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcheck-'));
  const command = async (...args) => {
    const lines = [];
    await runRegistryCommand(args, { directory, output: line => lines.push(line) });
    return JSON.parse(lines.find(line => line.startsWith('{') || line.startsWith('[')));
  };
  try {
    const person = await command('pessoa', 'adicionar', 'Ana');
    const other = await command('pessoa', 'adicionar', 'Bia');
    const mic = await command('equipamento', 'adicionar', 'Mic', 'microfone');
    const secondMic = await command('equipamento', 'adicionar', 'Mic 2', 'microfone');
    const session = await command('sessao', 'criar', 'Ensaio');
    const anotherSession = await command('sessao', 'criar', 'Outra');
    const s = String(session.id);
    const proposal = await command('vinculo', 'propor', s, `${person.id}`, `${mic.id}`);
    await command('aux-config', 'definir', '4');
    const aux = await command('retorno', 'adicionar', s, '2');
    const monitor = await command('retorno-vinculo', 'propor', s, `${person.id}`, `${aux.id}`);
    const snapshot = await command('passagem', 'mostrar', s);
    assert.equal(snapshot.vinculos[0].channel, null);
    assert.equal(snapshot.vinculosRetorno[0].status, 'proposto');
    assert.deepEqual(snapshot.pendencias.find(item => item.tipo === 'vinculo').avisos, ['canal desconhecido']);
    assert.match(snapshot.aviso, /não comprova/);
    assert.match(snapshot.aviso, /não alterações nos cadastros relacionados/);
    await assert.rejects(command('passagem', 'confirmar', s, 'vinculo', `${proposal.id}`, snapshot.vinculos[0].revisao), /sem canal/);
    await assert.rejects(command('passagem', 'corrigir', `${anotherSession.id}`, 'vinculo', `${proposal.id}`, `${person.id}`, `${mic.id}`, '7'), /nesta sessão/);
    await assert.rejects(command('passagem', 'corrigir', s, 'vinculo', `${proposal.id}`, `${person.id}`, '9999', '7'));
    assert.equal((await command('passagem', 'mostrar', s)).vinculos[0].channel, null);
    const fixed = await command('passagem', 'corrigir', s, 'vinculo', `${proposal.id}`, `${person.id}`, `${mic.id}`, '7');
    assert.equal(fixed.status, 'proposto');
    await assert.rejects(command('passagem', 'confirmar', s, 'vinculo', `${proposal.id}`, snapshot.vinculos[0].revisao), /alterada desde a revisão/);
    const revised = await command('passagem', 'mostrar', s);
    assert.equal((await command('passagem', 'confirmar', s, 'vinculo', `${proposal.id}`, revised.vinculos[0].revisao)).status, 'confirmado');
    assert.equal((await command('passagem', 'confirmar', s, 'retorno', `${monitor.id}`, revised.vinculosRetorno[0].revisao)).status, 'confirmado');
    await assert.rejects(command('passagem', 'corrigir', s, 'vinculo', `${proposal.id}`, `${person.id}`, `${mic.id}`, '8'), /pendente/);
    const conflict = await command('vinculo', 'propor', s, `${other.id}`, `${secondMic.id}`, '7');
    const withConflict = await command('passagem', 'mostrar', s);
    await assert.rejects(command('passagem', 'confirmar', s, 'vinculo', `${conflict.id}`, withConflict.vinculos.find(item => item.id === conflict.id).revisao), /Canal já confirmado/);
    const persisted = await command('passagem', 'mostrar', s);
    assert.equal(persisted.vinculos[0].channel, 7);
    assert.equal(persisted.vinculos[1].status, 'proposto');
    assert.equal(persisted.vinculosRetorno[0].status, 'confirmado');
    assert.deepEqual(persisted.pendencias.find(item => item.id === conflict.id && item.tipo === 'vinculo').avisos, ['canal já confirmado em outro vínculo']);
    await assert.rejects(command('passagem', 'mostrar', '9999'), /Sessão não encontrada/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('passagem revisa ligações e propostas de voz respeitando estado e sessão', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcheck-'));
  const command = async (...args) => {
    const lines = [];
    await runRegistryCommand(args, { directory, output: line => lines.push(line) });
    return JSON.parse(lines.find(line => line.startsWith('{') || line.startsWith('[')));
  };
  try {
    const person = await command('pessoa', 'adicionar', 'Ana');
    const mic = await command('equipamento', 'adicionar', 'Mic amarelo', 'microfone', 'amarelo');
    const session = await command('sessao', 'criar', 'Ensaio');
    const s = `${session.id}`;
    const start = await command('fisico-ponto', 'adicionar', 'equipment', 'Microfone', '--equipamento', `${mic.id}`, '--direcao', 'output');
    const end = await command('fisico-ponto', 'adicionar', 'other', 'Destino', '--direcao', 'input');
    const link = await command('fisico-ligacao', 'propor', s, `${start.id}`, `${end.id}`, 'physical');
    await assert.rejects(command('passagem', 'confirmar', s, 'ligacao', `${link.id}`), /ORIGEM/);
    let snapshot = await command('passagem', 'mostrar', s);
    assert.equal((await command('passagem', 'confirmar', s, 'ligacao', `${link.id}`, snapshot.ligacoes[0].revisao, 'tecnico')).status, 'confirmado');
    const proposalResult = await command('voz-vinculo', 'propor', s, 'microfone', 'microfone amarelo está com a Ana');
    const voice = proposalResult.proposal;
    assert.equal((await command('passagem', 'corrigir', s, 'voz', `${voice.id}`, `${person.id}`, `${mic.id}`, '7')).channel, 7);
    snapshot = await command('passagem', 'mostrar', s);
    await assert.rejects(command('passagem', 'confirmar', s, 'voz', `${voice.id}`, snapshot.propostasVoz[0].revisao), /Caminho ou patch/);
    assert.equal((await command('passagem', 'rejeitar', s, 'voz', `${voice.id}`)).status, 'rejeitado');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
