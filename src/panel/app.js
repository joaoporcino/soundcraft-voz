const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get('token');
history.replaceState(null, '', location.pathname);
const $ = id => document.getElementById(id);
const feedback = $('feedback');
let current = null;

function message(text, error = false) { feedback.textContent = text; feedback.classList.toggle('error', error); }
async function api(url, options = {}) {
  if (!token) throw new Error('Abra o link gerado pelo comando painel no terminal.');
  const response = await fetch(url, { ...options, headers: { 'x-soundcraft-token': token,
    ...(options.body ? { 'content-type': 'application/json' } : {}) }, cache: 'no-store' });
  if (!response.ok) {
    let detail;
    try { detail = (await response.json()).error; } catch { /* resposta sem JSON */ }
    throw new Error(detail || `Serviço indisponível (${response.status}).`);
  }
  return response.json();
}
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };

async function review(action, type, item, values = {}) {
  try {
    await api('/painel/api/revisar', { method: 'POST', body: JSON.stringify({ sessao: current.sessao.id, acao: action,
      tipo: type, id: item.id, revisao: item.revisao, ...(type === 'ligacao' ? { origem: 'painel local' } : {}), ...values }) });
    await loadSession();
    message(action === 'confirmar' ? 'Revisão confirmada no cadastro. Confira o patch físico.' : action === 'corrigir' ? 'Proposta corrigida; revise novamente antes de confirmar.' : 'Proposta rejeitada.');
  } catch (error) { message(error.message, true); }
}

function buildProposal(type, item, notices) {
  const card = element('article', undefined, 'proposal');
  const header = element('div', undefined, 'proposal-head');
  header.append(element('h3', `${{ voz: 'Proposta por voz', vinculo: 'Vínculo de fonte', retorno: 'Retorno', ligacao: 'Ligação física' }[type]} #${item.id}`), element('span', 'Pendente', 'badge'));
  card.append(header);
  const details = type === 'voz' ? [`Frase: ${item.phrase}`, `Origem: ${item.origin}`, `Pessoa: ${item.personId ?? 'não identificada'}`, `Equipamento: ${item.equipmentId ?? 'não identificado'}`, `Canal: ${item.channel ?? 'desconhecido'}`]
    : Object.entries(item).filter(([key]) => !['revisao', 'status'].includes(key)).map(([key, value]) => `${key}: ${value ?? 'desconhecido'}`);
  const info = element('div', undefined, 'details');
  for (const line of details) info.append(element('div', line));
  card.append(info);
  if (notices?.length) card.append(element('p', notices.join(' · '), 'warning'));
  const actions = element('div', undefined, 'actions');
  const confirm = element('button', 'Confirmar'); confirm.type = 'button'; confirm.addEventListener('click', () => review('confirmar', type, item)); actions.append(confirm);
  if (type !== 'vinculo') {
    const reject = element('button', 'Rejeitar', 'reject'); reject.type = 'button'; reject.addEventListener('click', () => review('rejeitar', type, item)); actions.append(reject);
  }
  if (type === 'voz' || type === 'vinculo') {
    const edit = element('button', 'Corrigir', 'reject'); edit.type = 'button';
    edit.addEventListener('click', () => {
      if (card.querySelector('.edit-fields')) return;
      const fields = element('div', undefined, 'edit-fields');
      const inputs = {};
      for (const [key, label, initial] of [['pessoa', 'ID da pessoa', item.personId], ['equipamento', 'ID do equipamento', item.equipmentId], ['canal', 'Canal', item.channel]]) {
        const wrapper = element('label', label); const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.value = initial ?? ''; wrapper.append(input); fields.append(wrapper); inputs[key] = input;
      }
      const save = element('button', 'Salvar correção'); save.type = 'button';
      save.addEventListener('click', () => {
        const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value ? Number(input.value) : null]));
        if (Object.values(values).some(value => value !== null && (!Number.isSafeInteger(value) || value < 1))) { message('Informe IDs positivos ou deixe o campo vazio.', true); return; }
        void review('corrigir', type, item, values);
      });
      card.append(fields, save);
    });
    actions.append(edit);
  }
  card.append(actions);
  return card;
}

function list(id, items, describe) {
  const target = $(id); target.replaceChildren();
  if (!items.length) target.append(element('li', 'Nenhum cadastro.'));
  for (const item of items) target.append(element('li', describe(item)));
}
async function loadSession() {
  const selected = $('session').value;
  if (!selected) {
    current = null;
    $('session-name').textContent = 'Nenhuma sessão';
    $('pending-count').textContent = '—';
    $('people-count').textContent = '0'; $('equipment-count').textContent = '0';
    $('people').replaceChildren(); $('equipment').replaceChildren();
    const empty = element('div', undefined, 'empty');
    empty.append(element('strong', 'Selecione uma sessão'), element('p', 'As propostas aguardando revisão aparecerão aqui.'));
    $('proposals').replaceChildren(empty);
    return;
  }
  current = await api(`/painel/api/passagem?sessao=${encodeURIComponent(selected)}`);
  $('session-name').textContent = current.sessao.name;
  $('pending-count').textContent = String(current.pendencias.length);
  $('people-count').textContent = String(current.pessoas.length);
  $('equipment-count').textContent = String(current.equipamentos.length);
  list('people', current.pessoas, item => `${item.name} · #${item.id}`);
  list('equipment', current.equipamentos, item => `${item.name} · ${item.kind} · #${item.id}`);
  const area = $('proposals'); area.replaceChildren();
  const groups = { voz: current.propostasVoz, vinculo: current.vinculos, retorno: current.vinculosRetorno, ligacao: current.ligacoes };
  for (const pending of current.pendencias) {
    const item = groups[pending.tipo]?.find(candidate => candidate.id === pending.id);
    if (item) area.append(buildProposal(pending.tipo, item, pending.avisos));
  }
  if (!area.children.length) { const empty = element('div', undefined, 'empty'); empty.append(element('strong', 'Tudo revisado por aqui'), element('p', 'Não há propostas pendentes nesta sessão.')); area.append(empty); }
}
async function refresh() {
  try {
    const [status, sessions] = await Promise.all([api('/status'), api('/painel/api/sessoes')]);
    $('connection').textContent = status.mixer.connected ? 'Conectada' : 'Desconectada';
    $('connection-detail').textContent = status.mixer.appliedIp || 'Endereço não configurado';
    $('mode').textContent = { paused: 'Pausado', passage: 'Passagem', worship: 'Culto' }[status.commands.mode] || 'Indisponível';
    const selected = $('session').value;
    $('session').replaceChildren(new Option('Selecione…', ''));
    for (const session of sessions) $('session').append(new Option(session.name, session.id));
    if (sessions.some(session => String(session.id) === selected)) $('session').value = selected;
    await loadSession();
    message('');
  } catch (error) { message(error.message, true); }
}
$('session').addEventListener('change', () => { void loadSession().catch(error => message(error.message, true)); });
$('refresh').addEventListener('click', () => { void refresh(); });
void refresh();
