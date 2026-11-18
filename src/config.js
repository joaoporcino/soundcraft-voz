import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isIPv4 } from 'node:net';

const CONFIG_FILE = 'config.json';

export function validateAddress(value) {
  if (typeof value !== 'string') {
    throw new TypeError('O endereço da mesa deve ser uma string IPv4.');
  }

  const address = value.trim();
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(address);
  if (!match || !isIPv4(match[1])) {
    throw new Error('Endereço inválido. Informe um IPv4 literal, com porta opcional.');
  }
  if (match[2] !== undefined) {
    const port = Number(match[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Porta inválida. Use um valor entre 1 e 65535.');
    }
  }
  return address;
}

export function getConfigDirectory() {
  if (process.env.SOUNDCRAFT_CONFIG_DIR) return process.env.SOUNDCRAFT_CONFIG_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'soundcraft-voz');
  }
  return path.join(os.homedir(), '.config', 'soundcraft-voz');
}

function configPath(directory) {
  return path.join(directory ?? getConfigDirectory(), CONFIG_FILE);
}

export async function loadConfig({ directory } = {}) {
  const filename = configPath(directory);
  let contents;
  try {
    contents = await fs.readFile(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Não foi possível ler a configuração em ${filename}: ${error.message}`, { cause: error });
  }

  try {
    const config = JSON.parse(contents);
    if (!config || typeof config !== 'object' || Array.isArray(config) || !Object.hasOwn(config, 'ip')) {
      throw new Error('o arquivo deve conter um objeto com o campo "ip"');
    }
    return { ip: validateAddress(config.ip) };
  } catch (error) {
    throw new Error(`Configuração inválida em ${filename}: ${error.message}`, { cause: error });
  }
}

export async function saveConfig(ip, { directory } = {}) {
  const config = { ip: validateAddress(ip) };
  const target = configPath(directory);
  const parent = path.dirname(target);
  const temporary = path.join(parent, `.${CONFIG_FILE}.${process.pid}.${randomUUID()}.tmp`);
  await fs.mkdir(parent, { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new Error(`Não foi possível salvar a configuração em ${target}: ${error.message}`, { cause: error });
  }
  return config;
}
