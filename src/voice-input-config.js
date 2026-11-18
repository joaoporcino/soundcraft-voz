import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateVoiceConfig } from './voice-config.js';

export const VOICE_INPUT_FILE = 'voice-inputs.json';
export function validateVoiceInputs(value) {
  if (!Array.isArray(value) || value.length > 3) throw new Error('Configure no máximo três entradas adicionais.');
  const seen = new Set(['principal']);
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== 'channel,device,inputId') throw new Error('Configuração de entrada inválida.');
    const { inputId, device, channel } = item;
    if (typeof inputId !== 'string' || !inputId || inputId !== inputId.trim() || inputId.length > 200 || [...inputId].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || seen.has(inputId)) throw new Error('Identificador de entrada inválido ou duplicado.');
    seen.add(inputId);
    validateVoiceConfig({ python: 'python', model: 'small', device, channel });
    return { inputId, device, channel };
  });
}
export async function loadVoiceInputs({ directory } = {}) {
  try { return validateVoiceInputs(JSON.parse(await fs.readFile(path.join(directory, VOICE_INPUT_FILE), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return []; throw new Error(`Configuração de entradas de voz inválida: ${error.message}`, { cause: error }); }
}
export async function saveVoiceInputs(value, { directory } = {}) {
  const config = validateVoiceInputs(value);
  const target = path.join(directory, VOICE_INPUT_FILE);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, target);
  } catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
  return config;
}
