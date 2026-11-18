import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateModeConfig } from './mode-policy.js';

export const MODE_CONFIG_FILE = 'mode-config.json';
export const DEFAULT_MODE_CONFIG = Object.freeze({ passageInputs: Object.freeze(['principal']), masterInputId: null });

export async function loadModeConfig({ directory } = {}) {
  const filename = path.join(directory, MODE_CONFIG_FILE);
  try { return validateModeConfig(JSON.parse(await fs.readFile(filename, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return validateModeConfig(DEFAULT_MODE_CONFIG);
    throw new Error(`Configuração de modos inválida: ${error.message}`, { cause: error });
  }
}

export async function saveModeConfig(value, { directory } = {}) {
  const config = validateModeConfig(value);
  const target = path.join(directory, MODE_CONFIG_FILE);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return config;
}
