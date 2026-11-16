import { WebSocketServer, WebSocket } from 'ws';
import { DBToFaderValue, faderValueToDB } from 'soundcraft-ui-connection';
import { CHANNEL_COUNT, MixerState } from './mixer-state.js';

const HOST = '127.0.0.1';

function encode(channel, property, value) {
  const control = property === 'mute' ? 'mute' : 'mix';
  const wireValue = property === 'mute' ? Number(value) : DBToFaderValue(value);
  return `3:::SETD^i.${channel - 1}.${control}^${wireValue}`;
}

/** Local WebSocket peer for the supported subset of the Ui24R text protocol. */
export async function createUi24rServer({ mixerState = new MixerState(), port = 0 } = {}) {
  if (!(mixerState instanceof MixerState)) throw new TypeError('mixerState deve ser uma instância de MixerState.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Porta inválida.');

  const server = new WebSocketServer({ host: HOST, port });
  const commands = [];
  const rejected = [];
  let closed = false;

  const broadcast = (frame) => {
    for (const client of server.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(frame);
    }
  };

  const onChange = ({ channel, property, value }) => broadcast(encode(channel, property, value));
  mixerState.on('change', onChange);

  server.on('connection', (socket) => {
    for (let channel = 1; channel <= CHANNEL_COUNT; channel += 1) {
      const current = mixerState.getChannel(channel);
      socket.send(encode(channel, 'faderDb', current.faderDb));
      socket.send(encode(channel, 'mute', current.mute));
    }
    socket.on('message', (data) => {
      const frame = data.toString();
      if (!frame.startsWith('3:::')) {
        rejected.push(frame);
        return;
      }
      const command = frame.slice(4);
      commands.push(command);
      if (command === 'ALIVE') return;
      const parts = command.split('^');
      const match = parts.length === 3 && parts[0] === 'SETD'
        ? /^i\.(\d+)\.(mute|mix)$/.exec(parts[1])
        : null;
      const value = parts.length === 3 && parts[2].trim() !== '' ? Number(parts[2]) : NaN;
      if (!match || !Number.isFinite(value)) {
        rejected.push(command);
        return;
      }
      const channel = Number(match[1]) + 1;
      if (channel < 1 || channel > CHANNEL_COUNT) {
        rejected.push(command);
        return;
      }
      try {
        if (match[2] === 'mute') {
          if (value !== 0 && value !== 1) throw new RangeError('Mute fora do domínio');
          const previous = mixerState.getChannel(channel).mute;
          mixerState.setMute(channel, value === 1);
          if (previous === (value === 1)) socket.send(encode(channel, 'mute', previous));
        } else {
          if (value < 0 || value > 1) throw new RangeError('Fader fora do domínio');
          const db = faderValueToDB(value);
          if (!Number.isFinite(db) || db < -60 || db > 0) throw new RangeError('Fader fora da faixa simulada');
          const previous = mixerState.getChannel(channel).faderDb;
          mixerState.setFader(channel, db);
          if (previous === db) socket.send(encode(channel, 'faderDb', db));
        }
      } catch {
        rejected.push(command);
      }
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (error) {
    mixerState.off('change', onChange);
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Falha ao obter endereço local do servidor.');
  return {
    targetIP: `${HOST}:${address.port}`,
    server,
    mixerState,
    commands,
    rejected,
    async close() {
      if (closed) return;
      closed = true;
      mixerState.off('change', onChange);
      for (const client of server.clients) client.terminate();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
