import { createRegistryRecord } from './terminal-registry-forms.js';
import { soundcheckRevision } from './soundcheck-review.js';
import { validateCatalogEntity, validateCatalogRecords } from './terminal-catalog-validation.js';
import { terminalCatalog } from './terminal-catalog.js';

export async function queryRegistryList(registry, args) {
  const catalogCategory = Object.hasOwn(terminalCatalog, args[0]) && args[1] === 'listar' ? args[0] : null;
  if (catalogCategory) validateCatalogEntity(catalogCategory);
  const output = [];
  await registry(args, { output: value => output.push(value) });
  if (output.length !== 1) throw Error('Resposta de cadastro inesperada.');
  const records = JSON.parse(output[0]);
  if (!Array.isArray(records)) throw Error('Lista de cadastro inválida.');
  if (catalogCategory) validateCatalogRecords(catalogCategory, records);
  return records;
}

const label = (item, kind) => kind === 'fisico-dispositivo' ? `${item.name} (ID ${item.id}; ${item.type})` : kind !== 'equipamento' ? `${item.name} (ID ${item.id})` :
  `${item.name} (ID ${item.id}; ${item.kind}; cor: ${item.color ?? 'não informada'}; modelo: ${item.model ?? 'não informado'}; sem fio: ${item.wireless === null ? 'não informado' : item.wireless ? 'sim' : 'não'})`;

export async function selectReference({ kind, registry, screen, ask, write, filter = () => true, allowUnknown = false }) {
  let search = '', page = 0;
  for (;;) {
    const records = await queryRegistryList(registry, [kind, 'listar']);
    const filtered = records.filter(item => filter(item) && label(item, kind).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
    const size = 8, pages = Math.max(1, Math.ceil(filtered.length / size));
    page = Math.min(page, pages - 1);
    const shown = filtered.slice(page * size, page * size + size);
    screen('Cadastros', `Selecionar ${kind}`, [
      ...(shown.length ? shown.map((item, index) => `${index + 1}  ${label(item, kind)}`) : ['Nenhum registro encontrado.']),
      `Página ${page + 1} de ${pages} | Busca: ${search || 'nenhuma'}`,
      `Número: selecionar | B: buscar | P: próxima | A: anterior | N: novo${allowUnknown ? ' | D: desconhecido' : ''} | 0: voltar`,
    ]);
    const answer = await ask('Escolha: ');
    if (answer === null) return { eof: true };
    if (answer === '0') return {};
    if (allowUnknown && answer.toLowerCase() === 'd') return { unknown: true };
    if (answer.toLowerCase() === 'b') {
      const value = await ask('Buscar (vazio limpa): ');
      if (value === null) return { eof: true };
      search = value; page = 0; continue;
    }
    if (answer.toLowerCase() === 'p') { if (page + 1 < pages) page++; continue; }
    if (answer.toLowerCase() === 'a') { if (page) page--; continue; }
    if (answer.toLowerCase() === 'n') {
      if (!await createRegistryRecord({ category: kind, registry, screen, ask, write })) return { eof: true };
      search = ''; page = 0; continue;
    }
    const index = Number(answer) - 1;
    if (!/^\d+$/u.test(answer) || !shown[index]) { write('Registro inválido.'); continue; }
    return { record: shown[index] };
  }
}

export async function proposeSource({ session, registry, screen, ask, write }) {
  try {
    const person = await selectReference({ kind: 'pessoa', registry, screen, ask, write });
    if (person.eof) return false;
    if (!person.record) return true;
    const equipment = await selectReference({ kind: 'equipamento', registry, screen, ask, write });
    if (equipment.eof) return false;
    if (!equipment.record) return true;
    let channel;
    for (;;) {
      channel = await ask('Canal declarado de 1 a 24 (Enter desconhecido, /cancelar volta): ');
      if (channel === null) return false;
      if (channel.toLowerCase() === '/cancelar') return true;
      if (!channel || (/^\d+$/u.test(channel) && Number(channel) >= 1 && Number(channel) <= 24)) break;
      write('Canal inválido.');
    }
    screen('Cadastros', 'Revisar proposta de fonte', [
      `Sessão: ${session.name} (ID ${session.id})`, `Pessoa: ${label(person.record, 'pessoa')}`,
      `Equipamento: ${label(equipment.record, 'equipamento')}`, `Canal: ${channel || 'desconhecido'}`,
      'A proposta não confirma ligação física. Digite SIM para propor.',
    ]);
    const confirm = await ask('Propor? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Proposta cancelada.'); return true; }
    for (const [kind, selected] of [['sessao', session], ['pessoa', person.record], ['equipamento', equipment.record]]) {
      const current = (await queryRegistryList(registry, [kind, 'listar'])).find(item => item.id === selected.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(selected)) {
        write('Cadastro alterado ou removido. Atualize e revise a proposta novamente.');
        return true;
      }
    }
    await registry(['vinculo', 'propor-revisado', String(session.id), String(person.record.id), String(equipment.record.id), channel || 'desconhecido',
      soundcheckRevision('sessao', session), soundcheckRevision('pessoa', person.record), soundcheckRevision('equipamento', equipment.record)], { output: () => {} });
    write('Vínculo proposto; confirmação é uma ação posterior.');
  } catch (error) { write(`Não foi possível propor: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
