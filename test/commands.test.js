import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseCommand } from '../src/commands.js';

test('interpreta ações e canais em português', () => {
  assert.deepEqual(parseCommand('Mute o canal três.'), { action: 'mute', channel: 3 });
  assert.deepEqual(parseCommand('Desmutar canal vinte e quatro'), { action: 'unmute', channel: 24 });
  assert.deepEqual(parseCommand('Ajustar canal 2 para menos 6 dB'), { action: 'level', channel: 2, db: -6 });
});
test('recusa canais, níveis e frases fora do escopo', () => {
  for (const text of ['mute canal 25', 'mute canal zero', 'ajustar canal 1 para 6 db', 'mute canal 1 e canal 2', 'ligar phantom canal 1']) assert.throws(() => parseCommand(text));
});
