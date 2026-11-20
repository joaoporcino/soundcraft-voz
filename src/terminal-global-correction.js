import { passage } from './terminal-assignment-review.js';
import { selectReference } from './terminal-source-proposal.js';
import { validateCatalogEntity, validateCatalogRecords } from './terminal-catalog-validation.js';

export async function correctGlobalRecord({ category, record, registry, screen, ask, write }) {
  try {
    validateCatalogEntity(category);
    const selected = await selectReference({ kind: 'sessao', registry, screen, ask, write });
    if (selected.eof) return false;
    if (!selected.record) return true;
    const session = selected.record;
    const data = await passage(registry, session.id);
    const current = (category === 'pessoa' ? data.pessoas : data.equipamentos).find(item => item.id === record.id);
    if (!current) { write('Cadastro não encontrado. Atualize a lista.'); return true; }
    const { revisao, ...fields } = current;
    validateCatalogRecords(category, [fields]);
    screen('Cadastros', 'Corrigir cadastro global', [
      'Esta alteração afeta o cadastro global e pode afetar outras sessões.',
      `Atual: ${current.name} (ID ${current.id})`, 'Digite /cancelar ou deixe campo obrigatório vazio para voltar.',
    ]);
    const name = await ask('Novo nome: ');
    if (name === null) return false;
    if (!name || name.toLowerCase() === '/cancelar') return true;
    const values = { name };
    if (category === 'equipamento') {
      for (const [key, prompt, optional] of [['kind', 'Novo tipo: ', false], ['color', 'Nova cor (Enter desconhecida): ', true],
        ['wireless', 'Sem fio: 1 sim | 2 não | Enter desconhecido: ', true], ['capsule', 'Nova cápsula (Enter desconhecida): ', true], ['model', 'Novo modelo (Enter desconhecido): ', true]]) {
        const value = await ask(prompt);
        if (value === null) return false;
        if (value.toLowerCase() === '/cancelar' || (!value && !optional)) return true;
        if (key === 'wireless' && value && !['1', '2'].includes(value)) { write('Opção inválida.'); return true; }
        if (optional && key !== 'wireless' && value.toLowerCase() === 'desconhecido') { write('Use Enter para valor desconhecido; esta palavra é reservada pelo comando.'); return true; }
        values[key] = value;
      }
    }
    screen('Cadastros', 'Revisar correção global', [
      `Sessão de revisão: ${session.name} (ID ${session.id})`, `Atual: ${current.name} (ID ${current.id})`,
      ...(category === 'equipamento' ? [`Atual — tipo: ${current.kind}; cor: ${current.color ?? 'desconhecida'}; sem fio: ${current.wireless === null ? 'desconhecido' : current.wireless ? 'sim' : 'não'}; cápsula: ${current.capsule ?? 'desconhecida'}; modelo: ${current.model ?? 'desconhecido'}`] : []),
      `Novo nome: ${values.name}`, ...(category === 'equipamento' ? [`Tipo: ${values.kind}`, `Cor: ${values.color || 'desconhecida'}`,
        `Sem fio: ${values.wireless === '1' ? 'sim' : values.wireless === '2' ? 'não' : 'desconhecido'}`,
        `Cápsula: ${values.capsule || 'desconhecida'}`, `Modelo: ${values.model || 'desconhecido'}`] : []),
      'A alteração é global e será registrada no histórico. Digite SIM para corrigir.',
    ]);
    const confirm = await ask('Corrigir? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Correção cancelada.'); return true; }
    const args = ['passagem', 'corrigir', String(session.id), category, String(current.id), revisao, values.name];
    if (category === 'equipamento') args.push(values.kind, values.color || 'desconhecido', values.wireless === '1' ? 'sim' : values.wireless === '2' ? 'nao' : 'desconhecido', values.capsule || 'desconhecido', values.model || 'desconhecido');
    await registry(args, { output: () => {} });
    write('Cadastro global corrigido; histórico registrado.');
  } catch (error) { write(`Não foi possível corrigir o cadastro: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
