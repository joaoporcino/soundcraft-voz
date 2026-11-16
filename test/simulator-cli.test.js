import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { MixerState } from '../src/simulator/mixer-state.js';
import { parseSimulatorCommand, runSimulatorCli } from '../src/simulator/cli.js';

test('interpreta comandos válidos e rejeita formatos ambíguos', () => {
  assert.deepEqual(parseSimulatorCommand('fader 12 -6.5'), { command: 'fader', channel: 12, db: -6.5 });
  assert.deepEqual(parseSimulatorCommand(' mute 2 '), { command: 'mute', channel: 2 });
  assert.deepEqual(parseSimulatorCommand('lista'), { command: 'lista' });
  assert.deepEqual(parseSimulatorCommand('fader 2 -6 dB'), { command: 'fader', channel: 2, db: -6 });
  assert.deepEqual(parseSimulatorCommand('canal 1.5'), { command: 'invalid' });
  assert.equal(parseSimulatorCommand('  '), null);
});

test('terminal controla o MixerState, mostra 24 canais e reflete alterações externas', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const state = new MixerState();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk.toString()));
  let closed = false;
  const cli = runSimulatorCli({
    input,
    output,
    state,
    onSigint: false,
    serverFactory: async () => ({ targetIP: '127.0.0.1:45678', close: async () => { closed = true; } }),
  });

  input.write('lista\ncanal 24\nmute 2\nfader 2 -12.5\ndesmute 2\nmute 25\n');
  state.setFader(3, -8);
  input.write('sair\n');
  await cli;

  const transcript = chunks.join('');
  assert.equal(state.getChannel(2).mute, false);
  assert.equal(state.getChannel(2).faderDb, -12.5);
  assert.match(transcript, /SIMULAÇÃO/);
  assert.match(transcript, /127\.0\.0\.1:45678/);
  assert.match(transcript, /Canal 24 \| aberto \| fader 0 dB/);
  assert.match(transcript, /Canal 03 \| aberto \| fader -8 dB/);
  assert.match(transcript, /inteiro entre 1 e 24/);
  assert.equal(closed, true);
});

test('EOF encerra servidor mesmo sem comando sair', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let closed = false;
  const cli = runSimulatorCli({
    input,
    output,
    onSigint: false,
    serverFactory: async () => ({ targetIP: '127.0.0.1:45679', close: async () => { closed = true; } }),
  });
  input.end();
  await cli;
  assert.equal(closed, true);
});
