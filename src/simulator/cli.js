import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { MixerState, CHANNEL_COUNT } from './mixer-state.js';
import { createUi24rServer } from './websocket-server.js';

export function parseSimulatorCommand(line) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [command, ...args] = parts;
  if (['ajuda', 'sair', 'lista'].includes(command) && args.length === 0) return { command };
  if (command === 'canal' && args.length === 1 && /^\d+$/.test(args[0])) {
    return { command, channel: Number(args[0]) };
  }
  if (['mute', 'desmute'].includes(command) && args.length === 1 && /^\d+$/.test(args[0])) {
    return { command, channel: Number(args[0]) };
  }
  if (command === 'fader' && (args.length === 2 || (args.length === 3 && args[2].toLowerCase() === 'db')) && /^\d+$/.test(args[0]) && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(args[1])) {
    return { command, channel: Number(args[0]), db: Number(args[1]) };
  }
  return { command: 'invalid' };
}

function formatChannel(channel) {
  return `Canal ${String(channel.channel).padStart(2, '0')} | ${channel.mute ? 'MUTE' : 'aberto'} | fader ${channel.faderDb} dB`;
}

export function formatSimulatorHelp() {
  return [
    'Comandos: lista | canal N | mute N | desmute N | fader N DB | ajuda | sair',
    'N vai de 1 a 24. Fader vai de -60 a 0 dB (ex.: fader 3 -12.5 dB).',
  ].join('\n');
}

/** Terminal do simulador: aceita stream e servidor injetáveis para testes sem rede. */
export async function runSimulatorCli({
  input = process.stdin,
  output = process.stdout,
  state = new MixerState(),
  serverFactory = createUi24rServer,
  onSigint = true,
} = {}) {
  const peer = await serverFactory({ mixerState: state });
  const terminal = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  let closing;
  let finished = false;
  const write = (text) => output.write(`${text}\n`);

  const finish = () => {
    if (closing) return closing;
    finished = true;
    terminal.close();
    state.off('change', onChange);
    if (onSigint) process.off('SIGINT', onInterrupt);
    closing = Promise.resolve(peer.close()).catch((error) => write(`Erro ao encerrar servidor: ${error.message}`));
    return closing;
  };
  const onChange = ({ channel, property, value }) => {
    const current = state.getChannel(channel);
    const changed = property === 'mute' ? `mute ${value ? 'ativado' : 'desativado'}` : `fader ${value} dB`;
    write(`[SIMULAÇÃO] Canal ${channel}: ${changed} (estado atual: ${formatChannel(current)})`);
  };
  const onInterrupt = () => {
    write('\nEncerrando simulador...');
    void finish();
  };

  state.on('change', onChange);
  if (onSigint) process.once('SIGINT', onInterrupt);
  write('=== SIMULAÇÃO Ui24R — nenhum equipamento real será conectado ===');
  write(`Servidor WebSocket local: ws://${peer.targetIP}`);
  write(`Em outro terminal: npm start -- --texto --live --ip ${peer.targetIP}`);
  write('24 canais disponíveis. Digite ajuda para ver os comandos.');

  terminal.on('line', (line) => {
    const parsed = parseSimulatorCommand(line);
    if (!parsed) return;
    try {
      switch (parsed.command) {
        case 'ajuda': write(formatSimulatorHelp()); break;
        case 'lista': state.snapshot().channels.forEach((channel) => write(formatChannel(channel))); break;
        case 'canal': write(formatChannel(state.getChannel(parsed.channel))); break;
        case 'mute': state.setMute(parsed.channel, true); write(`Canal ${parsed.channel}: mute ativado.`); break;
        case 'desmute': state.setMute(parsed.channel, false); write(`Canal ${parsed.channel}: mute desativado.`); break;
        case 'fader': state.setFader(parsed.channel, parsed.db); write(`Canal ${parsed.channel}: fader definido em ${parsed.db} dB.`); break;
        case 'sair': write('Encerrando simulador...'); void finish(); break;
        default: write('Comando inválido. Digite ajuda para ver os comandos.');
      }
    } catch (error) {
      write(`Não foi possível executar o comando: ${error.message}`);
    }
  });
  terminal.once('close', () => { if (!finished) void finish(); });
  await new Promise((resolve) => terminal.once('close', resolve));
  await finish();
}

export async function main() {
  try {
    await runSimulatorCli();
  } catch (error) {
    process.stderr.write(`Não foi possível iniciar o simulador: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();

export { CHANNEL_COUNT };
