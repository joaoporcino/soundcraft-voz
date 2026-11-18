/** Tracks only supported values received from the current connection. */
export function createMixerObservation({ now = () => new Date() } = {}) {
  let connected = false;
  let channels = {};
  let revision = 0;
  let faderRevisions = {};

  function reset(isConnected) {
    connected = isConnected === true;
    channels = {};
    faderRevisions = {};
    revision += 1;
  }

  function receive(message) {
    if (!connected || typeof message !== 'string') return;
    const match = /^SETD\^i\.(\d{1,2})\.(mute|mix)\^([^^]+)$/.exec(message);
    if (!match) return;
    const index = Number(match[1]);
    const raw = match[3];
    if (index < 0 || index > 23 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || (match[2] === 'mute' ? value !== 0 && value !== 1 : value < 0 || value > 1)) return;
    const channel = String(index + 1);
    const property = match[2] === 'mix' ? 'faderLinear' : 'mute';
    const observedAt = now().toISOString();
    channels[channel] ??= {};
    channels[channel][property] = { value: property === 'mute' ? value === 1 : value, observedAt };
    if (property === 'faderLinear') faderRevisions[channel] = ++revision;
  }

  function getFader(channel) {
    const id = String(channel);
    const value = channels[id]?.faderLinear;
    return connected && value ? { ...value, revision: faderRevisions[id] } : null;
  }

  function invalidateFader(channel) {
    const id = String(channel);
    if (channels[id]) delete channels[id].faderLinear;
    delete faderRevisions[id];
    revision += 1;
  }

  function snapshot() {
    return { connected, channels: Object.fromEntries(Object.entries(channels).map(([id, values]) => [id,
      Object.fromEntries(Object.entries(values).map(([name, data]) => [name, { ...data }]))])) };
  }
  return Object.freeze({ reset, receive, snapshot, getFader, invalidateFader });
}
