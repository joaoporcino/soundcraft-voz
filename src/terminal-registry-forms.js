import { terminalCatalog } from './terminal-catalog.js';
import { validateCatalogArguments, validateCatalogEntity } from './terminal-catalog-validation.js';

// Presentation metadata only; the existing registry command validates and saves the data.
function getForm(category) { return Object.hasOwn(terminalCatalog, category) ? terminalCatalog[category].create : undefined; }
export function hasCreateForm(category) { return Boolean(getForm(category)); }

export async function createRegistryRecord({ category, ask, screen, write, registry }) {
  const form = getForm(category), values = {};
  if (Object.hasOwn(terminalCatalog, category)) {
    try { validateCatalogEntity(category); } catch (error) { write(error.message); return true; }
  }
  screen('Cadastros', 'Novo registro', ['Preencha os campos; digite /cancelar para voltar.', 'Um campo obrigatório vazio também cancela.']);
  for (const field of form.fields) {
    for (;;) {
      const answer = await ask(`${field.label}${field.optional ? ' (opcional)' : ''}: `);
      if (answer === null) return false;
      if (answer.toLowerCase() === '/cancelar' || (!answer && !field.optional)) { write('Cadastro cancelado.'); return true; }
      if (answer && field.options && !field.options.includes(answer.toLowerCase())) { write('Opção inválida. Tente novamente.'); continue; }
      values[field.key] = answer;
      break;
    }
  }
  const summary = form.fields.map(field => `${field.label}: ${values[field.key] || 'não informado'}`);
  screen('Cadastros', 'Revisar novo registro', [...summary, 'Digite SIM para salvar.']);
  const confirm = await ask('Salvar? ');
  if (confirm === null) return false;
  if (confirm.toUpperCase() !== 'SIM') { write('Cadastro cancelado.'); return true; }
  const args = form.arguments(values);
  try {
    if (Object.hasOwn(terminalCatalog, category)) validateCatalogArguments(category, args);
    await registry(args, { output: () => {} });
    write('Registro salvo.');
  } catch (error) { write(`Não foi possível salvar: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
