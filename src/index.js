import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { parseCommand, describe } from './commands.js';

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
if (has('--help')) {
  console.log('npm start -- [--live --ip IP_DA_MESA] [--texto] [--python CAMINHO] [--modelo small]');
  process.exit(0);
}
const live = has('--live'), ip = value('--ip');
if (live && (!ip || ip.startsWith('--'))) { console.error('Informe o endereço da mesa com --ip.'); process.exit(1); }
const rl = createInterface({ input: stdin, output: stdout });
let mixer, ConnectionStatus;
async function transcribe() {
  const python = value('--python') || (process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');
  const model = value('--modelo') || 'small';
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['src/transcribe.py', '--model', model], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => out += chunk);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(Error(`Transcrição terminou com código ${code}.`)));
  });
}
try {
  console.log(live ? `MODO REAL: comandos confirmados serão enviados para ${ip}.` : 'MODO SIMULAÇÃO: nenhum comando será enviado à mesa.');
  if (live) {
    const library = await import('soundcraft-ui-connection');
    const { SoundcraftUI } = library;
    ConnectionStatus = library.ConnectionStatus;
    mixer = new SoundcraftUI(ip);
    console.log('Conectando à mesa...');
    // connect() does not reject on errors; never report success without a status check.
    let timer;
    try {
      await Promise.race([mixer.connect(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Tempo de conexão esgotado.')), 8000); })]);
    } finally { clearTimeout(timer); }
    if (mixer.status !== ConnectionStatus.Open) throw Error('A conexão não foi confirmada pela biblioteca.');
    console.log('Conexão estabelecida.');
  }
  while (true) {
    const input = await rl.question(has('--texto') ? '\nDigite o comando (ou sair): ' : '\nEnter para gravar por 5 segundos (ou sair): ');
    if (input.trim().toLowerCase() === 'sair') break;
    try {
      const text = has('--texto') ? input : await transcribe();
      console.log(`Reconhecido: ${text || '(vazio)'}`);
      const command = parseCommand(text);
      console.log(describe(command));
      if ((await rl.question('Confirmar? Digite sim: ')).trim().toLowerCase() !== 'sim') { console.log('Cancelado.'); continue; }
      if (live) {
        if (mixer.status !== ConnectionStatus.Open) throw Error('Mesa desconectada; comando não enviado.');
        const channel = mixer.master.input(command.channel);
        if (command.action === 'mute') channel.mute();
        else if (command.action === 'unmute') channel.unmute();
        else channel.setFaderLevelDB(command.db);
        console.log('Comando enviado; confira o resultado na interface da mesa.');
      } else console.log('Simulação concluída.');
    } catch (error) { console.error(`Erro: ${error.message}`); }
  }
} catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
finally { rl.close(); if (mixer) await mixer.disconnect(); }
