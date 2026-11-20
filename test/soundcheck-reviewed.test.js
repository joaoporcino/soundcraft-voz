import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runRegistryCommand } from '../src/registry-cli.js';

async function withRegistry(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcheck-reviewed-'));
  const command = async (...args) => {
    const output = [];
    await runRegistryCommand(args, { directory, output: line => output.push(line) });
    const json = output.find(line => line.startsWith('{') || line.startsWith('['));
    return json === undefined ? undefined : JSON.parse(json);
  };
  try { await run(command); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function setup(command) {
  const person = await command('pessoa', 'adicionar', 'Ana');
  const other = await command('pessoa', 'adicionar', 'Bia');
  const mic = await command('equipamento', 'adicionar', 'Microfone', 'microfone');
  const session = await command('sessao', 'criar', 'Ensaio');
  const secondSession = await command('sessao', 'criar', 'Outro ensaio');
  return { person, other, mic, session, secondSession };
}

async function show(command, sessionId) {
  return command('passagem', 'mostrar', String(sessionId));
}

test('correção revisada altera proposta de fonte e voz, e mantém comandos legados', async () => {
  await withRegistry(async command => {
    const { person, other, mic, session } = await setup(command);
    const s = String(session.id);
    const source = await command('vinculo', 'propor', s, String(person.id), String(mic.id), '3');
    const voice = (await command('voz-vinculo', 'propor', s, 'microfone', 'microfone está com a Ana')).proposal;
    let view = await show(command, s);
    const sourceRevision = view.vinculos.find(item => item.id === source.id).revisao;
    const voiceRevision = view.propostasVoz.find(item => item.id === voice.id).revisao;

    const fixedSource = await command('passagem', 'corrigir-revisado', s, 'vinculo', String(source.id), sourceRevision,
      String(other.id), String(mic.id), '4');
    assert.equal(fixedSource.status, 'proposto');
    assert.equal(fixedSource.personId, other.id);
    assert.equal(fixedSource.channel, 4);
    const fixedVoice = await command('passagem', 'corrigir-revisado', s, 'voz', String(voice.id), voiceRevision,
      String(person.id), String(mic.id), '5');
    assert.equal(fixedVoice.status, 'proposto');
    assert.equal(fixedVoice.channel, 5);

    // Legacy variants remain accepted without a review token.
    await command('passagem', 'corrigir', s, 'vinculo', String(source.id), String(person.id), String(mic.id), '6');
    await command('passagem', 'corrigir', s, 'voz', String(voice.id), String(other.id), String(mic.id), '7');
    view = await show(command, s);
    assert.equal(view.vinculos.find(item => item.id === source.id).channel, 6);
    assert.equal(view.propostasVoz.find(item => item.id === voice.id).channel, 7);
  });
});

test('rejeição e revogação revisadas cobrem retorno, ligação e voz; legadas seguem disponíveis', async () => {
  await withRegistry(async command => {
    const { person, other, session } = await setup(command);
    const thirdPerson = await command('pessoa', 'adicionar', 'Caio');
    const s = String(session.id);
    await command('aux-config', 'definir', '8');
    await command('retorno', 'adicionar', s, '2');
    const monitorPending = await command('retorno-vinculo', 'propor', s, String(person.id), '1');
    const monitorConfirmed = await command('retorno-vinculo', 'propor', s, String(other.id), '1');
    const monitorRevoked = await command('retorno-vinculo', 'propor', s, String(thirdPerson.id), '1');
    const linkPending = await command('fisico-ponto', 'adicionar', 'other', 'Saída', '--direcao', 'output');
    const linkTarget = await command('fisico-ponto', 'adicionar', 'other', 'Entrada', '--direcao', 'input');
    const secondLinkTarget = await command('fisico-ponto', 'adicionar', 'other', 'Outra entrada', '--direcao', 'input');
    const rejectedLink = await command('fisico-ligacao', 'propor', s, String(linkPending.id), String(linkTarget.id), 'physical');
    const confirmedLink = await command('fisico-ligacao', 'propor', s, String(linkPending.id), String(linkTarget.id), 'physical');
    const revokedLink = await command('fisico-ligacao', 'propor', s, String(linkPending.id), String(secondLinkTarget.id), 'physical');
    const voiceRejected = (await command('voz-vinculo', 'propor', s, 'microfone', 'primeira proposta de voz')).proposal;
    const voiceLegacy = (await command('voz-vinculo', 'propor', s, 'microfone', 'segunda proposta de voz')).proposal;
    await command('retorno-vinculo', 'confirmar', String(monitorConfirmed.id));
    await command('retorno-vinculo', 'confirmar', String(monitorRevoked.id));
    await command('fisico-ligacao', 'confirmar', String(confirmedLink.id), 'técnico');
    await command('fisico-ligacao', 'confirmar', String(revokedLink.id), 'técnico');

    let view = await show(command, s);
    const revisions = {
      monitorPending: view.vinculosRetorno.find(item => item.id === monitorPending.id).revisao,
      monitorRevoked: view.vinculosRetorno.find(item => item.id === monitorRevoked.id).revisao,
      rejectedLink: view.ligacoes.find(item => item.id === rejectedLink.id).revisao,
      revokedLink: view.ligacoes.find(item => item.id === revokedLink.id).revisao,
      voice: view.propostasVoz.find(item => item.id === voiceRejected.id).revisao,
    };
    assert.equal((await command('passagem', 'rejeitar-revisado', s, 'retorno', String(monitorPending.id), revisions.monitorPending)).status, 'rejeitado');
    assert.equal((await command('passagem', 'rejeitar-revisado', s, 'ligacao', String(rejectedLink.id), revisions.rejectedLink)).status, 'rejeitado');
    assert.equal((await command('passagem', 'rejeitar-revisado', s, 'voz', String(voiceRejected.id), revisions.voice)).status, 'rejeitado');
    assert.equal((await command('passagem', 'revogar-revisado', s, 'retorno', String(monitorRevoked.id), revisions.monitorRevoked)).status, 'revogado');
    assert.equal((await command('passagem', 'revogar-revisado', s, 'ligacao', String(revokedLink.id), revisions.revokedLink)).status, 'revogado');

    // The original commands still work without revisions.
    const monitorLegacyReject = await command('retorno-vinculo', 'propor', s, String(person.id), '1');
    await command('retorno-vinculo', 'rejeitar', String(monitorLegacyReject.id));
    await command('fisico-ligacao', 'revogar', String(confirmedLink.id));
    await command('passagem', 'rejeitar', s, 'voz', String(voiceLegacy.id));
    view = await show(command, s);
    assert.equal(view.vinculosRetorno.find(item => item.id === monitorPending.id).status, 'rejeitado');
    assert.equal(view.ligacoes.find(item => item.id === rejectedLink.id).status, 'rejeitado');
    assert.equal(view.propostasVoz.find(item => item.id === voiceRejected.id).status, 'rejeitado');
  });
});

test('revisão antiga após alteração por outra conexão, sessão errada e falha não deixam alteração parcial', async () => {
  await withRegistry(async command => {
    const { person, other, mic, session, secondSession } = await setup(command);
    const s = String(session.id), wrong = String(secondSession.id);
    const source = await command('vinculo', 'propor', s, String(person.id), String(mic.id), '3');
    const voice = (await command('voz-vinculo', 'propor', s, 'microfone', 'voz para revisão concorrente')).proposal;
    let view = await show(command, s);
    const oldSourceRevision = view.vinculos.find(item => item.id === source.id).revisao;
    const oldVoiceRevision = view.propostasVoz.find(item => item.id === voice.id).revisao;

    // Each command opens and closes its own SQLite connection, so these edits
    // are committed by a separate connection between review and write.
    await command('passagem', 'corrigir', s, 'vinculo', String(source.id), String(other.id), String(mic.id), '4');
    await command('passagem', 'corrigir', s, 'voz', String(voice.id), String(person.id), String(mic.id), '5');
    await assert.rejects(command('passagem', 'corrigir-revisado', s, 'vinculo', String(source.id), oldSourceRevision,
      String(person.id), String(mic.id), '6'), /alterada desde a revisão/);
    await assert.rejects(command('passagem', 'corrigir-revisado', s, 'voz', String(voice.id), oldVoiceRevision,
      String(other.id), String(mic.id), '6'), /alterada desde a revisão/);

    view = await show(command, s);
    const current = view.vinculos.find(item => item.id === source.id);
    await assert.rejects(command('passagem', 'corrigir-revisado', wrong, 'vinculo', String(source.id), current.revisao,
      String(person.id), String(mic.id), '7'), /nesta sessão/);
    await assert.rejects(command('passagem', 'corrigir-revisado', s, 'vinculo', String(source.id), current.revisao,
      String(person.id), '99999', '7'));
    const after = await show(command, s);
    assert.equal(after.vinculos.find(item => item.id === source.id).personId, other.id);
    assert.equal(after.vinculos.find(item => item.id === source.id).channel, 4);
    assert.equal(after.historicoCadastros.length, 0);
    assert.equal(after.propostasVoz.find(item => item.id === voice.id).personId, person.id);
    assert.equal(after.propostasVoz.find(item => item.id === voice.id).channel, 5);
  });
});
