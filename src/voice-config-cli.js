import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVoiceConfig, saveVoiceConfig } from './voice-config.js';

const OPTIONS = Object.freeze({ '--python': 'python', '--modelo': 'model', '--dispositivo': 'device', '--canal': 'channel' });

export async function runVoiceConfigCli(args, { directory, stdout = console.log, stderr = console.error } = {}) {
  try {
    const [command, ...options] = args;
    if (command === 'show' && options.length === 0) {
      stdout(JSON.stringify(await loadVoiceConfig({ directory }), null, 2));
      return 0;
    }
    if (command !== 'set' || options.length === 0 || options.length % 2 !== 0) {
      throw new Error('Uso: node src/voice-config-cli.js show | set [--python EXECUTÁVEL] [--modelo MODELO] [--dispositivo NOME|padrao] [--canal N]');
    }
    const update = {};
    for (let i = 0; i < options.length; i += 2) {
      const option = options[i];
      const key = Object.hasOwn(OPTIONS, option) ? OPTIONS[option] : null;
      const value = options[i + 1];
      if (!key || Object.hasOwn(update, key) || !value || value.startsWith('--')) throw new Error(`Opção inválida, duplicada ou sem valor: ${option}.`);
      if (key === 'channel') {
        if (!/^[1-9]\d*$/u.test(value)) throw new Error('Canal deve ser um inteiro positivo.');
        update[key] = Number(value);
      } else update[key] = key === 'device' && value === 'padrao' ? null : value;
    }
    const current = await loadVoiceConfig({ directory });
    const config = await saveVoiceConfig({ ...current, ...update }, { directory });
    stdout(JSON.stringify(config, null, 2));
    return 0;
  } catch (error) {
    stderr(`Erro na configuração de voz: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runVoiceConfigCli(process.argv.slice(2));
}
