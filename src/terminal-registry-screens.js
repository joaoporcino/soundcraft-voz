import { runRegistryCommand } from './registry-cli.js';
import { createRegistryRecord, hasCreateForm } from './terminal-registry-forms.js';
import { terminalCatalog } from './terminal-catalog.js';
import { validateCatalogEntity, validateCatalogRecords } from './terminal-catalog-validation.js';
import { proposeSource } from './terminal-source-proposal.js';
import { addTeamMember, changeTeamRole, removeTeamMember } from './terminal-team-members.js';
import { changeSessionMember, changeSessionRole, changeSessionTeam } from './terminal-session-teams.js';
import { proposeReturn } from './terminal-return-proposal.js';
import { reviewAssignment } from './terminal-assignment-review.js';
import { createPhysicalPoint } from './terminal-physical-points.js';
import { proposeSignalLink } from './terminal-signal-link.js';
import { correctSource, replaceSource } from './terminal-source-correction.js';
import { bindInput, unbindInput } from './terminal-input-source.js';
import { correctVoice } from './terminal-voice-correction.js';
import { correctGlobalRecord } from './terminal-global-correction.js';
import { registryContentRevision } from './registry.js';
import { soundcheckRevision } from './soundcheck-review.js';

// Each entry describes a screen; the registry remains the source of its data and rules.
const screens = [
  ...['pessoa', 'equipamento', 'sessao', 'grupo', 'papel', 'fisico-dispositivo'].map(key => ({
    get title() { return terminalCatalog[key].title; },
    get command() { return terminalCatalog[key].list; },
    get labels() { return terminalCatalog[key].labels; },
    catalogKey: key,
    ...(key === 'sessao' ? { children: 'session' } : key === 'grupo' ? { children: 'team' } : {}),
  })),
  { title: 'Pontos físicos', command: ['fisico-ponto', 'listar'] },
  { title: 'Configuração de AUX', command: ['aux-config', 'mostrar'] },
];
const sessionScreens = [
  { title: 'Formação', command: ['formacao', 'mostrar'] },
  { title: 'Vínculos de fontes', command: ['vinculo', 'listar'] },
  { title: 'Entradas associadas', command: ['entrada-fonte', 'listar'] },
  { title: 'Retornos', command: ['retorno', 'listar'] },
  { title: 'Vínculos de retorno', command: ['retorno-vinculo', 'listar'] },
  { title: 'Ligações físicas', command: ['fisico-ligacao', 'listar'] },
  { title: 'Propostas de voz', command: ['voz-vinculo', 'listar'] },
];
const teamScreens = [{ title: 'Integrantes e funções', command: ['grupo-integrante', 'listar'] }];
const labels = { id: 'ID', name: 'Nome', label: 'Identificação', kind: 'Tipo', type: 'Tipo', color: 'Cor',
  wireless: 'Sem fio', model: 'Modelo', capsule: 'Cápsula', status: 'Estado', channel: 'Canal',
  personId: 'ID da pessoa', equipmentId: 'ID do equipamento', sessionId: 'ID da sessão', teamId: 'ID do grupo',
  returnId: 'ID do retorno', inputId: 'Entrada', direction: 'Direção', phrase: 'Frase', origin: 'Origem',
  personName: 'Pessoa', roles: 'Papéis', teamName: 'Grupo', assignmentId: 'ID do vínculo' };
const names = { proposed: 'proposto', confirmed: 'confirmado', rejected: 'rejeitado', revoked: 'revogado',
  unknown: 'desconhecido', input: 'entrada', output: 'saída', bidirectional: 'bidirecional' };

function describe(value, indent = '', fieldLabels = labels) {
  if (value === null || value === undefined) return ['não informado'];
  if (Array.isArray(value)) {
    if (!value.length) return ['nenhum'];
    return value.flatMap((item, index) => [`${indent}${index + 1}.`, ...describe(item, `${indent}  `, fieldLabels)]);
  }
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => {
    const label = fieldLabels[key] ?? key;
    if (item !== null && typeof item === 'object') return [`${indent}${label}:`, ...describe(item, `${indent}  `, fieldLabels)];
    return [`${indent}${label}: ${describe(item)[0]}`];
  });
  if (typeof value === 'boolean') return [value ? 'sim' : 'não'];
  return [Object.hasOwn(names, value) ? names[value] : String(value)];
}

async function query(registry, args) {
  const output = [];
  await registry(args, { output: value => output.push(value) });
  if (output.length !== 1) throw new Error('Resposta de cadastro inesperada.');
  return JSON.parse(output[0]);
}

export async function runRegistryScreens({ screen, ask, write, registry = runRegistryCommand }) {
  async function menu(title, entries, choose) {
    for (;;) {
      screen('Cadastros', title, [
        ...(title === 'Cadastros - consulta' ? ['Sugestão: cadastre pessoas e equipamentos, depois sessões e relações conforme necessário; a ordem é livre.'] : []),
        ...entries.map((entry, index) => `${index + 1}  ${entry.title}`), '0  Voltar',
      ]);
      const answer = await ask('Escolha uma opção: ');
      if (answer === null) return false;
      if (answer === '0') return true;
      const index = Number(answer) - 1;
      if (!/^\d+$/u.test(answer) || !entries[index]) { write('Opção inválida.'); continue; }
      if (!await choose(entries[index])) return false;
    }
  }
  async function list(entry, scope, context) {
    const category = entry.catalogKey ?? entry.command[0];
    let records;
    async function refresh() {
      if (entry.catalogKey) validateCatalogEntity(entry.catalogKey);
      const result = await query(registry, [...(entry.catalogKey ? terminalCatalog[entry.catalogKey].list : entry.command), ...(scope === undefined ? [] : [String(scope)])]);
      if (entry.catalogKey) validateCatalogRecords(entry.catalogKey, result);
      records = Array.isArray(result) ? result : [result];
    }
    let page = 0;
    for (;;) {
      try { await refresh(); } catch (error) {
        screen('Cadastros', entry.title, [`Erro ao consultar: ${error.message}`]);
        return (await ask('Enter para voltar: ')) !== null;
      }
      const pageSize = 8, start = page * pageSize, shown = records.slice(start, start + pageSize);
      const rows = shown.map((record, i) => `${start + i + 1}  ${record?.name ?? record?.label ?? record?.personName ?? record?.teamName ?? record?.id ?? `Registro ${start + i + 1}`}${record?.name && record?.id !== undefined ? ` (ID ${record.id})` : ''}`);
      screen('Cadastros', entry.title, [
        ...(!records.length ? ['Nenhum registro encontrado.'] : rows),
        `Página ${page + 1} de ${Math.max(1, Math.ceil(records.length / pageSize))}`,
        `Número: abrir | P: próxima | A: anterior | U: atualizar${hasCreateForm(category) && scope === undefined || category === 'retorno' && context || category === 'fisico-ponto' && scope === undefined ? ' | N: novo' : ''}${category === 'vinculo' && context ? ' | V: propor fonte' : ''}${category === 'retorno-vinculo' && context ? ' | V: propor retorno' : ''}${category === 'fisico-ligacao' && context ? ' | V: propor ligação' : ''}${category === 'entrada-fonte' && context ? ' | V: associar entrada' : ''}${category === 'grupo-integrante' && context ? ' | I: adicionar integrante' : ''}${category === 'formacao' && context ? ' | G: associar grupo' : ''}${category === 'aux-config' ? ' | C: configurar' : ''} | 0: voltar`,
      ]);
      const answer = await ask('Escolha: ');
      if (answer === null) return false;
      if (answer === '0') return true;
      if (answer.toLowerCase() === 'u') { page = 0; continue; }
      if (answer.toLowerCase() === 'v' && category === 'entrada-fonte' && context) {
        if (!await bindInput({ session: context, registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'v' && category === 'fisico-ligacao' && context) {
        if (!await proposeSignalLink({ session: context, registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'n' && category === 'fisico-ponto' && scope === undefined) {
        if (!await createPhysicalPoint({ registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'v' && category === 'retorno-vinculo' && context) {
        if (!await proposeReturn({ session: context, registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'n' && category === 'retorno' && context) {
        try {
          const config = await query(registry, ['aux-config', 'mostrar']);
          if (config.auxCount === null) { write('Configure a quantidade de AUX no menu de cadastros antes de criar um retorno.'); continue; }
          const aux = await ask(`Número do AUX (1 a ${config.auxCount}; vazio cancela): `);
          if (aux === null) return false;
          if (!aux) continue;
          if (!/^[1-9]\d*$/u.test(aux) || !Number.isSafeInteger(Number(aux))) { write('AUX inválido.'); continue; }
          screen('Cadastros', 'Revisar retorno', [`Sessão: ${context.name} (ID ${context.id})`, `AUX: ${aux}`, `Quantidade configurada: ${config.auxCount}`, 'O cadastro não comprova a saída física. Digite SIM para salvar.']);
          const confirm = await ask('Salvar? ');
          if (confirm === null) return false;
          if (confirm.toUpperCase() !== 'SIM') { write('Cadastro cancelado.'); continue; }
          const sessions = await query(registry, ['sessao', 'listar']);
          const current = sessions.find(item => item.id === context.id);
          const currentConfig = await query(registry, ['aux-config', 'mostrar']);
          if (!current || JSON.stringify(current) !== JSON.stringify(context) || JSON.stringify(currentConfig) !== JSON.stringify(config)) {
            write('Sessão ou configuração alterada. Atualize e revise novamente.'); continue;
          }
          await registry(['retorno', 'adicionar-revisado', String(context.id), aux,
            soundcheckRevision('sessao', context), registryContentRevision('aux-config', config)], { output: () => {} });
          write('Retorno cadastrado.');
        } catch (error) { write(`Não foi possível cadastrar retorno: ${error.message}`); }
        if (await ask('Enter para voltar: ') === null) return false;
        continue;
      }
      if (answer.toLowerCase() === 'c' && category === 'aux-config') {
        const quantity = await ask('Quantidade de AUX (vazio cancela): ');
        if (quantity === null) return false;
        if (!quantity) continue;
        if (!/^[1-9]\d*$/u.test(quantity) || !Number.isSafeInteger(Number(quantity))) { write('Quantidade inválida.'); continue; }
        screen('Cadastros', 'Revisar quantidade de AUX', [...describe(records[0]), `Nova quantidade: ${quantity}`, 'Valor informado não comprova a capacidade da mesa. Digite SIM para salvar.']);
        const confirm = await ask('Salvar? ');
        if (confirm === null) return false;
        if (confirm.toUpperCase() !== 'SIM') { write('Configuração cancelada.'); continue; }
        try {
          const current = await query(registry, ['aux-config', 'mostrar']);
          if (JSON.stringify(current) !== JSON.stringify(records[0])) { write('Configuração alterada. Atualize e revise novamente.'); continue; }
          await registry(['aux-config', 'definir', quantity], { output: () => {} });
          write('Quantidade de AUX configurada.');
        } catch (error) { write(`Não foi possível configurar: ${error.message}`); }
        if (await ask('Enter para voltar: ') === null) return false;
        continue;
      }
      if (answer.toLowerCase() === 'g' && category === 'formacao' && context) {
        if (!await changeSessionTeam({ session: context, action: 'adicionar', registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'v' && category === 'vinculo' && context) {
        if (!await proposeSource({ session: context, registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'i' && category === 'grupo-integrante' && context) {
        if (!await addTeamMember({ team: context, registry, screen, ask, write })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'n' && hasCreateForm(category) && scope === undefined) {
        if (!await createRegistryRecord({ category: category, ask, screen, write, registry })) return false;
        page = 0;
        continue;
      }
      if (answer.toLowerCase() === 'p') { if (start + pageSize < records.length) page++; continue; }
      if (answer.toLowerCase() === 'a') { if (page > 0) page--; continue; }
      const index = Number(answer) - 1;
      if (!/^\d+$/u.test(answer) || index < start || index >= start + shown.length) { write('Registro inválido.'); continue; }
      const record = records[index];
      for (;;) {
        const hasChildren = entry.children && record?.id !== undefined;
        const canRemoveMember = category === 'grupo-integrante' && context && record?.personId !== undefined;
        const canRemoveTeam = category === 'formacao' && context && record?.id !== undefined;
        const isSource = category === 'vinculo' && context;
        const isReturn = category === 'retorno-vinculo' && context;
        const isSignal = category === 'fisico-ligacao' && context;
        const isVoice = category === 'voz-vinculo' && context;
        const isInput = category === 'entrada-fonte' && context && record?.inputId && record?.bindingId;
        const canCorrectGlobal = ['pessoa', 'equipamento'].includes(category) && scope === undefined && record?.id !== undefined;
        const reviewOptions = [...((isSource || isReturn || isSignal || isVoice) && record?.status === 'proposto' ? ['C  Confirmar vínculo'] : []),
          ...(isSource && record?.status === 'proposto' ? ['E  Corrigir fonte'] : []),
          ...(isVoice && record?.status === 'proposto' ? ['E  Corrigir proposta'] : []),
          ...(isSource && record?.status === 'confirmado' ? ['S  Substituir fonte'] : []),
          ...((isReturn || isSignal || isVoice) && record?.status === 'proposto' ? ['R  Rejeitar vínculo'] : []), ...((isReturn || isSignal) && record?.status === 'confirmado' ? ['V  Revogar vínculo'] : [])];
        screen('Cadastros', `${entry.title} - detalhe`, [...describe(record, '', entry.labels ?? labels), ...(hasChildren ? ['1  Ver registros relacionados'] : []), ...(canCorrectGlobal ? ['E  Corrigir cadastro global'] : []), ...(canRemoveMember ? ['R  Remover integrante', 'F  Adicionar função habitual', 'D  Remover função habitual'] : []), ...(canRemoveTeam ? ['R  Desassociar grupo', 'I  Incluir participante', 'D  Remover participante', 'P  Atribuir papel efetivo', 'E  Remover papel efetivo'] : []), ...(isInput ? ['R  Remover associação de entrada'] : []), ...reviewOptions, '0  Voltar']);
        const action = await ask('Escolha: ');
        if (action === null) return false;
        if (action === '0') break;
        if (action.toLowerCase() === 'e' && canCorrectGlobal) {
          if (!await correctGlobalRecord({ category: category, record, registry, screen, ask, write })) return false;
          break;
        }
        if (action.toLowerCase() === 'e' && isVoice && record.status === 'proposto') {
          if (!await correctVoice({ session: context, record, registry, screen, ask, write })) return false;
          break;
        }
        if (action.toLowerCase() === 'r' && isInput) {
          if (!await unbindInput({ session: context, record, registry, screen, ask, write })) return false;
          break;
        }
        if (action.toLowerCase() === 'e' && isSource && record.status === 'proposto') {
          if (!await correctSource({ session: context, record, registry, screen, ask, write })) return false;
          break;
        }
        if (action.toLowerCase() === 's' && isSource && record.status === 'confirmado') {
          if (!await replaceSource({ session: context, record, registry, screen, ask, write })) return false;
          break;
        }
        const assignmentAction = action.toLowerCase() === 'c' && (isSource || isReturn || isSignal || isVoice) && record.status === 'proposto' ? 'confirmar' :
          action.toLowerCase() === 'r' && (isReturn || isSignal || isVoice) && record.status === 'proposto' ? 'rejeitar' :
            action.toLowerCase() === 'v' && (isReturn || isSignal) && record.status === 'confirmado' ? 'revogar' : null;
        if (assignmentAction) {
          if (!await reviewAssignment({ session: context, record, type: isSource ? 'vinculo' : isReturn ? 'retorno' : isSignal ? 'ligacao' : 'voz', action: assignmentAction, registry, screen, ask, write })) return false;
          break;
        }
        if (action.toLowerCase() === 'r' && canRemoveTeam) {
          if (!await changeSessionTeam({ session: context, team: record, action: 'remover', registry, screen, ask, write })) return false;
          break;
        }
        if (['i', 'd'].includes(action.toLowerCase()) && canRemoveTeam) {
          if (!await changeSessionMember({ session: context, team: record, action: action.toLowerCase() === 'i' ? 'adicionar' : 'remover', registry, screen, ask, write })) return false;
          break;
        }
        if (['p', 'e'].includes(action.toLowerCase()) && canRemoveTeam) {
          if (!await changeSessionRole({ session: context, team: record, action: action.toLowerCase() === 'p' ? 'adicionar' : 'remover', registry, screen, ask, write })) return false;
          break;
        }
        if (action.toLowerCase() === 'r' && canRemoveMember) {
          if (!await removeTeamMember({ team: context, member: record, registry, screen, ask, write })) return false;
          break;
        }
        if (['f', 'd'].includes(action.toLowerCase()) && canRemoveMember) {
          if (!await changeTeamRole({ team: context, member: record, action: action.toLowerCase() === 'f' ? 'adicionar' : 'remover', registry, screen, ask, write })) return false;
          break;
        }
        if (action === '1' && hasChildren) {
          const children = entry.children === 'session' ? sessionScreens : teamScreens;
          if (!await menu('Registros relacionados', children, child => list(child, record.id, record))) return false;
        } else write('Opção inválida.');
      }
    }
  }
  return menu('Cadastros - consulta', screens, entry => list(entry));
}
