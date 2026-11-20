import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { runTerminalUi } from '../src/terminal-ui.js';
import { runRegistryCommand } from '../src/registry-cli.js';
import { TERMINAL_CATALOG_VERSION, terminalCatalog } from '../src/terminal-catalog.js';
import { changeTeamRole } from '../src/terminal-team-members.js';
import { createPhysicalPoint } from '../src/terminal-physical-points.js';
import { runVoiceConfigCli } from '../src/voice-config-cli.js';
import { loadVoiceConfig } from '../src/voice-config.js';
import { runLocalServiceCli } from '../src/local-service-cli.js';
import { loadVoiceInputs } from '../src/voice-input-config.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function run(script, service, registry, voiceConfig) {
  let output = '';
  const stream = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
  await runTerminalUi({ input: Readable.from([script]), output: stream, service, registry, voiceConfig });
  return output;
}

test('menu apresenta proposta e só confirma com SIM explícito', async () => {
  const calls = [];
  const service = async (args, { stdout }) => {
    calls.push(args);
    stdout(JSON.stringify(args[0] === 'texto' ? { status: 'proposal', id: 'abc', proposal: { action: 'mute', channel: 3 } } : { status: 'sent', confirmed: false }));
    return 0;
  };
  const output = await run('1\n7\nmesa, mute canal 3\nSIM\n\n0\n0\n', service);
  assert.deepEqual(calls, [['texto', 'mesa, mute canal 3'], ['confirmar', 'abc']]);
  assert.match(output, /ação mute, canal 3/);
  assert.match(output, /aplicação na mesa não foi comprovada/);
});

test('recusa e fim da entrada não confirmam proposta', async () => {
  for (const script of ['1\n7\nmesa, mute canal 3\nnão\n\n0\n0\n', '1\n7\nmesa, mute canal 3\n']) {
    const calls = [];
    await run(script, async (args, { stdout }) => { calls.push(args); stdout(JSON.stringify({ status: 'proposal', id: 'abc', proposal: { action: 'mute', channel: 3 } })); return 0; });
    assert.deepEqual(calls, [['texto', 'mesa, mute canal 3']]);
  }
});

test('menu encaminha modo, informa erro e continua', async () => {
  const calls = [];
  const output = await run('1\n6\n2\n\n4\n\n0\n0\n', async (args, { stderr }) => { calls.push(args); stderr('Serviço indisponível'); return 1; });
  assert.deepEqual(calls, [['modo', 'passagem'], ['status']]);
  assert.match(output, /Serviço indisponível/);
  assert.match(output, /Painel encerrado/);
});

test('menu seleciona sessão, configura entradas e mostra diagnóstico sem capturar', async () => {
  const calls = [];
  const registry = async (args, { output }) => output(JSON.stringify([{ id: 3, name: 'Ensaio' }]));
  const service = async (args, { stdout }) => {
    calls.push(args);
    stdout(JSON.stringify(args[0] === 'status' ? { service: 'ativo', mixer: { status: 'desconhecida', appliedIp: null, restartRequired: true },
      commands: { mode: 'paused', activeSessionId: 3 }, voiceInputs: [{ inputId: 'principal', state: 'failed', error: 'dispositivo ausente', candidateIdentity: ['Mic', 2], candidateRevision: 'rev' }] } : { ok: true }));
    return 0;
  };
  const output = await run('1\n10\n1\n1\nNÃO\n\n10\n1\n1\nSIM\n\n11\nprincipal,outra\nprincipal\nSIM\n\n4\n\n0\n0\n', service, registry);
  assert.deepEqual(calls, [['sessao', '3'], ['entradas', 'principal,outra', 'principal'], ['status']]);
  assert.match(output, /Alteração cancelada/);
  assert.match(output, /Reinicie o serviço/);
  assert.match(output, /dispositivo ausente/);
  assert.match(output, /Dispositivo candidato/);
});

test('configuração principal de voz encaminha alteração explícita e informa falha', async () => {
  const calls = [];
  const voiceConfig = async (args, { stdout, stderr }) => {
    calls.push(args);
    if (args[0] === 'show') { stdout('{"model":"small"}'); return 0; }
    stderr('Valor inválido'); return 1;
  };
  const output = await run('1\n12\n2\nbase\nNÃO\n\n12\n4\n999\nSIM\n\n0\n0\n', undefined, undefined, voiceConfig);
  assert.deepEqual(calls, [['show'], ['show'], ['set', '--canal', '999']]);
  assert.match(output, /Alteração cancelada/);
  assert.match(output, /Valor inválido/);
  assert.doesNotMatch(output, /Configuração salva/);
});

test('configuração principal de voz persiste alteração parcial por adaptador real', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-menu-'));
  try {
    const voiceConfig = (args, options) => runVoiceConfigCli(args, { ...options, directory });
    const output = await run('1\n12\n2\nbase\nSIM\n\n0\n0\n', undefined, undefined, voiceConfig);
    assert.match(output, /Configuração salva. Reinicie o serviço/);
    const config = await loadVoiceConfig({ directory });
    assert.equal(config.model, 'base');
    assert.equal(config.channel, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('entrada identificada separa proposta de mesa, cadastro e aceite de dispositivo', async () => {
  const calls = [];
  const service = async (args, { stdout }) => {
    calls.push(args);
    if (args[0] === 'texto-entrada') stdout(JSON.stringify({ status: 'proposal', id: 'abc', proposal: { action: 'mute', channel: 3 } }));
    else if (args[0] === 'voz-cadastro') stdout(JSON.stringify({ status: 'proposal', proposal: { id: 9 }, reviewCommand: 'passagem mostrar 1' }));
    else if (args[0] === 'status') stdout(JSON.stringify({ service: 'ativo', mixer: { status: 'conectada' }, voiceInputs: [{ inputId: 'outra', state: 'failed', deviceIdentity: ['antigo'], candidateIdentity: ['novo'], candidateRevision: 'rev1' }] }));
    else if (args[0] === 'voz-aceitar-dispositivo') stdout(JSON.stringify({ status: 'failed', message: 'revisão antiga' }));
    else stdout(JSON.stringify({ status: 'sent' }));
    return 0;
  };
  const output = await run('1\n13\n1\noutra\nmesa, mute canal 3\nSIM\n\n13\n4\noutra\n\n14\noutra\nSIM\n\n0\n0\n', service);
  assert.deepEqual(calls, [['texto-entrada', 'outra', 'mesa, mute canal 3'], ['confirmar', 'abc'], ['voz-cadastro', 'outra'], ['status'], ['voz-aceitar-dispositivo', 'rev1', 'outra']]);
  assert.match(output, /passagem mostrar 1/);
  assert.match(output, /revisão antiga/);
  assert.match(output, /não inicia captura/);
});

test('aceite sem candidato e cancelamento não iniciam voz', async () => {
  const calls = [];
  const service = async (args, { stdout }) => { calls.push(args); stdout(JSON.stringify({ service: 'ativo', mixer: { status: 'desconhecida' }, voiceInputs: [] })); return 0; };
  const output = await run('1\n14\noutra\n\n13\n2\n\n\n0\n0\n', service);
  assert.deepEqual(calls, [['status']]);
  assert.match(output, /Nenhum dispositivo candidato/);
});

test('configuração de voz adicional exige confirmação e encaminha sem iniciar worker', async () => {
  const calls = [];
  const service = async (args, { stdout, stderr }) => {
    calls.push(args);
    if (args[1] === 'listar') { stdout('[]'); return 0; }
    stderr('Entrada inválida'); return 1;
  };
  const output = await run('1\n15\n1\noutra\n-\n2\nNÃO\n\n15\n1\noutra\n-\n2\nSIM\n\n0\n0\n', service);
  assert.deepEqual(calls, [['voz-entrada', 'listar'], ['voz-entrada', 'listar'], ['voz-entrada', 'definir', 'outra', '-', '2']]);
  assert.match(output, /Alteração cancelada/);
  assert.match(output, /Entrada inválida/);
  assert.match(output, /Reinicie o serviço/);
});

test('configuração adicional persiste pelo CLI em diretório temporário', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-extra-voice-ui-'));
  try {
    const service = (args, options) => runLocalServiceCli(args, { ...options, directory });
    const output = await run('1\n15\n1\noutra\n-\n2\nSIM\n\n0\n0\n', service);
    assert.match(output, /Configuração salva; reinicie o serviço/);
    const records = await loadVoiceInputs({ directory });
    assert.equal(records[0].inputId, 'outra');
    assert.equal(records[0].channel, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('telas de cadastro exibem registros e relações da sessão escolhida', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (let i = 1; i <= 9; i++) await registry(['pessoa', 'adicionar', `Pessoa ${i}`], { output: () => {} });
    await registry(['sessao', 'criar', 'Ensaio'], { output: () => {} });
    await registry(['equipamento', 'adicionar', 'Microfone', 'microfone'], { output: () => {} });
    await registry(['vinculo', 'propor', '1', '1', '1', '3'], { output: () => {} });
    const output = await run('2\n1\np\n9\n0\n0\n3\n1\n1\n2\n1\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Página 2 de 2/);
    assert.match(output, /Nome: Pessoa 9/);
    assert.match(output, /Sessões - detalhe/);
    assert.match(output, /Vínculos de fontes - detalhe/);
    assert.match(output, /Canal: 3/);
    assert.match(output, /Estado: proposto/);
    const auxiliary = await run('2\n8\n1\n0\n0\n0\n0\n', undefined, registry);
    assert.match(auxiliary, /Configuração de AUX - detalhe/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cadastro mostra lista vazia e falha sem executar comandos', async () => {
  const registry = async (args, { output }) => {
    if (args[0] === 'equipamento') throw Error('Falha no cadastro');
    output('[]');
  };
  const output = await run('2\n1\n0\n2\n\n0\n0\n', undefined, registry);
  assert.match(output, /a ordem é livre/);
  assert.match(output, /Nenhum registro encontrado/);
  assert.match(output, /Falha no cadastro/);
});

test('atualização explícita recarrega dados alterados por outra consulta', async () => {
  let reads = 0;
  const registry = async (args, { output }) => output(JSON.stringify(++reads === 1 ? [] : [{ id: 1, name: 'Novo' }]));
  const output = await run('2\n1\nu\n1\n0\n0\n0\n0\n', undefined, registry);
  assert.match(output, /Nenhum registro encontrado/);
  assert.match(output, /Nome: Novo/);
  assert.ok(reads >= 2);
});

test('cria pessoa pela lista, atualiza e persiste ao reabrir', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-form-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const output = await run('2\n1\nn\nAna Silva\nSIM\n\n1\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Registro salvo/);
    assert.match(output, /Nome: Ana Silva/);
    const results = [];
    await registry(['pessoa', 'listar'], { output: item => results.push(item) });
    assert.equal(JSON.parse(results[0])[0].name, 'Ana Silva');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cancelamento e falha no cadastro não anunciam gravação', async () => {
  const calls = [];
  const registry = async (args, { output }) => {
    calls.push(args);
    if (args[1] === 'listar') output('[]');
    else throw Error('Falha de validação');
  };
  const output = await run('2\n1\nn\n/cancelar\nn\nAna\nNÃO\nn\nAna\nSIM\n\n0\n0\n0\n', undefined, registry);
  assert.equal(calls.filter(args => args[1] === 'adicionar').length, 1);
  assert.match(output, /Cadastro cancelado/);
  assert.match(output, /Não foi possível salvar: Falha de validação/);
  assert.doesNotMatch(output, /Registro salvo/);
});

test('cria equipamento com atributos opcionais usando validação do cadastro', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-form-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const output = await run('2\n2\nn\nVoz\nmicrofone\namarelo\n1\n\nModelo A\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Registro salvo/);
    const results = [];
    await registry(['equipamento', 'listar'], { output: item => results.push(item) });
    const equipment = JSON.parse(results[0])[0];
    assert.equal(equipment.name, 'Voz');
    assert.equal(equipment.color, 'amarelo');
    assert.equal(equipment.model, 'Modelo A');
    assert.equal(equipment.wireless, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('catálogo cria sessão, grupo, papel e dispositivo por formulários', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-simple-catalog-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const output = await run('2\n3\nn\nEnsaio\nSIM\n\n0\n4\nn\nGrupo\nSIM\n\n0\n5\nn\nVoz\nSIM\n\n0\n6\nn\nMedusa\nmedusa\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.equal((output.match(/Registro salvo/g) ?? []).length, 4);
    for (const category of ['sessao', 'grupo', 'papel', 'fisico-dispositivo']) {
      const result = [];
      await registry([category, 'listar'], { output: value => result.push(value) });
      assert.equal(JSON.parse(result[0]).length, 1);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('catálogo versionado alimenta rótulo do formulário e detalhe de pessoa', async () => {
  assert.equal(TERMINAL_CATALOG_VERSION, 2);
  const field = terminalCatalog.pessoa.create.fields[0];
  const previousField = field.label, previousLabels = terminalCatalog.pessoa.labels, previousTitle = terminalCatalog.pessoa.title;
  field.label = 'Nome para cadastro';
  terminalCatalog.pessoa.labels = { ...previousLabels, name: 'Nome apresentado' };
  terminalCatalog.pessoa.title = 'Pessoas cadastradas';
  try {
    const registry = async (args, { output }) => {
      if (args[1] === 'listar') output(JSON.stringify([{ id: 1, name: 'Exemplo' }]));
      else output('{}');
    };
    const output = await run('2\n1\nn\n/cancelar\n1\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Nome para cadastro/);
    assert.match(output, /Nome apresentado: Exemplo/);
    assert.match(output, /Pessoas cadastradas/);
  } finally {
    field.label = previousField;
    terminalCatalog.pessoa.labels = previousLabels;
    terminalCatalog.pessoa.title = previousTitle;
  }
});

test('EOF no formulário não grava registro', async () => {
  const calls = [];
  const registry = async (args, { output }) => { calls.push(args); output('[]'); };
  await run('2\n2\nn\nVoz\n', undefined, registry);
  assert.equal(calls.some(args => args[1] === 'adicionar'), false);
});

test('menu da sessão abre seletor e cria proposta sem confirmação automática', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-source-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone']]) {
      await registry(args, { output: () => {} });
    }
    const output = await run('2\n3\n1\n1\n2\nv\n1\n1\n3\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Vínculo proposto; confirmação é uma ação posterior/);
    const records = [];
    await registry(['vinculo', 'listar', '1'], { output: value => records.push(value) });
    assert.equal(JSON.parse(records[0])[0].status, 'proposto');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('menu adiciona integrante ao grupo sem atribuir função ou sessão', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-team-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    await registry(['grupo', 'adicionar', 'Grupo'], { output: () => {} });
    await registry(['pessoa', 'adicionar', 'Pessoa'], { output: () => {} });
    const output = await run('2\n4\n1\n1\n1\ni\n1\nNÃO\ni\n1\nSIM\n\ni\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Inclusão cancelada/);
    assert.match(output, /Integrante adicionado ao grupo/);
    assert.match(output, /Não foi possível adicionar/);
    const records = [];
    await registry(['grupo-integrante', 'listar', '1'], { output: value => records.push(value) });
    const members = JSON.parse(records[0]);
    assert.equal(members.length, 1);
    assert.equal(members[0].personId, 1);
    assert.deepEqual(members[0].roles, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('remoção de integrante pede confirmação e preserva bloqueio por função', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-team-remove-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['grupo', 'adicionar', 'Grupo'], ['pessoa', 'adicionar', 'Pessoa'], ['papel', 'adicionar', 'Voz'],
      ['sessao', 'criar', 'Ensaio'], ['grupo-integrante', 'adicionar', '1', '1'], ['grupo-funcao', 'adicionar', '1', '1', '1'],
      ['sessao-grupo', 'adicionar', '1', '1'], ['sessao-integrante', 'adicionar', '1', '1', '1']]) await registry(args, silent);
    const blocked = await run('2\n4\n1\n1\n1\n1\nr\nNÃO\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(blocked, /Remoção cancelada/);
    assert.match(blocked, /Não foi possível remover/);
    await registry(['grupo-funcao', 'remover', '1', '1', '1'], silent);
    const formationBlocked = await run('2\n4\n1\n1\n1\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(formationBlocked, /Não foi possível remover/);
    await registry(['sessao-integrante', 'remover', '1', '1', '1'], silent);
    const removed = await run('2\n4\n1\n1\n1\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(removed, /Integrante removido do grupo/);
    assert.match(removed, /Nenhum registro encontrado/);
    const output = [];
    await registry(['grupo-integrante', 'listar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('função habitual pode ser revista e não altera papel efetivo da sessão', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-role-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['grupo', 'adicionar', 'Grupo'], ['pessoa', 'adicionar', 'Pessoa'], ['papel', 'adicionar', 'Voz'],
      ['sessao', 'criar', 'Ensaio'], ['grupo-integrante', 'adicionar', '1', '1'], ['sessao-grupo', 'adicionar', '1', '1'],
      ['sessao-integrante', 'adicionar', '1', '1', '1'], ['sessao-papel', 'adicionar', '1', '1', '1', '1']]) await registry(args, silent);
    const output = await run('2\n4\n1\n1\n1\n1\nf\n1\nNÃO\n1\nf\n1\nSIM\n\n1\nf\n1\nSIM\n\n1\nd\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Alteração cancelada/);
    assert.match(output, /Função habitual adicionada/);
    assert.match(output, /Não foi possível alterar a função/);
    assert.match(output, /Função habitual removida/);
    const members = [], formation = [];
    await registry(['grupo-integrante', 'listar', '1'], { output: value => members.push(value) });
    await registry(['formacao', 'mostrar', '1'], { output: value => formation.push(value) });
    assert.deepEqual(JSON.parse(members[0])[0].roles, []);
    assert.equal(JSON.parse(formation[0])[0].members[0].roles[0].name, 'Voz');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('função removida após seleção não é atribuída', async () => {
  let roleReads = 0, writes = 0;
  const member = { teamId: 1, personId: 1, personName: 'Pessoa', roles: [] };
  const registry = async (args, { output }) => {
    if (args[0] === 'grupo-funcao') { writes++; return; }
    output(JSON.stringify(args[0] === 'papel' ? (++roleReads === 1 ? [{ id: 1, name: 'Voz' }] : []) : args[0] === 'grupo' ? [{ id: 1, name: 'Grupo' }] : [member]));
  };
  const answers = ['1', 'SIM'];
  const messages = [];
  await changeTeamRole({ team: { id: 1, name: 'Grupo' }, member, action: 'adicionar', registry,
    ask: async () => answers.shift() ?? null, screen: () => {}, write: value => messages.push(value) });
  assert.equal(writes, 0);
  assert.match(messages.join('\n'), /alterado ou removido/);
});

test('associação de grupo à sessão exige confirmação e respeita formação vinculada', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-session-team-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['grupo', 'adicionar', 'Grupo'], ['pessoa', 'adicionar', 'Pessoa'], ['grupo-integrante', 'adicionar', '1', '1']]) await registry(args, silent);
    const added = await run('2\n3\n1\n1\n1\ng\n1\nNÃO\ng\n1\nSIM\n\ng\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(added, /Alteração cancelada/);
    assert.match(added, /Grupo associado à sessão/);
    assert.match(added, /Não foi possível alterar o grupo/);
    await registry(['sessao-integrante', 'adicionar', '1', '1', '1'], silent);
    const blocked = await run('2\n3\n1\n1\n1\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(blocked, /Não foi possível alterar o grupo/);
    await registry(['sessao-integrante', 'remover', '1', '1', '1'], silent);
    const removed = await run('2\n3\n1\n1\n1\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(removed, /Grupo desassociado da sessão/);
    const result = [];
    await registry(['formacao', 'mostrar', '1'], { output: value => result.push(value) });
    assert.deepEqual(JSON.parse(result[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('participação usa integrante do grupo e respeita papel efetivo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-session-member-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['grupo', 'adicionar', 'Grupo'], ['grupo', 'adicionar', 'Outro'],
      ['pessoa', 'adicionar', 'Pessoa'], ['pessoa', 'adicionar', 'Exclusiva'], ['papel', 'adicionar', 'Voz'],
      ['grupo-integrante', 'adicionar', '1', '1'], ['grupo-integrante', 'adicionar', '2', '2'], ['sessao-grupo', 'adicionar', '1', '1']]) await registry(args, silent);
    const added = await run('2\n3\n1\n1\n1\n1\ni\n1\nNÃO\n1\ni\n1\nSIM\n\n1\ni\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(added, /Alteração cancelada/);
    assert.match(added, /Participante incluído na sessão/);
    assert.match(added, /Não foi possível alterar a participação/);
    assert.doesNotMatch(added, /Exclusiva/);
    await registry(['sessao-papel', 'adicionar', '1', '1', '1', '1'], silent);
    const blocked = await run('2\n3\n1\n1\n1\n1\nd\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(blocked, /Não foi possível alterar a participação/);
    await registry(['sessao-papel', 'remover', '1', '1', '1', '1'], silent);
    const removed = await run('2\n3\n1\n1\n1\n1\nd\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(removed, /Participante removido da sessão/);
    const output = [];
    await registry(['formacao', 'mostrar', '1'], { output: value => output.push(value) });
    assert.deepEqual(JSON.parse(output[0])[0].members, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('papel efetivo é revisado sem alterar função habitual', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-session-role-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['grupo', 'adicionar', 'Grupo'], ['pessoa', 'adicionar', 'Pessoa'],
      ['papel', 'adicionar', 'Voz'], ['grupo-integrante', 'adicionar', '1', '1'], ['grupo-funcao', 'adicionar', '1', '1', '1'],
      ['sessao-grupo', 'adicionar', '1', '1'], ['sessao-integrante', 'adicionar', '1', '1', '1']]) await registry(args, silent);
    const output = await run('2\n3\n1\n1\n1\n1\np\n1\n1\nNÃO\n1\np\n1\n1\nSIM\n\n1\np\n1\n1\nSIM\n\n1\ne\n1\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Alteração cancelada/);
    assert.match(output, /Papel efetivo atribuído/);
    assert.match(output, /Não foi possível alterar o papel efetivo/);
    assert.match(output, /Papel efetivo removido/);
    const members = [], formation = [];
    await registry(['grupo-integrante', 'listar', '1'], { output: value => members.push(value) });
    await registry(['formacao', 'mostrar', '1'], { output: value => formation.push(value) });
    assert.equal(JSON.parse(members[0])[0].roles[0].name, 'Voz');
    assert.deepEqual(JSON.parse(formation[0])[0].members[0].roles, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('configuração de AUX no menu exige confirmação e recusa redução incompatível', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-aux-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const output = await run('2\n8\nc\n10\nNÃO\nc\n10\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Configuração cancelada/);
    assert.match(output, /Quantidade de AUX configurada/);
    await registry(['sessao', 'criar', 'Ensaio'], { output: () => {} });
    await registry(['retorno', 'adicionar', '1', '9'], { output: () => {} });
    const blocked = await run('2\n8\nc\n8\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(blocked, /Não foi possível configurar/);
    const records = [];
    await registry(['aux-config', 'mostrar'], { output: value => records.push(value) });
    assert.equal(JSON.parse(records[0]).auxCount, 10);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retorno no menu exige configuração, confirmação e rejeita duplicata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-return-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    await registry(['sessao', 'criar', 'Ensaio'], { output: () => {} });
    const missing = await run('2\n3\n1\n1\n4\nn\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(missing, /Configure a quantidade de AUX/);
    await registry(['aux-config', 'definir', '8'], { output: () => {} });
    const output = await run('2\n3\n1\n1\n4\nn\n3\nNÃO\nn\n3\nSIM\n\nn\n3\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Cadastro cancelado/);
    assert.match(output, /Retorno cadastrado/);
    assert.match(output, /Não foi possível cadastrar retorno/);
    const result = [];
    await registry(['retorno', 'listar', '1'], { output: value => result.push(value) });
    assert.equal(JSON.parse(result[0]).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('proposta de retorno usa somente retornos da sessão e permanece pendente', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-return-link-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['sessao', 'criar', 'Outra'], ['pessoa', 'adicionar', 'Pessoa'],
      ['aux-config', 'definir', '8'], ['retorno', 'adicionar', '2', '7']]) await registry(args, silent);
    const missing = await run('2\n3\n1\n1\n5\nv\n1\n0\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(missing, /Nenhum retorno encontrado nesta sessão/);
    assert.doesNotMatch(missing, /AUX 7/);
    await registry(['retorno', 'adicionar', '1', '3'], silent);
    const output = await run('2\n3\n1\n1\n5\nv\n1\n1\nNÃO\nv\n1\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Proposta cancelada/);
    assert.match(output, /confirmação é uma ação posterior/);
    const result = [];
    await registry(['retorno-vinculo', 'listar', '1'], { output: value => result.push(value) });
    const records = JSON.parse(result[0]);
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'proposto');
    assert.equal(records[0].returnId, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('detalhe do vínculo oferece ação revisada e recarrega o estado', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-review-ui-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3']]) await registry(args, { output: () => {} });
    const output = await run('2\n3\n1\n1\n2\n1\nc\nSIM\n\n1\n0\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Vínculo confirmado no cadastro/);
    assert.match(output, /Estado: confirmado/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção de fonte proposta usa seletores e não confirma o vínculo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-source-edit-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3']]) await registry(args, { output: () => {} });
    const output = await run('2\n3\n1\n1\n2\n1\ne\n1\n1\n4\nNÃO\n1\ne\n1\n1\n4\nSIM\n\n1\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Correção cancelada/);
    assert.match(output.split('Fonte corrigida; o vínculo permanece proposto.')[1], /Canal: 4/);
    assert.match(output, /Fonte corrigida; o vínculo permanece proposto/);
    const result = [];
    await registry(['vinculo', 'listar', '1'], { output: value => result.push(value) });
    const item = JSON.parse(result[0])[0];
    assert.equal(item.status, 'proposto');
    assert.equal(item.channel, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('substituição de fonte mostra entradas e mantém nova proposta pendente', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-source-replace-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'],
      ['equipamento', 'adicionar', 'Outro', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3'], ['vinculo', 'confirmar', '1'],
      ['entrada-fonte', 'vincular', '1', 'principal', '1']]) await registry(args, { output: () => {} });
    const output = await run('2\n3\n1\n1\n2\n1\ns\n1\n2\n4\nNÃO\n1\ns\n1\n2\n4\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Entradas a desvincular: principal/);
    assert.match(output, /Substituição cancelada/);
    assert.match(output, /nova proposta pendente/);
    const links = [], inputs = [];
    await registry(['vinculo', 'listar', '1'], { output: value => links.push(value) });
    await registry(['entrada-fonte', 'listar', '1'], { output: value => inputs.push(value) });
    assert.deepEqual(JSON.parse(links[0]).map(item => item.status), ['revogado', 'proposto']);
    assert.deepEqual(JSON.parse(inputs[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('entrada associa apenas fonte confirmada da sessão e não substitui vínculo existente', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-input-ui-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['sessao', 'criar', 'Outra'], ['pessoa', 'adicionar', 'Pessoa'],
      ['equipamento', 'adicionar', 'Mic', 'microfone'], ['vinculo', 'propor', '1', '1', '1', '3'],
      ['vinculo', 'propor', '2', '1', '1', '3'], ['vinculo', 'confirmar', '2']]) await registry(args, silent);
    const missing = await run('2\n3\n1\n1\n3\nv\nprincipal\n0\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(missing, /Nenhuma fonte confirmada nesta sessão/);
    await registry(['vinculo', 'confirmar', '1'], silent);
    const output = await run('2\n3\n1\n1\n3\nv\nprincipal\n1\nNÃO\nv\nprincipal\n1\nSIM\n\nv\nprincipal\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Associação cancelada/);
    assert.match(output, /Entrada associada à fonte confirmada/);
    assert.match(output, /Não foi possível associar entrada/);
    const result = [];
    await registry(['entrada-fonte', 'listar', '1'], { output: value => result.push(value) });
    assert.equal(JSON.parse(result[0]).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('remoção revisada de entrada no menu exige confirmação', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-input-remove-ui-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'],
      ['vinculo', 'propor', '1', '1', '1', '3'], ['vinculo', 'confirmar', '1'], ['entrada-fonte', 'vincular', '1', 'principal', '1']]) await registry(args, { output: () => {} });
    const output = await run('2\n3\n1\n1\n3\n1\nr\nNÃO\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Remoção cancelada/);
    assert.match(output, /Associação de entrada removida/);
    const result = [];
    await registry(['entrada-fonte', 'listar', '1'], { output: value => result.push(value) });
    assert.deepEqual(JSON.parse(result[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('pontos de canal e via usam dados declarados e filtram medusa', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-points-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['fisico-dispositivo', 'adicionar', 'Mesa', 'mesa'], ['fisico-dispositivo', 'adicionar', 'Medusa', 'medusa']]) await registry(args, { output: () => {} });
    const output = await run('2\n7\nn\n1\nCanal 3\n1\n3\nSIM\n\nn\n3\nVia 1\n2\n1\nSIM\n\nn\n2\nPorta\n1\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Ponto cadastrado/);
    assert.match(output, /Medusa \(ID 2; medusa\)/);
    const result = [];
    await registry(['fisico-ponto', 'listar'], { output: value => result.push(value) });
    const points = JSON.parse(result[0]);
    assert.equal(points.length, 2);
    assert.equal(points[0].channel, 3);
    assert.equal(points[1].deviceId, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ponto de via sem medusa permite voltar sem gravar', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-empty-point-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    await registry(['fisico-dispositivo', 'adicionar', 'Mesa', 'mesa'], { output: () => {} });
    const output = await run('2\n7\nn\n3\nVia\n1\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Nenhum registro encontrado/);
    const result = [];
    await registry(['fisico-ponto', 'listar'], { output: value => result.push(value) });
    assert.deepEqual(JSON.parse(result[0]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ponto não é salvo se dispositivo mudar antes do envio', async () => {
  let reads = 0, writes = 0;
  const registry = async (args, { output }) => {
    if (args[0] === 'fisico-ponto') { writes++; return; }
    output(JSON.stringify([{ id: 1, name: ++reads === 1 ? 'Medusa' : 'Alterada', type: 'medusa' }]));
  };
  const answers = ['3', 'Via', '1', '1', 'SIM'], messages = [];
  await createPhysicalPoint({ registry, ask: async () => answers.shift() ?? null, screen: () => {}, write: value => messages.push(value) });
  assert.equal(writes, 0);
  assert.match(messages.join('\n'), /alterada ou removida/);
});

test('pontos de pessoa, equipamento e mix preservam referências selecionadas', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-point-ref-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    await registry(['pessoa', 'adicionar', 'Pessoa'], { output: () => {} });
    await registry(['equipamento', 'adicionar', 'Mic', 'microfone'], { output: () => {} });
    const output = await run('2\n7\nn\n4\nSaída mic\n2\n1\nSIM\n\nn\n5\nPessoa\n1\n1\nSIM\n\nn\n6\nMix\n3\nSIM\n\nn\n7\nOutro\n4\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Ponto cadastrado/);
    const result = [];
    await registry(['fisico-ponto', 'listar'], { output: value => result.push(value) });
    const points = JSON.parse(result[0]);
    assert.equal(points.length, 4);
    assert.equal(points[0].equipmentId, 1);
    assert.equal(points[1].personId, 1);
    assert.equal(points[2].type, 'mix');
    assert.equal(points[3].type, 'other');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ponto de retorno seleciona somente AUX da sessão escolhida', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-point-return-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['sessao', 'criar', 'Outra'], ['aux-config', 'definir', '8'], ['retorno', 'adicionar', '2', '7']]) await registry(args, { output: () => {} });
    const missing = await run('2\n7\nn\n8\nRetorno\n2\n1\n0\n0\n0\n0\n', undefined, registry);
    assert.match(missing, /Nenhum retorno encontrado nesta sessão/);
    assert.doesNotMatch(missing, /AUX 7/);
    await registry(['retorno', 'adicionar', '1', '3'], { output: () => {} });
    const output = await run('2\n7\nn\n8\nRetorno\n2\n1\n1\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Ponto cadastrado/);
    const result = [];
    await registry(['fisico-ponto', 'listar'], { output: value => result.push(value) });
    assert.equal(JSON.parse(result[0])[0].monitorReturnId, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('proposta de ligação filtra pontos de retorno por sessão e aceita destino desconhecido', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-link-menu-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    const silent = { output: () => {} };
    for (const args of [['sessao', 'criar', 'Ensaio'], ['sessao', 'criar', 'Outra'], ['aux-config', 'definir', '8'],
      ['retorno', 'adicionar', '2', '7'], ['fisico-ponto', 'adicionar', 'other', 'Origem', '--direcao', 'output'],
      ['fisico-ponto', 'adicionar', 'monitor_return', 'Retorno externo', '--retorno', '1']]) await registry(args, silent);
    const output = await run('2\n3\n1\n1\n6\nv\n1\nd\n1\nNÃO\nv\n1\nd\n1\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Proposta cancelada/);
    assert.match(output, /Ligação proposta; confirmação é uma ação posterior/);
    assert.doesNotMatch(output, /Retorno externo/);
    const result = [];
    await registry(['fisico-ligacao', 'listar', '1'], { output: value => result.push(value) });
    const links = JSON.parse(result[0]);
    assert.equal(links.length, 1);
    assert.equal(links[0].status, 'proposto');
    assert.equal(links[0].toPointId, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('detalhe de ligação confirma mediante origem e revisão', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-link-review-ui-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['fisico-ponto', 'adicionar', 'other', 'Saída', '--direcao', 'output'],
      ['fisico-ponto', 'adicionar', 'other', 'Entrada', '--direcao', 'input'], ['fisico-ligacao', 'propor', '1', '1', '2', 'physical']]) await registry(args, { output: () => {} });
    const output = await run('2\n3\n1\n1\n6\n1\nc\noperador\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Vínculo confirmado no cadastro/);
    const result = [];
    await registry(['fisico-ligacao', 'listar', '1'], { output: value => result.push(value) });
    const link = JSON.parse(result[0])[0];
    assert.equal(link.status, 'confirmado');
    assert.equal(link.confirmationOrigin, 'operador');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('menu revisa e rejeita proposta de voz sem confirmar automaticamente', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-review-ui-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    await registry(['sessao', 'criar', 'Ensaio'], { output: () => {} });
    await registry(['voz-vinculo', 'propor', '1', 'entrada', 'microfone amarelo para alguém'], { output: () => {} });
    const output = await run('2\n3\n1\n1\n7\n1\nr\nSIM\n\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Frase: microfone amarelo para alguém/);
    assert.match(output, /Vínculo rejeitado/);
    const result = [];
    await registry(['voz-vinculo', 'listar', '1'], { output: value => result.push(value) });
    assert.equal(JSON.parse(result[0])[0].status, 'rejeitado');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção de voz aceita referência desconhecida e mantém proposta pendente', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-voice-edit-ui-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone'],
      ['voz-vinculo', 'propor', '1', 'entrada', 'microfone amarelo para alguém']]) await registry(args, { output: () => {} });
    const output = await run('2\n3\n1\n1\n7\n1\ne\nd\n1\n\nSIM\n\n1\n0\n0\n0\n0\n0\n0\n', undefined, registry);
    assert.match(output, /Proposta de voz corrigida; confirmação continua pendente/);
    assert.match(output.split('Proposta de voz corrigida; confirmação continua pendente.')[1], /ID do equipamento: 1/);
    const result = [];
    await registry(['voz-vinculo', 'listar', '1'], { output: value => result.push(value) });
    const item = JSON.parse(result[0])[0];
    assert.equal(item.personId, null);
    assert.equal(item.equipmentId, 1);
    assert.equal(item.channel, null);
    assert.equal(item.status, 'proposto');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('correção global por menu registra histórico e preserva opcionais explícitos', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-global-edit-'));
  const registry = (args, options = {}) => runRegistryCommand(args, { ...options, directory });
  try {
    for (const args of [['sessao', 'criar', 'Ensaio'], ['sessao', 'criar', 'Outra'], ['pessoa', 'adicionar', 'Pessoa'], ['equipamento', 'adicionar', 'Mic', 'microfone', 'azul']]) await registry(args, { output: () => {} });
    const person = await run('2\n1\n1\ne\n1\nNovo\nNÃO\n1\ne\n1\nNovo\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(person, /Correção cancelada/);
    assert.match(person, /Cadastro global corrigido; histórico registrado/);
    const equipment = await run('2\n2\n1\ne\n1\nVoz\nmicrofone\n\n1\n\nModelo\nSIM\n\n0\n0\n0\n', undefined, registry);
    assert.match(equipment, /Atual — tipo: microfone; cor: azul/);
    assert.match(equipment, /Cadastro global corrigido/);
    const output = [];
    await registry(['passagem', 'mostrar', '2'], { output: value => output.push(value) });
    const data = JSON.parse(output[0]);
    assert.equal(data.pessoas[0].name, 'Novo');
    assert.equal(data.equipamentos[0].color, null);
    assert.equal(data.equipamentos[0].wireless, true);
    assert.equal(data.historicoCadastros.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
