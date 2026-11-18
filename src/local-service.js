import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers';
import { loadConfig } from './config.js';
import { MixerConnection } from './mixer-connection.js';
import { createServiceCommandFlow } from './service-command-flow.js';
import { createServiceVoice } from './service-voice.js';
import { VoiceWorker } from './voice-worker.js';
import { loadVoiceConfig } from './voice-config.js';
import { createMixerObservation } from './mixer-observation.js';
import { loadModeConfig, saveModeConfig } from './mode-config.js';
import { validateModeConfig } from './mode-policy.js';
import { createServiceLlm } from './service-llm.js';
import { createVoicePool } from './voice-pool.js';
import { loadVoiceInputs } from './voice-input-config.js';
import { openRegistry } from './registry.js';
import { createSimulatedResponseQueue } from './simulated-response-queue.js';
import { parseSoundcheckCommand } from './soundcheck-cli.js';
import { fileURLToPath, URL } from 'node:url';
import { parsePhysicalRegistryCommand } from './physical-registry-cli.js';
import { soundcheckRevision } from './soundcheck-review.js';

const DEFAULT_PORT = 43129;
const MANIFEST = 'local-service.json';
const PANEL_DIR = fileURLToPath(new URL('./panel/', import.meta.url));

async function publishManifest(directory, value) {
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, MANIFEST);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, target);
}

function sameSecret(expected, received) {
  if (typeof received !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers['content-type'] ?? '')) throw new Error('content-type');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new Error('body-size');
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('body');
  return value;
}

function hasOnly(value, fields) {
  return Object.keys(value).every(key => fields.includes(key));
}

/** Serviço local restrito a loopback, com autenticação pelo manifesto. */
export async function createLocalService({
  host = '127.0.0.1',
  port = DEFAULT_PORT,
  runtimeDirectory,
  readConfig = loadConfig,
  createConnection = options => new MixerConnection(options),
  createVoice = options => createServiceVoice(options),
  llm,
  saveModeConfigImpl = saveModeConfig,
} = {}) {
  if (host !== '127.0.0.1') throw new Error('O serviço aceita somente o endereço loopback 127.0.0.1.');
  if (!runtimeDirectory) throw new TypeError('runtimeDirectory é obrigatório.');
  const token = randomBytes(32).toString('hex');
  let connection;
  let closePromise;
  let state = 'iniciando';
  let listener;
  let appliedIp = null;
  let restartRequired = false;
  let activeSessionId = null;
  const responses = createSimulatedResponseQueue();
  let simulatedRoutes = { paLimitDb: null, returns: {} };
  function refreshResponses() {
    const mode = commands.getStatus().mode;
    responses.updateState({ context: mode === 'passage' ? 'passagem' : mode === 'worship' ? 'culto' : undefined,
      ...simulatedRoutes });
  }
  const manifestPath = path.join(runtimeDirectory, MANIFEST);
  const observation = createMixerObservation();
  const modeConfig = await loadModeConfig({ directory: runtimeDirectory });
  let modeChange = Promise.resolve();
  let modeUpdatePending = false;
  function serializeModeChange(action) {
    const next = modeChange.then(action);
    modeChange = next.catch(() => {});
    return next;
  }
  let voiceConfig, voiceConfigError;
  try { voiceConfig = await loadVoiceConfig({ directory: runtimeDirectory }); }
  catch (error) { voiceConfigError = error; }
  const extraVoiceInputs = await loadVoiceInputs({ directory: runtimeDirectory });
  llm ??= createServiceLlm({ directory: runtimeDirectory });
  const voiceConfigs = Object.fromEntries([['principal', voiceConfig], ...extraVoiceInputs.map(({ inputId, device, channel }) => [inputId, { ...voiceConfig, device, channel }])]);
  const voice = createVoicePool({ configs: voiceConfigs, createVoice, createWorker: config => {
    if (voiceConfigError) throw voiceConfigError;
    return new VoiceWorker(config);
  } });
  const commands = createServiceCommandFlow({
    modeConfig,
    provider: llm,
    getInputContext: inputId => {
      if (activeSessionId === null) return null;
      const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
      try {
        if (!registry.listSessions().some(session => session.id === activeSessionId)) return false;
        const source = registry.listInputSources(activeSessionId).find(item => item.inputId === inputId);
        return source ? { sessionId: activeSessionId, inputId, assignmentId: source.assignmentId, bindingId: source.bindingId,
          formation: registry.listSessionFormation(activeSessionId) } : false;
      } finally { registry.close(); }
    },
    isConnected: () => connection?.isConnected() === true,
    getObservedFader: channel => observation.getFader(channel),
    invalidateFader: channel => observation.invalidateFader(channel),
    sendCommand: command => {
      if (!connection?.isConnected()) throw new Error('Mesa desconectada');
      const channel = connection.mixer.master.input(command.channel);
      if (command.action === 'mute') channel.mute();
      else if (command.action === 'unmute') channel.unmute();
      else channel.setFaderLevelDB(command.db);
    },
  });

  try {
    const config = await readConfig({ directory: runtimeDirectory });
    appliedIp = config?.ip ?? null;
    if (config?.ip) {
      connection = createConnection({ targetIP: config.ip,
        onStatus: status => {
          observation.reset(status === 'conectada' && !restartRequired);
          if (status !== 'conectada') { commands.invalidate(); responses.cancelAll('connection-changed'); }
        },
        onInbound: message => observation.receive(message),
      });
      connection.start();
      state = 'ativo';
    } else state = 'requer-configuracao';
  } catch (error) {
    state = 'erro-configuracao';
    restartRequired = true;
    console.error(`Configuração da mesa indisponível: ${error.message}`);
  }

  function requireRestart() {
    if (!restartRequired) commands.invalidate();
    observation.reset(false);
    restartRequired = true;
  }

  async function checkTarget() {
    if (restartRequired) return false;
    try {
      const config = await readConfig({ directory: runtimeDirectory });
      if ((config?.ip ?? null) !== appliedIp) requireRestart();
    } catch { requireRestart(); }
    return !restartRequired;
  }

  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'POST') {
      response.writeHead(405, { allow: 'GET, POST' }).end();
      return;
    }
    const panelAsset = { '/painel': ['index.html', 'text/html'], '/painel/': ['index.html', 'text/html'],
      '/painel/app.js': ['app.js', 'text/javascript'], '/painel/style.css': ['style.css', 'text/css'] }[request.url];
    if (request.url?.startsWith('/painel') && request.headers.host !== `127.0.0.1:${listener?.port}`) {
      response.writeHead(403).end(); return;
    }
    if (request.method === 'GET' && panelAsset) {
      void fs.readFile(path.join(PANEL_DIR, panelAsset[0])).then(data => {
        response.writeHead(200, { 'content-type': `${panelAsset[1]}; charset=utf-8`, 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        response.end(data);
      }).catch(() => response.writeHead(500).end());
      return;
    }
    if (!sameSecret(token, request.headers['x-soundcraft-token'])) {
      response.writeHead(401).end();
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/painel/api/')) {
      try {
        const url = new URL(request.url, 'http://127.0.0.1');
        const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
        try {
          let result;
          if (url.pathname === '/painel/api/sessoes' && !url.search) result = registry.listSessions();
          else if (url.pathname === '/painel/api/passagem' && [...url.searchParams.keys()].length === 1 && /^[1-9]\d*$/.test(url.searchParams.get('sessao') ?? '')) {
            result = parseSoundcheckCommand(['passagem', 'mostrar', url.searchParams.get('sessao')])(registry);
          } else { response.writeHead(404).end(); return; }
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(JSON.stringify(result));
        } finally { registry.close(); }
      } catch { response.writeHead(400).end(); }
      return;
    }
    if (request.method === 'POST' && request.url === '/painel/api/revisar') {
      if (request.headers.origin !== `http://127.0.0.1:${listener.port}`) { response.writeHead(403).end(); return; }
      void (async () => {
        try {
          const body = await readJson(request);
          if (!hasOnly(body, ['sessao', 'acao', 'tipo', 'id', 'revisao', 'pessoa', 'equipamento', 'canal', 'origem']) ||
              !Number.isSafeInteger(body.sessao) || body.sessao < 1 || !Number.isSafeInteger(body.id) || body.id < 1 ||
              !['confirmar', 'rejeitar', 'corrigir'].includes(body.acao) || !['vinculo', 'retorno', 'ligacao', 'voz'].includes(body.tipo)) throw Error('Pedido inválido');
          const args = ['passagem', body.acao, String(body.sessao), body.tipo, String(body.id)];
          if (body.acao === 'confirmar') args.push(body.revisao, ...(body.tipo === 'ligacao' ? [body.origem] : []));
          if (body.acao === 'corrigir') args.push(String(body.pessoa ?? 'desconhecido'), String(body.equipamento ?? 'desconhecido'), String(body.canal ?? 'desconhecido'));
          if (args.some(value => typeof value !== 'string')) throw Error('Dados de revisão inválidos');
          const operation = parseSoundcheckCommand(args);
          const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
          try {
            let result;
            if (body.acao !== 'confirmar') {
              if (typeof body.revisao !== 'string' || !/^[a-f0-9]{64}$/.test(body.revisao)) throw Error('Revisão obrigatória');
              const method = { voz: 'listVoiceProposals', vinculo: 'listAssignments', retorno: 'listMonitorAssignments', ligacao: 'listSignalLinks' }[body.tipo];
              const item = registry[method](body.sessao).find(value => value.id === body.id);
              if (!item || item.status !== 'proposto') throw Error('Registro pendente não encontrado nesta sessão');
              const changes = { expectedRevision: body.revisao, personId: body.pessoa ?? null, equipmentId: body.equipamento ?? null, channel: body.canal ?? null };
              if (body.acao === 'corrigir' && body.tipo === 'voz') result = registry.editVoiceProposal(body.id, { authorized: true, ...changes });
              else if (body.acao === 'corrigir' && body.tipo === 'vinculo') result = registry.editAssignment(body.id, changes);
              else if (body.acao === 'rejeitar' && body.tipo === 'voz') result = registry.rejectVoiceProposal(body.id, { authorized: true, expectedRevision: body.revisao });
              else if (body.acao === 'rejeitar' && body.tipo === 'retorno') result = registry.rejectMonitorAssignment(body.id, { expectedRevision: body.revisao });
              else if (body.acao === 'rejeitar' && body.tipo === 'ligacao') result = registry.rejectSignalLink(body.id, { expectedRevision: body.revisao });
              else throw Error('Use o terminal para esta revisão');
            } else {
              result = operation(registry);
            }
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            response.end(JSON.stringify(result));
          } finally { registry.close(); }
        } catch (error) {
          if (!response.headersSent && !response.destroyed) { response.writeHead(409, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: error.message })); }
        }
      })();
      return;
    }
    if (request.method === 'GET' && request.url === '/status') {
      void (async () => {
        await checkTarget();
        const mixer = connection ? {
          status: connection.status,
          connected: connection.isConnected(),
        } : { status: state === 'erro-configuracao' ? state : 'sem-configuracao', connected: false };
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ service: state, pid: process.pid, mixer: { ...mixer, appliedIp, restartRequired }, observation: observation.snapshot(), commands: { ...commands.getStatus(), activeSessionId }, voice: voice.getStatus(), voiceInputs: voice.getStatuses(), llm: llm.status() }));
      })();
      return;
    }
    if (request.method === 'GET' && request.url === '/responses/simulation') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ simulation: true, ...responses.snapshot() }));
      return;
    }
    if (request.method === 'GET' && request.url === '/session/formation') {
      try {
        if (activeSessionId === null) { response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify({ sessionId: null, formation: [] })); return; }
        const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
        try {
          const formation = registry.listSessionFormation(activeSessionId);
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(JSON.stringify({ sessionId: activeSessionId, formation }));
        } finally { registry.close(); }
      } catch { response.writeHead(500).end(); }
      return;
    }
    if (request.method === 'POST' && request.url === '/shutdown') {
      response.writeHead(202, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ accepted: true }));
      setImmediate(() => { void close(); });
      return;
    }
    if (request.method === 'POST' && ['/commands/mode', '/commands/mode-config', '/commands/session', '/commands/text', '/commands/confirm', '/voice/start', '/voice/capture', '/voice/capture-assignment', '/config/prepare', '/llm/configure', '/llm/acknowledge-restore', '/responses/simulation/configure', '/responses/simulation/enqueue', '/responses/simulation/complete', '/responses/simulation/cancel'].includes(request.url)) {
      if (request.headers.origin !== undefined) { response.writeHead(403).end(); return; }
      void (async () => {
        let abandoned = false;
        let requestGeneration;
        let requestInput = 'principal';
        let unreportedVoiceProposal;
        response.on('close', () => {
          if (!response.writableFinished && unreportedVoiceProposal !== undefined) {
            try {
              const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
              try { registry.discardUnreviewedVoiceProposal(unreportedVoiceProposal.id, { authorized: true, expectedRevision: unreportedVoiceProposal.revision }); }
              finally { registry.close(); }
            } catch { /* best effort; a proposal reviewed by another process is never removed */ }
          }
          if (!response.writableEnded) {
            abandoned = true;
            if (requestGeneration !== undefined && commands.getGeneration(requestInput) === requestGeneration) commands.invalidate(requestInput);
          }
        });
        try {
          const body = await readJson(request);
          if (abandoned || state === 'encerrando' || state === 'encerrado') return;
          const needsTarget = ['/commands/text', '/commands/confirm', '/voice/capture', '/voice/capture-assignment'].includes(request.url);
          const targetValid = !needsTarget || await checkTarget();
          if (abandoned || state === 'encerrando' || state === 'encerrado') return;
          let result;
          if (request.url === '/config/prepare' && hasOnly(body, [])) {
            requireRestart();
            result = { status: 'restart-required' };
          } else if (!targetValid) {
            result = { status: 'restart-required' };
          } else if (modeUpdatePending && ['/commands/text', '/commands/confirm', '/voice/capture', '/voice/capture-assignment'].includes(request.url)) {
            result = { status: 'configuration-in-progress' };
          } else if (request.url === '/commands/mode' && hasOnly(body, ['mode']) && typeof body.mode === 'string') {
            result = await serializeModeChange(() => state === 'encerrando' || state === 'encerrado' ? { status: 'cancelled' } : commands.setMode(body.mode));
            if (result.ok) { responses.cancelAll('mode-changed'); refreshResponses(); }
          } else if (request.url === '/commands/mode-config' && hasOnly(body, ['passageInputs', 'masterInputId']) && Object.hasOwn(body, 'passageInputs') && Object.hasOwn(body, 'masterInputId')) {
            result = await serializeModeChange(async () => {
              if (state === 'encerrando' || state === 'encerrado' || abandoned) return { status: 'cancelled' };
              let config;
              try { config = validateModeConfig(body); }
              catch (error) { return { ok: false, reason: 'invalid_configuration', message: error.message, state: commands.getStatus() }; }
              if (commands.getStatus().mode === 'worship' && config.masterInputId === null) {
                return { ok: false, reason: 'master_required_in_worship', state: commands.getStatus() };
              }
              commands.invalidate();
              modeUpdatePending = true;
              try {
                await saveModeConfigImpl(config, { directory: runtimeDirectory });
                if (state === 'encerrando' || state === 'encerrado') return { status: 'cancelled' };
                return commands.configureMode(config);
              } catch { return { ok: false, reason: 'persistence_failed', state: commands.getStatus() }; }
              finally { modeUpdatePending = false; }
            });
          } else if (request.url === '/llm/configure' && hasOnly(body, ['provider', 'model', 'dailyLimit'])) {
            const settings = llm.configure(body);
            commands.invalidate();
            result = { ok: true, ...settings };
          } else if (request.url === '/llm/acknowledge-restore' && hasOnly(body, [])) {
            const settings = llm.acknowledgeRestore();
            commands.invalidate();
            result = { ok: true, ...settings };
          } else if (request.url === '/commands/session' && hasOnly(body, ['sessionId']) && Object.hasOwn(body, 'sessionId') &&
              (body.sessionId === null || (Number.isSafeInteger(body.sessionId) && body.sessionId > 0))) {
            if (body.sessionId !== null) {
              const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
              try { if (!registry.listSessions().some(session => session.id === body.sessionId)) throw new Error('Sessão não encontrada'); }
              finally { registry.close(); }
            }
            commands.invalidate();
            responses.cancelAll('session-changed');
            activeSessionId = body.sessionId;
            result = { ok: true, activeSessionId };
          } else if (request.url === '/responses/simulation/configure' && hasOnly(body, ['paLimitDb', 'returns']) &&
              (body.paLimitDb === null || (typeof body.paLimitDb === 'number' && Number.isFinite(body.paLimitDb) && body.paLimitDb <= 0)) &&
              body.returns && typeof body.returns === 'object' && !Array.isArray(body.returns) && Object.keys(body.returns).length <= 64 &&
              Object.entries(body.returns).every(([id, value]) => id.length > 0 && id.length <= 256 && value && typeof value === 'object' && !Array.isArray(value) &&
                hasOnly(value, ['id', 'confirmed', 'exclusive', 'available']) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 256 &&
                ['confirmed', 'exclusive', 'available'].every(key => typeof value[key] === 'boolean'))) {
            simulatedRoutes = { paLimitDb: body.paLimitDb, returns: body.returns };
            refreshResponses();
            result = { ok: true, simulation: true, ...responses.snapshot() };
          } else if (request.url === '/responses/simulation/enqueue' && hasOnly(body, ['recipientId', 'text']) &&
              commands.getStatus().mode !== 'paused') {
            refreshResponses();
            result = { ok: true, simulation: true, id: responses.enqueue(body), ...responses.snapshot() };
          } else if (request.url === '/responses/simulation/complete' && hasOnly(body, ['id', 'failed']) && Number.isSafeInteger(body.id) &&
              (body.failed === undefined || typeof body.failed === 'boolean')) {
            result = { ok: responses.complete(body.id, { failed: body.failed ?? false }), simulation: true, ...responses.snapshot() };
          } else if (request.url === '/responses/simulation/cancel' && hasOnly(body, ['id']) && Number.isSafeInteger(body.id)) {
            result = { ok: responses.cancel(body.id), simulation: true, ...responses.snapshot() };
          } else if (request.url === '/commands/text' && hasOnly(body, ['text', 'inputId', 'consentToProvider']) && typeof body.text === 'string' &&
              (body.inputId === undefined || typeof body.inputId === 'string') &&
              (body.consentToProvider === undefined || typeof body.consentToProvider === 'boolean')) {
            requestInput = body.inputId ?? 'principal';
            const pendingRequest = commands.process({ inputId: requestInput, text: body.text, consentToProvider: body.consentToProvider ?? false });
            requestGeneration = commands.getGeneration(requestInput);
            result = await pendingRequest;
            requestGeneration = undefined;
          } else if (request.url === '/commands/confirm' && hasOnly(body, ['id']) && typeof body.id === 'string') {
            result = commands.confirm({ id: body.id });
          } else if (request.url === '/voice/start' && hasOnly(body, ['inputId', 'acceptDeviceRevision']) &&
              (body.inputId === undefined || typeof body.inputId === 'string') &&
              (body.acceptDeviceRevision === undefined || (typeof body.acceptDeviceRevision === 'string' && body.acceptDeviceRevision.length > 0 && body.acceptDeviceRevision.length <= 128))) {
            const inputId = body.inputId ?? 'principal';
            try { await voice.start(inputId, { acceptDeviceRevision: body.acceptDeviceRevision ?? null }); result = { status: 'ready', voice: voice.getStatus(inputId) }; }
            catch (error) { result = { status: 'failed', message: error.message, voice: voice.getStatus(inputId) }; }
          } else if (request.url === '/voice/capture-assignment' && hasOnly(body, ['inputId']) && (body.inputId === undefined || typeof body.inputId === 'string')) {
            const inputId = body.inputId ?? 'principal';
            if (activeSessionId === null || !connection?.isConnected() || !commands.inputAllowed(inputId)) {
              result = { status: 'denied', reason: 'session_or_input_unavailable' };
            } else {
              commands.invalidate(inputId);
              requestInput = inputId;
              requestGeneration = commands.getGeneration(inputId);
              const generation = requestGeneration;
              const sessionId = activeSessionId;
              const sourceContext = commands.getInputContext(inputId);
              const source = JSON.stringify(sourceContext);
              try {
                const text = await voice.transcribe(inputId);
                if (!await checkTarget() || abandoned || state === 'encerrando' || state === 'encerrado' || modeUpdatePending ||
                    generation !== commands.getGeneration(inputId) || activeSessionId !== sessionId || response.destroyed || !connection?.isConnected() ||
                    !commands.inputAllowed(inputId) || source !== JSON.stringify(commands.getInputContext(inputId))) result = { status: 'cancelled' };
                else if (/^\s*(?:mesa\s*[,;:]?\s*)?cancelar[.!?\s]*$/iu.test(text)) result = { status: 'cancelled' };
                else {
                  const registry = openRegistry(path.join(runtimeDirectory, 'cadastros.sqlite'));
                  try {
                    result = parsePhysicalRegistryCommand(['voz-vinculo', 'propor', String(sessionId), inputId, text], { expectedBinding: sourceContext })(registry);
                    if (result.proposal) unreportedVoiceProposal = { id: result.proposal.id, revision: soundcheckRevision('voz', result.proposal) };
                    if (result.proposal) result = { ...result, reviewCommand: `passagem mostrar ${sessionId}` };
                  }
                  finally { registry.close(); }
                }
              } catch (error) { result = { status: 'failed', message: error.message }; }
              requestGeneration = undefined;
            }
          } else if (request.url === '/voice/capture' && hasOnly(body, ['inputId', 'consentToProvider']) && (body.inputId === undefined || typeof body.inputId === 'string') &&
              (body.consentToProvider === undefined || typeof body.consentToProvider === 'boolean')) {
            const inputId = body.inputId ?? 'principal';
            if (!connection?.isConnected() || !commands.inputAllowed(inputId)) {
              result = { status: 'denied' };
            } else {
              commands.invalidate(inputId);
              const generation = commands.getGeneration(inputId);
              const source = JSON.stringify(commands.getInputContext(inputId));
              try {
                const text = await voice.transcribe(inputId);
                if (!await checkTarget() || abandoned || state === 'encerrando' || state === 'encerrado' || generation !== commands.getGeneration(inputId) || !connection?.isConnected() ||
                    !commands.inputAllowed(inputId) || source !== JSON.stringify(commands.getInputContext(inputId))) result = { status: 'cancelled' };
                else result = { ...(await commands.process({ inputId, text, consentToProvider: body.consentToProvider ?? false })), text };
              } catch (error) { result = { status: 'failed', message: error.message }; }
            }
          } else throw new Error('body');
          if (result.status === 'proposal' && request.url !== '/voice/capture-assignment' && !await checkTarget()) result = { status: 'restart-required' };
          if (abandoned) {
            if (result.status === 'proposal') commands.invalidateProposal(result.id);
            return;
          }
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(JSON.stringify(result));
        } catch {
          if (!response.headersSent && !response.destroyed) response.writeHead(400).end();
        }
      })();
      return;
    }
    response.writeHead(404).end();
  });

  const close = () => {
    if (closePromise) return closePromise;
    state = 'encerrando';
    commands.invalidate();
    responses.stop();
    observation.reset(false);
    closePromise = (async () => {
      await new Promise(resolve => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
      await connection?.stop();
      await voice.stop();
      llm.close?.();
      try {
        const current = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        if (current.pid === process.pid) await fs.rm(manifestPath, { force: true });
      } catch { /* manifesto ausente ou já substituído */ }
      state = 'encerrado';
    })();
    return closePromise;
  };

  await new Promise((resolve, reject) => {
    const onError = error => reject(error);
    server.once('error', onError);
    server.listen({ host, port }, async () => {
      server.off('error', onError);
      listener = server.address();
      try {
        await publishManifest(runtimeDirectory, { host, port: listener.port, token, pid: process.pid });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }).catch(async error => {
    if (server.listening) {
      await new Promise(resolve => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
    await connection?.stop();
    await voice.stop();
    llm.close?.();
    throw error;
  });

  return {
    address: listener,
    manifestPath,
    getState: () => state,
    commands,
    close,
  };
}

export { DEFAULT_PORT, MANIFEST };
