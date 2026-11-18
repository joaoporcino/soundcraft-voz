import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { closeSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDirectory } from './config.js';
import { MANIFEST } from './local-service.js';
import { loadVoiceInputs, saveVoiceInputs } from './voice-input-config.js';

const SERVICE_ENTRY = fileURLToPath(import.meta.url);
const DEFAULT_START_TIMEOUT_MS = 8000;
const POLL_MS = 100;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readManifest(directory) {
  try {
    const data = JSON.parse(await fs.readFile(path.join(directory, MANIFEST), 'utf8'));
    if (data.host !== '127.0.0.1' || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535 ||
      typeof data.token !== 'string' || !Number.isInteger(data.pid)) return null;
    return data;
  } catch { return null; }
}

function request(manifest, endpoint, method = 'GET', timeoutMs = 1000, body) {
  return new Promise((resolve, reject) => {
    globalThis.fetch(`http://${manifest.host}:${manifest.port}${endpoint}`, {
      method,
      headers: { 'x-soundcraft-token': manifest.token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: globalThis.AbortSignal.timeout(timeoutMs),
    }).then(async response => {
      if (!response.ok && response.status !== 202) throw new Error(`Serviço respondeu HTTP ${response.status}.`);
      resolve(response.status === 202 ? { accepted: true } : response.json());
    }).catch(reject);
  });
}

async function getStatus(directory) {
  const manifest = await readManifest(directory);
  if (!manifest) return null;
  try { return { manifest, status: await request(manifest, '/status') }; }
  catch { return null; }
}

/** Block operations before the official IP writer changes the file. */
export async function prepareIpChange(directory = getConfigDirectory()) {
  const manifest = await readManifest(directory);
  if (!manifest) {
    try { await fs.access(path.join(directory, MANIFEST)); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    throw new Error('Manifesto do serviço inválido; não é possível confirmar que a operação está bloqueada.');
  }
  try {
    const result = await request(manifest, '/config/prepare', 'POST', 5000, {});
    if (result.status !== 'restart-required') throw new Error('Resposta inesperada.');
  } catch (error) {
    throw new Error(`Não foi possível bloquear o serviço antes de alterar o IP: ${error.message}`, { cause: error });
  }
}

async function startService(directory, {
  timeoutMs = DEFAULT_START_TIMEOUT_MS,
  port = 43129,
  executable = process.execPath,
  entry = SERVICE_ENTRY,
} = {}) {
  const existing = await getStatus(directory);
  if (existing) return { ...existing, alreadyRunning: true };

  await fs.mkdir(directory, { recursive: true });
  const logPath = path.join(directory, 'local-service.log');
  const logFd = openSync(logPath, 'a');
  let child;
  try {
    child = spawn(executable, [entry, '--daemon'], {
      cwd: path.dirname(path.dirname(entry)),
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        SOUNDCRAFT_CONFIG_DIR: directory,
        SOUNDCRAFT_LOCAL_SERVICE_PORT: String(port),
      },
    });
  } finally {
    closeSync(logFd);
  }
  let childError;
  let childExit;
  let resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });
  child.once('error', error => { childError = error; });
  child.once('exit', (code, signal) => {
    childExit = { code, signal };
    resolveExit(childExit);
  });
  child.unref();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childError) throw new Error(`Não foi possível iniciar o processo do serviço: ${childError.message}`, { cause: childError });
    if (childExit) throw new Error(`O processo do serviço encerrou antes de ficar pronto (código ${childExit.code ?? childExit.signal}).`);
    const running = await getStatus(directory);
    if (running) return { ...running, alreadyRunning: false };
    await delay(POLL_MS);
  }
  if (child.pid && !childExit) {
    child.kill('SIGTERM');
    await Promise.race([exited, delay(1000)]);
    if (!childExit) {
      child.kill('SIGKILL');
      await Promise.race([exited, delay(1000)]);
    }
  }
  let details = '';
  try { details = (await fs.readFile(logPath, 'utf8')).trim().slice(-1200); } catch { /* no log */ }
  throw new Error(`O serviço não ficou pronto em ${timeoutMs} ms.${details ? ` Log: ${details}` : ''}`);
}

async function stopService(directory, { timeoutMs = 5000 } = {}) {
  const running = await getStatus(directory);
  if (!running) {
    if (!await readManifest(directory)) return { stopped: false, alreadyStopped: true };
    throw new Error('O serviço local está indisponível, mas ainda há um manifesto de execução; não foi possível confirmar a parada.');
  }
  await request(running.manifest, '/shutdown', 'POST');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await readManifest(directory)) return { stopped: true, alreadyStopped: false };
    await delay(POLL_MS);
  }
  throw new Error(`O serviço aceitou a parada, mas ainda responde após ${timeoutMs} ms.`);
}

export async function runLocalServiceCli(args = process.argv.slice(2), {
  directory = getConfigDirectory(),
  stdout = console.log,
  stderr = console.error,
  startOptions,
  stopOptions,
} = {}) {
  const command = args[0];
  try {
    if (command === 'painel') {
      if (args.length !== 1) throw new Error('Uso: painel');
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      stdout(`http://127.0.0.1:${running.manifest.port}/painel/#token=${encodeURIComponent(running.manifest.token)}`);
      return 0;
    }
    if (command === 'resposta-simulada') {
      const [action, ...values] = args.slice(1);
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      let endpoint = '/responses/simulation', body;
      if (action === 'listar' && values.length === 0) {
        stdout(JSON.stringify(await request(running.manifest, endpoint), null, 2));
        return 0;
      }
      if (action === 'configurar' && values.length === 1) { endpoint += '/configure'; body = JSON.parse(values[0]); }
      else if (action === 'enfileirar' && values.length === 2) { endpoint += '/enqueue'; body = { recipientId: values[0], text: values[1] }; }
      else if (['concluir', 'falhar', 'cancelar'].includes(action) && values.length === 1 && /^[1-9]\d*$/u.test(values[0])) {
        endpoint += action === 'cancelar' ? '/cancel' : '/complete';
        body = { id: Number(values[0]), ...(action === 'falhar' ? { failed: true } : {}) };
      } else throw new Error('Uso: resposta-simulada listar|configurar JSON|enfileirar DESTINATARIO TEXTO|concluir ID|falhar ID|cancelar ID');
      const result = await request(running.manifest, endpoint, 'POST', 5000, body);
      stdout(JSON.stringify(result, null, 2));
      return result.ok ? 0 : 1;
    }
    if (command === 'start') {
      const result = await startService(directory, startOptions);
      stdout(result.alreadyRunning ? 'Serviço local já estava ativo.' : 'Serviço local iniciado.');
      return 0;
    }
    if (command === 'status') {
      const result = await getStatus(directory);
      if (!result) {
        stdout('Serviço local parado ou indisponível.');
        return 1;
      }
      stdout(JSON.stringify(result.status, null, 2));
      return 0;
    }
    if (command === 'stop') {
      const result = await stopService(directory, stopOptions);
      stdout(result.alreadyStopped ? 'Serviço local já estava parado.' : 'Serviço local encerrado.');
      return 0;
    }
    if (command === 'llm') {
      if (!((args.length === 2 && ['none', 'reconhecer-restauracao'].includes(args[1])) ||
          (args.length === 4 && ['gemini', 'openai', 'anthropic'].includes(args[1]) && args[2]?.trim() && /^[1-9]\d*$/.test(args[3])))) {
        throw new Error('Uso: llm none | llm reconhecer-restauracao | llm gemini|openai|anthropic MODELO LIMITE_DIARIO');
      }
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      const endpoint = args[1] === 'reconhecer-restauracao' ? '/llm/acknowledge-restore' : '/llm/configure';
      const body = args[1] === 'reconhecer-restauracao' ? {} : args[1] === 'none' ? { provider: 'none' } : { provider: args[1], model: args[2], dailyLimit: Number(args[3]) };
      if (args[1] === 'reconhecer-restauracao') stderr('A contagem pode ter retrocedido ao ponto do backup; confira o uso e os limites no provedor.');
      const result = await request(running.manifest, endpoint, 'POST', 5000, body);
      stdout(JSON.stringify(result, null, 2));
      return result.ok === true ? 0 : 1;
    }
    if (command === 'voz-entrada') {
      if (args.length === 2 && args[1] === 'listar') {
        stdout(JSON.stringify(await loadVoiceInputs({ directory }), null, 2));
        return 0;
      }
      const entries = await loadVoiceInputs({ directory });
      if (args.length === 3 && args[1] === 'remover') {
        if (!entries.some(item => item.inputId === args[2])) throw new Error('Entrada não encontrada.');
        await saveVoiceInputs(entries.filter(item => item.inputId !== args[2]), { directory });
      } else if (args.length === 5 && args[1] === 'definir' && /^\d+$/u.test(args[4])) {
        const next = { inputId: args[2], device: args[3] === '-' ? null : args[3], channel: Number(args[4]) };
        await saveVoiceInputs([...entries.filter(item => item.inputId !== next.inputId), next], { directory });
      } else throw new Error('Uso: voz-entrada listar | voz-entrada definir ENTRADA DISPOSITIVO|- CANAL | voz-entrada remover ENTRADA');
      stdout('Configuração salva; reinicie o serviço para aplicar.');
      return 0;
    }
    if (command === 'sessao') {
      if (args.length !== 2 || (args[1] !== 'nenhuma' && !/^[1-9]\d*$/u.test(args[1]))) throw new Error('Uso: sessao ID|nenhuma');
      const sessionId = args[1] === 'nenhuma' ? null : Number(args[1]);
      if (sessionId !== null && !Number.isSafeInteger(sessionId)) throw new Error('ID da sessão inválido');
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      const result = await request(running.manifest, '/commands/session', 'POST', 5000, { sessionId });
      stdout(JSON.stringify(result, null, 2));
      return result.ok === true ? 0 : 1;
    }
    if (command === 'texto-entrada' || command === 'texto-entrada-llm') {
      const consent = command === 'texto-entrada-llm';
      if (consent ? args.length !== 4 || !args[1]?.trim() || args[2] !== '--consinto' || !args[3]?.trim() : args.length !== 3 || !args[1]?.trim() || !args[2]?.trim()) throw new Error('Uso: texto-entrada ENTRADA FRASE | texto-entrada-llm ENTRADA --consinto FRASE');
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      if (consent) stderr('O pedido poderá ser enviado ao provedor selecionado e gerar custo; o limite de tentativas não limita gastos.');
      const result = await request(running.manifest, '/commands/text', 'POST', consent ? 70000 : 5000, { inputId: args[1], text: consent ? args[3] : args[2], consentToProvider: consent });
      stdout(JSON.stringify(result, null, 2));
      return ['proposal', 'waiting'].includes(result.status) ? 0 : 1;
    }
    if (command === 'voz-capturar-llm') {
      if ((args.length !== 2 && args.length !== 3) || args[1] !== '--consinto' || (args.length === 3 && !args[2]?.trim())) throw new Error('Uso: voz-capturar-llm --consinto [ENTRADA]');
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      stderr('A transcrição poderá ser enviada ao provedor selecionado e gerar custo; o limite de tentativas não limita gastos.');
      const result = await request(running.manifest, '/voice/capture', 'POST', 210000, { inputId: args[2] ?? 'principal', consentToProvider: true });
      stdout(JSON.stringify(result, null, 2));
      return ['proposal', 'waiting'].includes(result.status) ? 0 : 1;
    }
    if (command === 'texto-llm') {
      if (args.length !== 3 || args[1] !== '--consinto' || !args[2]?.trim()) throw new Error('Uso: texto-llm --consinto "mesa, pedido"');
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      stderr('O pedido poderá ser enviado ao provedor selecionado e gerar custo; o limite de tentativas não limita gastos.');
      const result = await request(running.manifest, '/commands/text', 'POST', 70000, { text: args[2], consentToProvider: true });
      stdout(JSON.stringify(result, null, 2));
      return ['proposal', 'waiting'].includes(result.status) ? 0 : 1;
    }
    if (command === 'voz-aceitar-dispositivo') {
      if ((args.length !== 2 && args.length !== 3) || !args[1]?.trim() || args[1].length > 128 || (args.length === 3 && !args[2]?.trim())) {
        throw new Error('Uso: voz-aceitar-dispositivo REVISAO [ENTRADA]');
      }
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      const result = await request(running.manifest, '/voice/start', 'POST', 210000, { inputId: args[2] ?? 'principal', acceptDeviceRevision: args[1] });
      stdout(JSON.stringify(result, null, 2));
      return result.status === 'ready' ? 0 : 1;
    }
    if (['modo', 'entradas', 'texto', 'confirmar', 'voz-iniciar', 'voz-capturar', 'voz-cadastro'].includes(command)) {
      const voiceCommand = command.startsWith('voz-');
      if (command === 'entradas' ? args.length !== 3 || !args[1]?.trim() || !args[2]?.trim() : voiceCommand ? args.length > 2 || (args.length === 2 && !args[1]?.trim()) : args.length !== 2 || !args[1]?.trim()) throw new Error('Argumentos inválidos; coloque frases entre aspas.');
      const running = await getStatus(directory);
      if (!running) throw new Error('Serviço local parado ou indisponível.');
      const endpoint = { modo: '/commands/mode', entradas: '/commands/mode-config', texto: '/commands/text', confirmar: '/commands/confirm',
        'voz-iniciar': '/voice/start', 'voz-capturar': '/voice/capture', 'voz-cadastro': '/voice/capture-assignment' }[command];
      const body = command === 'modo' ? { mode: { pausa: 'paused', passagem: 'passage', culto: 'worship' }[args[1]] ?? args[1] }
        : command === 'entradas' ? { passageInputs: args[1] === '-' ? [] : args[1].split(','), masterInputId: args[2] === '-' ? null : args[2] }
        : command === 'texto' ? { text: args[1] } : command === 'confirmar' ? { id: args[1] }
          : args[1] ? { inputId: args[1] } : {};
      const result = await request(running.manifest, endpoint, 'POST', voiceCommand ? 210000 : 5000, body);
      stdout(JSON.stringify(result, null, 2));
      return ['sent', 'proposal', 'clarification', 'waiting', 'ready'].includes(result.status) || result.ok === true ? 0 : 1;
    }
    stdout('Uso: node src/local-service-cli.js <start|status|stop|painel|resposta-simulada listar|configurar JSON|enfileirar DESTINATARIO TEXTO|concluir ID|falhar ID|cancelar ID|modo pausa|modo passagem|modo culto|entradas principal,outra principal|sessao ID|nenhuma|texto "mesa, mute canal 3"|texto-entrada ENTRADA FRASE|texto-entrada-llm ENTRADA --consinto FRASE|voz-entrada listar|voz-entrada definir ENTRADA DISPOSITIVO|- CANAL|voz-entrada remover ENTRADA|llm none|llm reconhecer-restauracao|llm gemini|openai|anthropic MODELO LIMITE_DIARIO|texto-llm --consinto "mesa, pedido"|confirmar ID|voz-iniciar [ENTRADA]|voz-aceitar-dispositivo REVISAO [ENTRADA]|voz-capturar [ENTRADA]|voz-cadastro [ENTRADA]|voz-capturar-llm --consinto [ENTRADA]>');
    return command ? 2 : 0;
  } catch (error) {
    stderr(`Erro no serviço local: ${error.message}`);
    return 1;
  }
}

async function runDaemon() {
  let service;
  try {
    const runtimeDirectory = getConfigDirectory();
    const configuredPort = Number(process.env.SOUNDCRAFT_LOCAL_SERVICE_PORT);
    const port = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65535
      ? configuredPort
      : 43129;
    service = await (await import('./local-service.js')).createLocalService({ runtimeDirectory, port });
  } catch (error) {
    console.error(`Falha ao iniciar serviço local: ${error.stack || error.message}`);
    process.exitCode = 1;
    return;
  }
  let closing;
  const shutdown = () => {
    if (!closing) closing = service.close().catch(error => {
      console.error(`Falha ao encerrar serviço local: ${error.stack || error.message}`);
      process.exitCode = 1;
    });
    return closing;
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('SIGHUP', shutdown);
}

export { getStatus, startService, stopService };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SERVICE_ENTRY)) {
  if (process.argv.includes('--daemon')) await runDaemon();
  else process.exitCode = await runLocalServiceCli();
}
