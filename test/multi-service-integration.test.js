import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalService } from '../src/local-service.js';
import { saveModeConfig } from '../src/mode-config.js';
import { saveVoiceInputs } from '../src/voice-input-config.js';
import { openRegistry } from '../src/registry.js';

test('serviço isola capturas e exige consentimento por entrada ao consultar provedor', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multi-service-'));
  let calls = 0, voiceCount = 0;
  const pending = [];
  await saveModeConfig({ passageInputs: ['principal', 'outro'], masterInputId: 'principal' }, { directory: dir });
  await saveVoiceInputs([{ inputId: 'outro', device: 'simulado', channel: 2 }], { directory: dir });
  const service = await createLocalService({ port: 0, runtimeDirectory: dir,
    readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: () => ({ mute() {} }) } } }),
    createVoice: () => { const index = voiceCount++; return { start: async () => {}, stop: async () => {}, getStatus: () => ({ state: 'ready', error: null }),
      transcribe: () => new Promise(resolve => { pending[index] = resolve; }) }; },
    llm: { status: () => ({ selected: 'gemini', available: true }), configure: () => ({}),
      interpret: async () => { calls++; return { intent: 'command', target: 'canal 3', action: 'mute', value: null, relative: false, clarification: null }; } },
  });
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'local-service.json'), 'utf8'));
    const post = async (endpoint, body) => {
      const response = await globalThis.fetch(`http://127.0.0.1:${manifest.port}${endpoint}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-soundcraft-token': manifest.token }, body: JSON.stringify(body) });
      return response.json();
    };
    await post('/commands/mode', { mode: 'passage' });
    await post('/voice/start', { inputId: 'principal' });
    await post('/voice/start', { inputId: 'outro' });
    const statusResponse = await globalThis.fetch(`http://127.0.0.1:${manifest.port}/status`, { headers: { 'x-soundcraft-token': manifest.token } });
    const status = await statusResponse.json();
    assert.deepEqual(status.voice, { state: 'ready', error: null });
    assert.deepEqual(status.voiceInputs, [
      { inputId: 'principal', state: 'ready', error: null },
      { inputId: 'outro', state: 'ready', error: null },
    ]);
    const a = post('/voice/capture', { inputId: 'principal' });
    const b = post('/voice/capture', { inputId: 'outro', consentToProvider: true });
    while (!pending[0] || !pending[1]) await new Promise(resolve => globalThis.setTimeout(resolve, 1));
    pending[0]('mesa, pedido livre'); pending[1]('mesa, pedido livre');
    const [first, second] = await Promise.all([a, b]);
    assert.equal(first.status, 'consent-required');
    assert.equal(second.status, 'proposal');
    assert.equal(second.inputId, 'outro');
    assert.equal(calls, 1);
  } finally { await service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('sessão ativa exige vínculo e recusa confirmação após remoção ou troca de sessão', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'session-service-'));
  const registry = openRegistry(path.join(dir, 'cadastros.sqlite'));
  const person = registry.addPerson('Pessoa');
  const equipment = registry.addEquipment({ name: 'Fonte', kind: 'voz' });
  const session = registry.createSession('Sessão');
  const assignment = registry.proposeAssignment({ sessionId: session.id, personId: person.id, equipmentId: equipment.id, channel: 1 });
  registry.confirmAssignment(assignment.id);
  const binding = { sessionId: session.id, inputId: 'principal', assignmentId: assignment.id };
  registry.bindInputSource(binding);
  let sent = 0;
  const service = await createLocalService({ port: 0, runtimeDirectory: dir, readConfig: async () => ({ ip: '192.0.2.1' }),
    createConnection: () => ({ status: 'conectada', start() {}, stop: async () => {}, isConnected: () => true,
      mixer: { master: { input: () => ({ mute: () => { sent++; } }) } } }) });
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'local-service.json'), 'utf8'));
    const post = async (endpoint, body) => {
      const response = await globalThis.fetch(`http://127.0.0.1:${manifest.port}${endpoint}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-soundcraft-token': manifest.token }, body: JSON.stringify(body) });
      return response.json();
    };
    assert.equal((await post('/commands/session', { sessionId: session.id })).ok, true);
    await post('/commands/mode', { mode: 'passage' });
    const proposal = await post('/commands/text', { text: 'mesa, mute canal 3' });
    assert.equal(proposal.sourceContext.assignmentId, assignment.id);
    registry.unbindInputSource(binding);
    registry.bindInputSource(binding);
    assert.equal((await post('/commands/confirm', { id: proposal.id })).status, 'denied');
    const next = await post('/commands/text', { text: 'mesa, mute canal 3' });
    await post('/commands/session', { sessionId: null });
    assert.equal((await post('/commands/confirm', { id: next.id })).status, 'not-found');
    assert.equal(sent, 0);
  } finally { await service.close(); registry.close(); await rm(dir, { recursive: true, force: true }); }
});
