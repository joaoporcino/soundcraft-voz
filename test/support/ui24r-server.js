import { WebSocketServer } from 'ws';
import { DBToFaderValue, faderValueToDB } from 'soundcraft-ui-connection';

/** Local protocol peer for the text frames used by soundcraft-ui-connection. */
export class Ui24rServer {
  constructor({ channel = 1, mute, fader, mixerState, onCommand } = {}) {
    this.channel = channel;
    this.mixerState = mixerState;
    const stateChannel = mixerState?.getChannel(channel);
    this.mute = mute ?? stateChannel?.mute ?? false;
    this.fader = fader ?? (stateChannel ? DBToFaderValue(stateChannel.faderDb) : 0.5);
    this.onCommand = onCommand;
    this.commands = [];
    this.rejected = [];
    this.server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    this.server.on('connection', (socket) => {
      socket.send(`3:::SETD^i.${channel - 1}.mix^${this.fader}`);
      socket.send(`3:::SETD^i.${channel - 1}.mute^${Number(this.mute)}`);
      socket.on('message', (frame) => this.#receive(frame.toString()));
    });
  }

  async listen() {
    if (this.server.address()) return this;
    await new Promise((resolve, reject) => {
      this.server.once('listening', resolve);
      this.server.once('error', reject);
    });
    return this;
  }

  get targetIP() {
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor ainda não está escutando');
    return `127.0.0.1:${address.port}`;
  }

  #receive(frame) {
    if (!frame.startsWith('3:::')) {
      this.rejected.push(frame);
      return;
    }
    const command = frame.slice(4);
    this.commands.push(command);
    this.onCommand?.(command);
    if (command === 'ALIVE') return;
    const parts = command.split('^');
    const [verb, path, rawValue] = parts;
    if (parts.length !== 3 || verb !== 'SETD' || !path || rawValue === undefined) {
      this.rejected.push(command);
      return;
    }
    const match = path.match(/^i\.(\d+)\.(mix|mute)$/);
    if (!match || Number(match[1]) !== this.channel - 1 || !rawValue.trim()) {
      this.rejected.push(command);
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || (match[2] === 'mute' && value !== 0 && value !== 1)) {
      this.rejected.push(command);
      return;
    }
    if (match[2] === 'mute') {
      this.mute = value !== 0;
      if (this.mixerState) this.mixerState.setMute(this.channel, this.mute);
    } else {
      const db = faderValueToDB(value);
      if (value < 0 || value > 1 || !Number.isFinite(db) || db < -60 || db > 0) {
        this.rejected.push(command);
        return;
      }
      this.fader = value;
      if (this.mixerState) this.mixerState.setFader(this.channel, db);
    }
    // Echo models a device state update; it is not evidence of real mixer behavior.
    for (const client of this.server.clients) {
      if (client.readyState === 1) client.send(`3:::${command}`);
    }
  }

  async close() {
    for (const client of this.server.clients) client.terminate();
    await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }
}

export async function createUi24rServer(options) {
  return new Ui24rServer(options).listen();
}
