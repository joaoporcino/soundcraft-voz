import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfigDirectory } from './config.js';
import { openRegistry } from './registry.js';
import { parsePhysicalRegistryCommand } from './physical-registry-cli.js';
import { parseSoundcheckCommand } from './soundcheck-cli.js';
import { parseTeamsCommand } from './teams-cli.js';

const HELP = `Cadastro local — comandos:
  pessoa adicionar NOME
  pessoa listar
  equipamento adicionar NOME TIPO [COR] [--sem-fio|--com-fio] [--capsula TIPO] [--modelo MODELO]
  equipamento listar [COR]
  sessao criar NOME
  sessao listar
  grupo adicionar NOME | listar
  papel adicionar NOME | listar
  grupo-integrante adicionar|remover GRUPO PESSOA | listar GRUPO
  grupo-funcao adicionar|remover GRUPO PESSOA PAPEL
  sessao-grupo adicionar|remover SESSAO GRUPO
  sessao-integrante adicionar|remover SESSAO GRUPO PESSOA
  sessao-papel adicionar|remover SESSAO GRUPO PESSOA PAPEL
  formacao mostrar SESSAO
  vinculo propor SESSAO_ID PESSOA_ID EQUIPAMENTO_ID [CANAL]
  vinculo confirmar ID
  vinculo listar SESSAO_ID
  entrada-fonte vincular SESSAO_ID ENTRADA VINCULO_ID
  entrada-fonte listar SESSAO_ID | remover SESSAO_ID ENTRADA
  aux-config mostrar
  aux-config definir QUANTIDADE
  retorno adicionar SESSAO_ID AUX
  retorno listar SESSAO_ID
  retorno-vinculo propor SESSAO_ID PESSOA_ID RETORNO_ID
  retorno-vinculo listar SESSAO_ID
  retorno-vinculo confirmar ID
  retorno-vinculo rejeitar ID
  retorno-vinculo revogar ID
  fisico-dispositivo adicionar NOME TIPO | listar
  fisico-ponto adicionar TIPO ETIQUETA [--direcao input|output|bidirectional|unknown] [--dispositivo ID] [--equipamento ID] [--pessoa ID] [--retorno ID] [--canal N] | listar
  fisico-ligacao propor SESSAO ORIGEM DESTINO|desconhecido TIPO
  fisico-ligacao listar SESSAO | confirmar ID ORIGEM | rejeitar ID | revogar ID
  fisico-caminho consultar SESSAO PONTO
  voz-vinculo propor SESSAO ORIGEM "FRASE" | listar SESSAO
  voz-vinculo corrigir ID PESSOA|desconhecido EQUIPAMENTO|desconhecido CANAL|desconhecido
  voz-vinculo confirmar ID | rejeitar ID
  passagem mostrar SESSAO | confirmar SESSAO TIPO ID REVISAO [ORIGEM]
  passagem rejeitar SESSAO TIPO ID | corrigir SESSAO vinculo|voz ID PESSOA EQUIPAMENTO CANAL
  passagem corrigir SESSAO pessoa ID REVISAO NOME
  passagem corrigir SESSAO equipamento ID REVISAO NOME TIPO COR|desconhecido sim|nao|desconhecido CAPSULA|desconhecido MODELO|desconhecido
  passagem substituir SESSAO vinculo ID REVISAO_SUBSTITUICAO PESSOA EQUIPAMENTO CANAL|desconhecido
  ajuda

Use aspas do shell para nomes com espaços. IDs são números inteiros positivos.`;

function fail(message) {
  throw new Error(message);
}

function requireCount(args, min, max, usage) {
  if (args.length < min || args.length > max) fail(`Uso: ${usage}`);
}

function parseId(value, label) {
  if (!/^\d+$/.test(value ?? '')) fail(`${label} deve ser um inteiro positivo.`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail(`${label} deve ser um inteiro positivo válido.`);
  return id;
}

function parseChannel(value) {
  if (!/^\d+$/.test(value ?? '')) fail('Canal deve ser um inteiro entre 1 e 24.');
  const channel = Number(value);
  if (!Number.isInteger(channel) || channel < 1 || channel > 24) fail('Canal deve ser um inteiro entre 1 e 24.');
  return channel;
}

function parseEquipmentArguments(values) {
  const [name, kind, ...rest] = values;
  let color = null;
  let wireless = null;
  let capsule = null;
  let model = null;
  const seen = new Set();
  let index = 0;

  if (rest[0] !== undefined && !rest[0].startsWith('--')) {
    color = rest[0];
    index = 1;
  }
  while (index < rest.length) {
    const option = rest[index];
    if (option === '--sem-fio' || option === '--com-fio') {
      if (seen.has('wireless')) fail('Use apenas uma opção entre --sem-fio e --com-fio.');
      seen.add('wireless');
      wireless = option === '--sem-fio';
      index += 1;
    } else if (option === '--capsula' || option === '--modelo') {
      const key = option === '--capsula' ? 'capsule' : 'model';
      if (seen.has(key)) fail(`A opção ${option} pode ser informada uma única vez.`);
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) fail(`Informe um valor após ${option}.`);
      seen.add(key);
      if (key === 'capsule') capsule = value;
      else model = value;
      index += 2;
    } else {
      fail(`Opção inválida para equipamento: ${option}. Use "ajuda" para ver os comandos.`);
    }
  }

  return { name, kind, color, wireless, capsule, model };
}

function printRecord(output, value, message) {
  if (message) output(message);
  output(JSON.stringify(value, null, 2));
}

export async function runRegistryCommand(args, { directory = getConfigDirectory(), output = console.log } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    fail('Os argumentos do cadastro devem ser uma lista de textos.');
  }
  const [category, action, ...values] = args;
  if (!category || category === 'ajuda' || (category === 'ajuda' && args.length === 1)) {
    output(HELP);
    return;
  }

  if (category.startsWith('fisico-') || category === 'voz-vinculo' || category === 'passagem' ||
      ['grupo', 'papel', 'grupo-integrante', 'grupo-funcao', 'sessao-grupo', 'sessao-integrante', 'sessao-papel', 'formacao'].includes(category)) {
    const execute = category === 'passagem' ? parseSoundcheckCommand(args)
      : category.startsWith('fisico-') || category === 'voz-vinculo' ? parsePhysicalRegistryCommand(args) : parseTeamsCommand(args);
    await mkdir(directory, { recursive: true });
    const registry = openRegistry(path.join(directory, 'cadastros.sqlite'));
    try { printRecord(output, await execute(registry)); }
    finally { registry.close(); }
    return;
  }

  if (category === 'entrada-fonte') {
    if (action === 'vincular') requireCount(values, 3, 3, 'entrada-fonte vincular SESSAO_ID ENTRADA VINCULO_ID');
    else if (action === 'listar') requireCount(values, 1, 1, 'entrada-fonte listar SESSAO_ID');
    else if (action === 'remover') requireCount(values, 2, 2, 'entrada-fonte remover SESSAO_ID ENTRADA');
    else fail('Comando entrada-fonte desconhecido.');
    const sessionId = parseId(values[0], 'ID da sessão');
    const assignmentId = action === 'vincular' ? parseId(values[2], 'ID do vínculo') : undefined;
    await mkdir(directory, { recursive: true });
    const registry = openRegistry(path.join(directory, 'cadastros.sqlite'));
    try {
      const result = action === 'vincular' ? registry.bindInputSource({ sessionId, inputId: values[1], assignmentId })
        : action === 'remover' ? registry.unbindInputSource({ sessionId, inputId: values[1] })
          : registry.listInputSources(sessionId);
      printRecord(output, result);
    } finally { registry.close(); }
    return;
  }

  const usage = `${category} ${action ?? ''}`.trim();
  if (category === 'pessoa' && action === 'adicionar') requireCount(values, 1, 1, 'pessoa adicionar NOME');
  else if (category === 'pessoa' && action === 'listar') requireCount(values, 0, 0, 'pessoa listar');
  else if (category === 'equipamento' && action === 'adicionar') requireCount(values, 2, 10, 'equipamento adicionar NOME TIPO [COR] [--sem-fio|--com-fio] [--capsula TIPO] [--modelo MODELO]');
  else if (category === 'equipamento' && action === 'listar') requireCount(values, 0, 1, 'equipamento listar [COR]');
  else if (category === 'sessao' && action === 'criar') requireCount(values, 1, 1, 'sessao criar NOME');
  else if (category === 'sessao' && action === 'listar') requireCount(values, 0, 0, 'sessao listar');
  else if (category === 'vinculo' && action === 'propor') requireCount(values, 3, 4, 'vinculo propor SESSAO_ID PESSOA_ID EQUIPAMENTO_ID [CANAL]');
  else if (category === 'vinculo' && action === 'confirmar') requireCount(values, 1, 1, 'vinculo confirmar ID');
  else if (category === 'vinculo' && action === 'listar') requireCount(values, 1, 1, 'vinculo listar SESSAO_ID');
  else if (category === 'aux-config' && action === 'mostrar') requireCount(values, 0, 0, 'aux-config mostrar');
  else if (category === 'aux-config' && action === 'definir') requireCount(values, 1, 1, 'aux-config definir QUANTIDADE');
  else if (category === 'retorno' && action === 'adicionar') requireCount(values, 2, 2, 'retorno adicionar SESSAO_ID AUX');
  else if (category === 'retorno' && action === 'listar') requireCount(values, 1, 1, 'retorno listar SESSAO_ID');
  else if (category === 'retorno-vinculo' && action === 'propor') requireCount(values, 3, 3, 'retorno-vinculo propor SESSAO_ID PESSOA_ID RETORNO_ID');
  else if (category === 'retorno-vinculo' && ['listar', 'confirmar', 'rejeitar', 'revogar'].includes(action)) requireCount(values, 1, 1, `retorno-vinculo ${action} ID`);
  else fail(`Comando desconhecido: ${usage}. Use "ajuda" para ver os comandos.`);

  let assignmentInput;
  let assignmentId;
  let sessionId;
  let equipmentInput;
  let monitorInput;
  let monitorId;
  let monitorSessionId;
  let auxCount;
  if (category === 'aux-config' && action === 'definir') auxCount = parseId(values[0], 'Quantidade de AUX');
  if (category === 'retorno' && action === 'adicionar') {
    monitorInput = { sessionId: parseId(values[0], 'ID da sessão'), aux: parseId(values[1], 'AUX') };
  } else if (category === 'retorno-vinculo' && action === 'propor') {
    monitorInput = { sessionId: parseId(values[0], 'ID da sessão'), personId: parseId(values[1], 'ID da pessoa'), returnId: parseId(values[2], 'ID do retorno') };
  } else if ((category === 'retorno' || category === 'retorno-vinculo') && action === 'listar') {
    monitorSessionId = parseId(values[0], 'ID da sessão');
  } else if (category === 'retorno-vinculo') {
    monitorId = parseId(values[0], 'ID do vínculo de retorno');
  }
  if (category === 'equipamento' && action === 'adicionar') equipmentInput = parseEquipmentArguments(values);
  if (category === 'vinculo' && action === 'propor') {
    assignmentInput = {
      sessionId: parseId(values[0], 'ID da sessão'),
      personId: parseId(values[1], 'ID da pessoa'),
      equipmentId: parseId(values[2], 'ID do equipamento'),
      ...(values[3] === undefined ? {} : { channel: parseChannel(values[3]) }),
    };
  } else if (category === 'vinculo' && action === 'confirmar') {
    assignmentId = parseId(values[0], 'ID do vínculo');
  } else if (category === 'vinculo' && action === 'listar') {
    sessionId = parseId(values[0], 'ID da sessão');
  }

  await mkdir(directory, { recursive: true });
  const registry = await openRegistry(path.join(directory, 'cadastros.sqlite'));
  try {
    let result;
    let message;
    if (category === 'pessoa' && action === 'adicionar') {
      result = await registry.addPerson(values[0]);
      message = 'Pessoa cadastrada:';
    } else if (category === 'pessoa' && action === 'listar') {
      result = await registry.listPeople();
    } else if (category === 'equipamento' && action === 'adicionar') {
      result = await registry.addEquipment(equipmentInput);
      message = 'Equipamento cadastrado:';
    } else if (category === 'equipamento' && action === 'listar') {
      result = await registry.listEquipment(values[0] ? { color: values[0] } : undefined);
    } else if (category === 'sessao' && action === 'criar') {
      result = await registry.createSession(values[0]);
      message = 'Sessão criada:';
    } else if (category === 'sessao' && action === 'listar') {
      result = await registry.listSessions();
    } else if (category === 'vinculo' && action === 'propor') {
      result = await registry.proposeAssignment(assignmentInput);
      message = 'Vínculo proposto:';
    } else if (category === 'vinculo' && action === 'confirmar') {
      result = await registry.confirmAssignment(assignmentId);
      message = 'Vínculo confirmado:';
    } else if (category === 'aux-config' && action === 'mostrar') {
      result = registry.getAuxConfig();
    } else if (category === 'aux-config' && action === 'definir') {
      result = registry.setAuxConfig(auxCount);
      message = 'Quantidade de AUX configurada:';
    } else if (category === 'retorno' && action === 'adicionar') {
      result = registry.addMonitorReturn(monitorInput);
      message = 'Retorno cadastrado:';
    } else if (category === 'retorno' && action === 'listar') {
      result = registry.listMonitorReturns(monitorSessionId);
    } else if (category === 'retorno-vinculo' && action === 'propor') {
      result = registry.proposeMonitorAssignment(monitorInput);
      message = 'Vínculo de retorno proposto:';
    } else if (category === 'retorno-vinculo' && action === 'confirmar') {
      result = registry.confirmMonitorAssignment(monitorId);
      message = 'Vínculo de retorno confirmado:';
    } else if (category === 'retorno-vinculo' && action === 'rejeitar') {
      result = registry.rejectMonitorAssignment(monitorId);
      message = 'Vínculo de retorno rejeitado:';
    } else if (category === 'retorno-vinculo' && action === 'revogar') {
      result = registry.revokeMonitorAssignment(monitorId);
      message = 'Vínculo de retorno revogado:';
    } else if (category === 'retorno-vinculo' && action === 'listar') {
      result = registry.listMonitorAssignments(monitorSessionId);
    } else {
      result = await registry.listAssignments(sessionId);
    }
    printRecord(output, result, message);
  } finally {
    await registry.close();
  }
}

export { HELP as REGISTRY_CLI_HELP };
