import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfigDirectory } from './config.js';

const FILE = 'voice-config.json';
export const DEFAULT_VOICE_CONFIG = Object.freeze({ python: 'python', model: 'small', device: null, channel: 1 });

// Configurações podem ser restauradas em outro sistema; existência e uso do
// executável/modelo devem ser verificados no destino, nunca durante o backup.
const isAbsolutePath = value => path.posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\[^\\]+\\[^\\]+/u.test(value);

function nonempty(value, name) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 1024 ||
      [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`${name} inválido.`);
  }
  return value;
}

export function validateVoiceConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'channel,device,model,python') throw new Error('Configuração de voz deve conter apenas python, model, device e channel.');
  const python = nonempty(value.python, 'Python');
  if (!isAbsolutePath(python) && !/^[\w][\w.-]*$/u.test(python)) throw new Error('Python deve ser um nome de executável simples ou caminho absoluto.');
  const model = nonempty(value.model, 'Modelo');
  if (!isAbsolutePath(model) && (!/^[\w.-]+(?:\/[\w.-]+)?$/u.test(model) || model.split('/').some(part => part === '.' || part === '..' || part.startsWith('-')))) {
    throw new Error('Modelo deve ser um identificador ou caminho absoluto.');
  }
  const device = value.device === null ? null : nonempty(value.device, 'Dispositivo');
  if (device?.startsWith('-')) throw new Error('Dispositivo inválido.');
  if (!Number.isSafeInteger(value.channel) || value.channel < 1 || value.channel > 256) throw new Error('Canal deve ser um inteiro entre 1 e 256.');
  return { python, model, device, channel: value.channel };
}

export async function loadVoiceConfig({ directory = getConfigDirectory() } = {}) {
  const filename = path.join(directory, FILE);
  let data;
  try { data = await fs.readFile(filename, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_VOICE_CONFIG };
    throw new Error(`Não foi possível ler configuração de voz: ${error.message}`, { cause: error });
  }
  try { return validateVoiceConfig(JSON.parse(data)); }
  catch (error) { throw new Error(`Configuração de voz inválida em ${filename}: ${error.message}`, { cause: error }); }
}

export async function saveVoiceConfig(value, { directory = getConfigDirectory() } = {}) {
  const config = validateVoiceConfig(value);
  const target = path.join(directory, FILE);
  const temporary = path.join(directory, `.${FILE}.${process.pid}.${randomUUID()}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new Error(`Não foi possível salvar configuração de voz: ${error.message}`, { cause: error });
  }
  return config;
}
