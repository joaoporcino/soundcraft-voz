import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { parseCommand, describe } from './commands.js';
import { VoiceWorker } from './voice-worker.js';
import { loadConfig, saveConfig, validateAddress } from './config.js';
import { MixerConnection } from './mixer-connection.js';

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const python = value('--python') || (process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');
if (has('--help')) {
  console.log('npm start -- [--menu | --servico start|status|stop | --cadastro COMANDO | --exportar-backup ARQUIVO | --restaurar-backup ARQUIVO --destino DIRETORIO | --configurar-ip IP_DA_MESA | --mostrar-ip | --live [--ip IP_DA_MESA]] [--texto] [--descrever] [--fim-por-silencio] [--dispositivo ID] [--canal-audio N] [--listar-dispositivos] [--modelo small]');
  process.exit(0);
}
if (has('--menu')) {
  const { runTerminalUi } = await import('./terminal-ui.js');
  await runTerminalUi();
} else if (has('--servico')) {
  try {
    const { runLocalServiceCli } = await import('./local-service-cli.js');
    process.exitCode = await runLocalServiceCli(args.slice(args.indexOf('--servico') + 1));
  } catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
} else if (has('--exportar-backup') || has('--restaurar-backup')) {
  try {
    const { createBackup, restoreBackup } = await import('./backup.js');
    if (has('--exportar-backup') && has('--restaurar-backup')) throw Error('Escolha exportar ou restaurar, não ambos.');
    if (has('--exportar-backup')) {
      const destination = value('--exportar-backup');
      if (!destination || destination.startsWith('--')) throw Error('Informe o arquivo de destino do backup.');
      const result = await createBackup({ destination });
      console.log(`Backup criado: ${result.destination}`);
    } else {
      const source = value('--restaurar-backup'), directory = value('--destino');
      if (!source || source.startsWith('--') || !directory || directory.startsWith('--')) throw Error('Informe o arquivo e um diretório de destino novo ou vazio.');
      const result = await restoreBackup({ source, directory });
      console.log(`Backup restaurado em: ${result.directory}`);
      for (const warning of result.cleanupWarnings) console.warn(warning);
    }
  } catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
} else if (has('--cadastro')) {
  try {
    const { runRegistryCommand } = await import('./registry-cli.js');
    await runRegistryCommand(args.slice(args.indexOf('--cadastro') + 1));
  } catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
} else if (has('--configurar-ip')) {
  try {
    const address = value('--configurar-ip');
    if (!address || address.startsWith('--')) throw Error('Informe o endereço após --configurar-ip.');
    validateAddress(address);
    const { prepareIpChange } = await import('./local-service-cli.js');
    await prepareIpChange();
    const config = await saveConfig(address);
    console.log(`Endereço salvo: ${config.ip}`);
    console.log('Se o serviço estava ativo, reinicie-o para aplicar o endereço.');
  } catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
} else if (has('--mostrar-ip')) {
  try {
    const config = await loadConfig();
    console.log(config ? `Endereço configurado: ${config.ip}` : 'Nenhum endereço configurado.');
  } catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
} else if (has('--listar-dispositivos') || has('--list-devices')) {
  const child = spawn(python, ['src/transcribe.py', '--list-devices'], { stdio: 'inherit' });
  child.on('error', error => { console.error(`Erro ao iniciar Python: ${error.message}`); process.exitCode = 1; });
  child.on('close', (code, signal) => { if (signal) console.error(`Python encerrado por sinal: ${signal}`); process.exitCode = code ?? 1; });
} else {
const live = has('--live'), descrever = has('--descrever');
let ip;
if (live) {
  try {
    if (has('--ip')) {
      const address = value('--ip');
      if (!address || address.startsWith('--')) throw Error('Informe o endereço após --ip.');
      ip = validateAddress(address);
    } else {
      const config = await loadConfig();
      if (!config) throw Error('Configure o endereço com --configurar-ip ou informe --ip.');
      ip = config.ip;
    }
  } catch (error) { console.error(`Erro: ${error.message}`); process.exit(1); }
}
const rl = createInterface({ input: stdin, output: stdout });
let connection, voiceWorker, voiceCleanup;
let interrupted = false;
let inputClosed = false;
let questionController;
rl.on('close', () => { inputClosed = true; questionController?.abort(); });
const closeVoice = () => {
  if (voiceWorker && !voiceCleanup) voiceCleanup = voiceWorker.close();
  return voiceCleanup;
};
const interrupt = () => {
  if (interrupted) return;
  interrupted = true;
  questionController?.abort();
  rl.close();
  void closeVoice()?.catch(error => console.error(`Erro ao encerrar voz: ${error.message}`));
};
rl.on('SIGINT', interrupt);
process.on('SIGINT', interrupt);
try {
  console.log(live ? `MODO REAL: comandos reconhecidos serão enviados para ${ip}.` : 'MODO SIMULAÇÃO: nenhum comando será enviado à mesa.');
  if (live) {
    connection = new MixerConnection({ targetIP: ip, onStatus: status => console.log(`[Mesa] ${status}`) });
    connection.start();
  }
  if (!has('--texto')) {
    voiceWorker = new VoiceWorker({
      python,
      model: value('--modelo') || 'small',
      device: value('--dispositivo'),
      channel: value('--canal-audio') || '1',
      descrever,
      fimPorSilencio: has('--fim-por-silencio'),
    });
    console.log('Iniciando reconhecimento de voz...');
    const startTime = performance.now();
    await voiceWorker.start();
    if (descrever) console.error(`[Tempo] Inicialização da voz: ${((performance.now() - startTime) / 1000).toFixed(2)} s`);
    console.log('Reconhecimento de voz pronto.');
  }
  while (!interrupted && !inputClosed) {
    const prompt = has('--texto') ? '\nDigite o comando (ou sair): ' : has('--fim-por-silencio')
      ? '\nEnter para gravar até o silêncio (ou sair): ' : '\nEnter para gravar por 5 segundos (ou sair): ';
    questionController = new AbortController();
    let input;
    try { input = await rl.question(prompt, { signal: questionController.signal }); }
    catch (error) { if (error.name === 'AbortError' && (interrupted || inputClosed)) break; throw error; }
    finally { questionController = undefined; }
    if (input.trim().toLowerCase() === 'sair') break;
    try {
      const startTime = performance.now();
      const text = has('--texto') ? input : await voiceWorker.transcribe();
      if (interrupted) break;
      if (descrever && !has('--texto')) console.error(`[Tempo] Gravação e transcrição: ${((performance.now() - startTime) / 1000).toFixed(2)} s`);
      if (descrever) console.log(`[Whisper - Transcrição completa]: "${text || '(vazio)'}"`);
      else console.log(`Reconhecido: ${text || '(vazio)'}`);
      const command = parseCommand(text);
      console.log(describe(command));
      if (live) {
        if (!connection.isConnected()) throw Error('Mesa desconectada; comando não enviado.');
        const channel = connection.mixer.master.input(command.channel);
        if (command.action === 'mute') channel.mute();
        else if (command.action === 'unmute') channel.unmute();
        else channel.setFaderLevelDB(command.db);
        console.log('Comando enviado; confira o resultado na interface da mesa.');
      } else console.log('Simulação concluída.');
    } catch (error) {
      if (interrupted) break;
      if (descrever) console.error(`[Aviso]: ${error.message}`);
      else console.error(`Erro: ${error.message}`);
      if (voiceWorker?.state === 'failed') { process.exitCode = 1; break; }
    }
  }
} catch (error) { if (!interrupted) { console.error(`Erro: ${error.message}`); process.exitCode = 1; } }
finally { process.off('SIGINT', interrupt); rl.close(); await closeVoice(); if (connection) await connection.stop(); }
}
