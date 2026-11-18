import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLocalService } from '../src/local-service.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { openRegistry } from '../src/registry.js';
import { request } from 'node:http';

test('painel local autentica, limita origem e revisa propostas sem aceitar revisão antiga', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-panel-'));
  const registry = openRegistry(path.join(directory, 'cadastros.sqlite'));
  const session = registry.createSession('Ensaio'), person = registry.addPerson('Ana');
  const equipment = registry.addEquipment({ name: 'Microfone', kind: 'microfone' });
  const equipment2 = registry.addEquipment({ name: 'Outro', kind: 'microfone' });
  const assignment = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment2.id, channel: 5 });
  const proposal = registry.createVoiceProposal({ sessionId: session.id, origin: 'principal', phrase: '<script>pedido</script>', authorized: true });
  const service = await createLocalService({ port: 0, runtimeDirectory: directory, readConfig: async () => ({ ip: null }) });
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'local-service.json'), 'utf8'));
    const base = `http://127.0.0.1:${manifest.port}`;
    const headers = { 'x-soundcraft-token': manifest.token };
    const html = await globalThis.fetch(`${base}/painel/`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await globalThis.fetch(`${base}/painel/api/sessoes`)).status, 401);
    const wrongHost = await new Promise((resolve, reject) => {
      const req = request(`${base}/painel/api/sessoes`, { headers: { host: `localhost:${manifest.port}`, ...headers } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(wrongHost, 403);
    const sessions = await (await globalThis.fetch(`${base}/painel/api/sessoes`, { headers })).json();
    assert.equal(sessions[0].name, 'Ensaio');
    const read = async () => (await globalThis.fetch(`${base}/painel/api/passagem?sessao=${session.id}`, { headers })).json();
    const initial = (await read()).propostasVoz[0];
    assert.equal(initial.phrase, '<script>pedido</script>');
    const post = (body, origin = base) => globalThis.fetch(`${base}/painel/api/revisar`, { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
    const correction = { sessao: session.id, tipo: 'voz', acao: 'corrigir', id: proposal.id, revisao: initial.revisao,
      pessoa: person.id, equipamento: equipment.id, canal: 7 };
    assert.equal((await post(correction, 'http://example.com')).status, 403);
    assert.equal((await post(correction)).status, 200);
    assert.equal((await post({ ...correction, acao: 'rejeitar' })).status, 409);
    const updated = (await read()).propostasVoz[0];
    assert.equal(updated.personId, person.id);
    assert.equal((await post({ sessao: session.id, tipo: 'voz', acao: 'confirmar', id: proposal.id, revisao: updated.revisao })).status, 409);
    assert.equal((await post({ sessao: session.id, tipo: 'voz', acao: 'rejeitar', id: proposal.id, revisao: updated.revisao })).status, 200);
    assert.equal(registry.listVoiceProposals(session.id)[0].status, 'rejeitado');
    const pendingAssignment = (await read()).vinculos.find(item => item.id === assignment.id);
    registry.editAssignment(assignment.id, { personId: person.id, equipmentId: equipment2.id, channel: 6 });
    assert.equal((await post({ sessao: session.id, tipo: 'vinculo', acao: 'corrigir', id: assignment.id,
      revisao: pendingAssignment.revisao, pessoa: person.id, equipamento: equipment2.id, canal: 5 })).status, 409);
    const revised = (await read()).vinculos.find(item => item.id === assignment.id);
    assert.equal((await post({ sessao: session.id, tipo: 'vinculo', acao: 'corrigir', id: assignment.id,
      revisao: revised.revisao, pessoa: person.id, equipamento: equipment2.id, canal: 5 })).status, 200);
    const ready = (await read()).vinculos.find(item => item.id === assignment.id);
    const confirmed = await post({ sessao: session.id, tipo: 'vinculo', acao: 'confirmar', id: assignment.id, revisao: ready.revisao });
    assert.equal(confirmed.status, 200);
    assert.equal(registry.listAssignments(session.id)[0].status, 'confirmado');
    const lines = [];
    assert.equal(await runLocalServiceCli(['painel'], { directory, stdout: value => lines.push(value) }), 0);
    assert.match(lines[0], new RegExp(`/painel/#token=${manifest.token}$`));
  } finally { await service.close(); registry.close(); await rm(directory, { recursive: true, force: true }); }
});
