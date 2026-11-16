import { EventEmitter } from 'node:events';

const CHANNEL_COUNT = 24;
const MIN_FADER_DB = -60;
const MAX_FADER_DB = 0;

function validateChannel(channel) {
  if (!Number.isInteger(channel) || channel < 1 || channel > CHANNEL_COUNT) {
    throw new RangeError(`Canal deve ser um inteiro entre 1 e ${CHANNEL_COUNT}.`);
  }
}

function copyChannel(state) {
  return { channel: state.channel, mute: state.mute, faderDb: state.faderDb };
}

/** Estado em memória para testes; não se conecta nem envia comandos à mesa. */
export class MixerState extends EventEmitter {
  #channels;

  constructor() {
    super();
    this.#channels = Array.from({ length: CHANNEL_COUNT }, (_, index) => ({
      channel: index + 1,
      mute: false,
      faderDb: 0,
    }));
  }

  getChannel(channel) {
    validateChannel(channel);
    return copyChannel(this.#channels[channel - 1]);
  }

  setMute(channel, mute) {
    validateChannel(channel);
    if (typeof mute !== 'boolean') throw new TypeError('Mute deve ser booleano.');
    return this.#change(channel, 'mute', mute);
  }

  setFader(channel, faderDb) {
    validateChannel(channel);
    if (typeof faderDb !== 'number' || !Number.isFinite(faderDb)) {
      throw new TypeError('Fader deve ser um número finito em dB.');
    }
    if (faderDb < MIN_FADER_DB || faderDb > MAX_FADER_DB) {
      throw new RangeError(`Fader deve estar entre ${MIN_FADER_DB} e ${MAX_FADER_DB} dB.`);
    }
    return this.#change(channel, 'faderDb', faderDb);
  }

  snapshot() {
    return { channels: this.#channels.map(copyChannel) };
  }

  #change(channel, property, value) {
    const state = this.#channels[channel - 1];
    const previousValue = state[property];
    if (previousValue === value) return copyChannel(state);
    state[property] = value;
    const event = { channel, property, value, previousValue };
    this.emit('change', { ...event });
    this.emit(`${property}Changed`, { ...event });
    return copyChannel(state);
  }
}

export { CHANNEL_COUNT, MIN_FADER_DB, MAX_FADER_DB };
