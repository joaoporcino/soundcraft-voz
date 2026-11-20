import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { loadConfig, saveConfig, validateAddress } from './config.js';
import { prepareIpChange, runLocalServiceCli } from './local-service-cli.js';
import { runRegistryScreens } from './terminal-registry-screens.js';
import { runRegistryCommand } from './registry-cli.js';
import { selectReference } from './terminal-source-proposal.js';
import { runVoiceConfigCli } from './voice-config-cli.js';

// Presentation only: all operational decisions remain in the service and its CLI adapter.
export async function runTerminalUi({ input = stdin, output = stdout, service = runLocalServiceCli, registry,
  load = loadConfig, save = saveConfig, prepare = prepareIpChange, voiceConfig = runVoiceConfigCli } = {}) {
  const rl = createInterface({ input, crlfDelay: Infinity, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const write = text => output.write(`${text}\n`);
  const ask = async prompt => { output.write(prompt); const line = await lines.next(); return line.done ? null : line.value.trim(); };
  function screen(section, title, lines) {
    if (output.isTTY) output.write('\x1b[2J\x1b[H');
    const side = ['SOUNDCRAFT', '', `${section === 'Início' ? '>' : ' '} Início`, `${section === 'Comandos' ? '>' : ' '} Comandos`, `${section === 'Cadastros' ? '>' : ' '} Cadastros`];
    const content = [title, '─'.repeat(36), ...lines];
    for (let i = 0; i < Math.max(side.length, content.length); i++) write(`${(side[i] ?? '').padEnd(16)} | ${content[i] ?? ''}`);
    write('');
  }
  async function call(args) {
    const messages = [], errors = [];
    const code = await service(args, { stdout: message => messages.push(message), stderr: message => errors.push(message) });
    for (const message of errors) write(message);
    let result;
    if (messages.length === 1) { try { result = JSON.parse(messages[0]); } catch { /* plain text */ } }
    return { code, result, messages };
  }
  function show(response) {
    if (response.result?.service && response.result.mixer) {
      const { service: state, mixer, commands } = response.result;
      const modes = { paused: 'Pausa', passage: 'Passagem', worship: 'Culto' };
      write(`Serviço: ${state}\nMesa: ${mixer.status ?? 'desconhecido'}\nEndereço em uso: ${mixer.appliedIp ?? 'não configurado'}\nModo: ${modes[commands?.mode] ?? commands?.mode ?? 'indisponível'}`);
      if (mixer.restartRequired) write('Reinicie o serviço para aplicar a configuração.');
      write(`Sessão ativa: ${commands && Object.hasOwn(commands, 'activeSessionId') ? commands.activeSessionId ?? 'nenhuma' : 'desconhecida'}`);
      if (Array.isArray(response.result.voiceInputs)) {
        for (const voice of response.result.voiceInputs) {
          write(`Voz ${voice.inputId}: ${voice.state ?? 'desconhecido'}${voice.error ? ` — ${voice.error}` : ''}`);
          if (voice.deviceIdentity) write(`Dispositivo anterior: ${JSON.stringify(voice.deviceIdentity)}`);
          if (voice.candidateIdentity) write(`Dispositivo candidato: ${JSON.stringify(voice.candidateIdentity)} | revisão: ${voice.candidateRevision ?? 'indisponível'}`);
        }
      } else write('Diagnóstico de voz: indisponível.');
      return;
    }
    if (response.result?.status === 'proposal' && response.result.proposal) {
      const proposal = response.result.proposal;
      write(`Proposta ${response.result.id}: ação ${proposal.action}, canal ${proposal.channel}`);
      if (proposal.db !== undefined) write(`Nível calculado: ${proposal.db} dB`);
      if (proposal.points !== undefined) write(`Pontos solicitados: ${proposal.points}`);
      if (proposal.targetPoints !== undefined) write(`Resultado calculado: ${proposal.targetPoints} pontos`);
      return;
    }
    if (response.result?.status === 'sent') { write('Solicitação enviada.'); return; }
    if (response.result?.status === 'ready') { write('Reconhecimento de voz pronto.'); return; }
    if (response.result?.ok === true && response.result.state?.mode) {
      write(`Modo alterado: ${{ paused: 'Pausa', passage: 'Passagem', worship: 'Culto' }[response.result.state.mode] ?? response.result.state.mode}.`);
      return;
    }
    for (const message of response.messages) write(message);
  }
  async function requestCommand(args) {
    const response = await call(args);
    show(response);
    if (response.result?.status !== 'proposal' || typeof response.result.id !== 'string') return;
    const answer = await ask('Enviar esta proposta à mesa? Digite SIM para confirmar: ');
    if (answer?.toUpperCase() !== 'SIM') { write('Proposta não enviada.'); return; }
    const confirmed = await call(['confirmar', response.result.id]);
    show(confirmed);
    if (confirmed.result?.status === 'sent') write('Solicitação enviada à biblioteca; aplicação na mesa não foi comprovada.');
  }
  async function commandsScreen() {
    for (;;) {
      screen('Comandos', 'Comandos e serviço', ['1  Ver endereço da mesa', '2  Configurar endereço da mesa', '3  Iniciar serviço', '4  Ver estado do serviço e voz', '5  Parar serviço', '6  Escolher modo', '7  Solicitar comando por texto', '8  Iniciar reconhecimento de voz', '9  Capturar comando de voz', '10  Selecionar sessão ativa', '11  Configurar entradas e master', '12  Configurar voz principal', '13  Operar entrada identificada', '14  Aceitar dispositivo candidato', '15  Configurar voz adicional', '0  Voltar']);
      const choice = await ask('\nEscolha uma opção: ');
      if (choice === null) return false;
      if (choice === '0') return true;
      try {
        if (choice === '1') { const config = await load(); write(config ? `Endereço: ${config.ip}` : 'Nenhum endereço configurado.'); }
        else if (choice === '2') {
          const address = await ask('IP da mesa (vazio cancela): ');
          if (address === null) return false;
          if (address) { validateAddress(address); await prepare(); const config = await save(address); write(`Endereço salvo: ${config.ip}. Reinicie o serviço para aplicar.`); }
        } else if (['3', '4', '5', '8'].includes(choice)) show(await call([{ 3: 'start', 4: 'status', 5: 'stop', 8: 'voz-iniciar' }[choice]]));
        else if (choice === '6') {
          const mode = await ask('Modo: 1 Pausa | 2 Passagem | 3 Culto | 0 Voltar: ');
          if (mode === null) return false;
          if (['1', '2', '3'].includes(mode)) show(await call(['modo', { 1: 'pausa', 2: 'passagem', 3: 'culto' }[mode]]));
          else if (mode !== '0') write('Opção inválida.');
        } else if (choice === '7') {
          const command = await ask('Pedido (ex.: mesa, mute canal 3; vazio cancela): ');
          if (command === null) return false;
          if (command) await requestCommand(['texto', command]);
        } else if (choice === '9') { write('Captura manual: fale após o início da gravação.'); await requestCommand(['voz-capturar']); }
        else if (choice === '10') {
          const operation = await ask('Sessão: 1 selecionar | 2 nenhuma | 0 voltar: ');
          if (operation === null) return false;
          let sessionId;
          if (operation === '1') {
            const selected = await selectReference({ kind: 'sessao', registry: registry ?? runRegistryCommand, screen, ask, write });
            if (selected.eof) return false;
            if (selected.record) sessionId = String(selected.record.id);
          } else if (operation === '2') sessionId = 'nenhuma';
          else if (operation !== '0') write('Opção inválida.');
          if (sessionId) {
            write('Mudar sessão invalida propostas pendentes.');
            const confirm = await ask('Digite SIM para alterar: ');
            if (confirm === null) return false;
            if (confirm.toUpperCase() === 'SIM') show(await call(['sessao', sessionId]));
            else write('Alteração cancelada.');
          }
        } else if (choice === '11') {
          const inputs = await ask('Entradas de passagem separadas por vírgula (ou - para nenhuma; vazio cancela): ');
          if (inputs === null) return false;
          if (inputs) {
            const master = await ask('Entrada master (ou - para nenhuma; vazio cancela): ');
            if (master === null) return false;
            if (master) {
              write('A mudança invalida propostas pendentes; o serviço valida as entradas.');
              const confirm = await ask('Digite SIM para salvar: ');
              if (confirm === null) return false;
              if (confirm.toUpperCase() === 'SIM') show(await call(['entradas', inputs, master]));
              else write('Alteração cancelada.');
            }
          }
        } else if (choice === '12') {
          const messages = [], errors = [];
          const code = await voiceConfig(['show'], { stdout: message => messages.push(message), stderr: message => errors.push(message) });
          for (const message of [...errors, ...messages]) write(message);
          if (code === 0) {
            const field = await ask('Alterar: 1 Python | 2 modelo | 3 dispositivo | 4 canal | 0 voltar: ');
            if (field === null) return false;
            const option = { 1: '--python', 2: '--modelo', 3: '--dispositivo', 4: '--canal' }[field];
            if (option) {
              const value = await ask('Novo valor (use padrao para dispositivo padrão; vazio cancela): ');
              if (value === null) return false;
              if (value) {
                write('A configuração não verifica dispositivo físico; reinicie o serviço para aplicar.');
                const confirm = await ask('Digite SIM para salvar: ');
                if (confirm === null) return false;
                if (confirm.toUpperCase() === 'SIM') {
                  const saved = [], failures = [];
                  const result = await voiceConfig(['set', option, value], { stdout: message => saved.push(message), stderr: message => failures.push(message) });
                  for (const message of [...failures, ...saved]) write(message);
                  if (result === 0) write('Configuração salva. Reinicie o serviço para aplicar.');
                } else write('Alteração cancelada.');
              }
            } else if (field !== '0') write('Opção inválida.');
          }
        } else if (choice === '13') {
          const operation = await ask('Entrada: 1 texto | 2 iniciar voz | 3 capturar comando | 4 capturar cadastro | 0 voltar: ');
          if (operation === null) return false;
          if (['1', '2', '3', '4'].includes(operation)) {
            const inputId = await ask('Identificador da entrada (vazio cancela): ');
            if (inputId === null) return false;
            if (inputId) {
              if (operation === '1') {
                const command = await ask('Pedido por texto (vazio cancela): ');
                if (command === null) return false;
                if (command) await requestCommand(['texto-entrada', inputId, command]);
              } else if (operation === '2') show(await call(['voz-iniciar', inputId]));
              else if (operation === '3') { write('Captura manual: fale após o início da gravação.'); await requestCommand(['voz-capturar', inputId]); }
              else {
                write('Captura manual para cadastro; o resultado deve ser revisado na sessão.');
                const response = await call(['voz-cadastro', inputId]);
                for (const message of response.messages) write(message);
              }
            }
          } else if (operation !== '0') write('Opção inválida.');
        } else if (choice === '14') {
          const inputId = await ask('Identificador da entrada (vazio cancela): ');
          if (inputId === null) return false;
          if (inputId) {
            const status = await call(['status']);
            const voice = status.result?.voiceInputs?.find(item => item.inputId === inputId);
            if (!voice?.candidateIdentity || !voice.candidateRevision) { show(status); write('Nenhum dispositivo candidato disponível para esta entrada.'); }
            else {
              write(`Anterior: ${JSON.stringify(voice.deviceIdentity ?? null)}\nCandidato: ${JSON.stringify(voice.candidateIdentity)}\nRevisão: ${voice.candidateRevision}`);
              write('Confira os dispositivos antes de aceitar. A operação não inicia captura.');
              const confirm = await ask('Digite SIM para aceitar esta revisão: ');
              if (confirm === null) return false;
              if (confirm.toUpperCase() === 'SIM') show(await call(['voz-aceitar-dispositivo', voice.candidateRevision, inputId]));
              else write('Aceite cancelado.');
            }
          }
        } else if (choice === '15') {
          const listed = await call(['voz-entrada', 'listar']);
          show(listed);
          if (listed.code === 0) {
            const operation = await ask('Voz adicional: 1 definir | 2 remover | 0 voltar: ');
            if (operation === null) return false;
            if (['1', '2'].includes(operation)) {
              const inputId = await ask('Identificador da entrada (vazio cancela): ');
              if (inputId === null) return false;
              if (inputId) {
                let args = ['voz-entrada', 'remover', inputId];
                if (operation === '1') {
                  const device = await ask('Dispositivo (nome/índice ou - para padrão; vazio cancela): ');
                  if (device === null) return false;
                  if (!device) continue;
                  const channel = await ask('Canal de áudio (vazio cancela): ');
                  if (channel === null) return false;
                  if (!channel) continue;
                  args = ['voz-entrada', 'definir', inputId, device, channel];
                }
                write('A configuração não valida dispositivo físico e não tem revisão transacional entre processos. Reinicie o serviço para aplicar.');
                const confirm = await ask('Digite SIM para alterar: ');
                if (confirm === null) return false;
                if (confirm.toUpperCase() === 'SIM') show(await call(args));
                else write('Alteração cancelada.');
              }
            } else if (operation !== '0') write('Opção inválida.');
          }
        }
        else write('Opção inválida.');
      } catch (error) { write(`Erro: ${error.message}`); }
      if (await ask('\nEnter para voltar ao menu: ') === null) return false;
    }
  }
  try {
    for (;;) {
      screen('Início', 'Painel principal', ['1  Comandos e serviço', '2  Cadastros e registros', '0  Sair']);
      const choice = await ask('Escolha uma opção: ');
      if (choice === null || choice === '0') break;
      if (choice === '1' && !await commandsScreen()) break;
      if (choice === '2' && !await runRegistryScreens({ screen, ask, write, registry })) break;
    }
  } finally { rl.close(); }
  write('Painel encerrado. O serviço continua no estado em que foi deixado.');
}
