import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { URL, URLSearchParams } from 'node:url';
import { setImmediate } from 'node:timers';

class Node {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.className = ''; this.classList = { toggle() {} }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector(selector) { return this.children.find(child => `.${child.className}` === selector) ?? null; }
  click() { this.listeners.click?.(); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('interface revisa propostas em DOM simulado sem interpretar conteúdo como HTML', async () => {
  const ids = ['feedback', 'connection', 'connection-detail', 'mode', 'session', 'session-name', 'pending-count',
    'people-count', 'equipment-count', 'people', 'equipment', 'proposals', 'refresh'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const entry = { id: 1, sessionId: 1, phrase: '<img onerror=alert(1)>', origin: 'principal', personId: null,
    equipmentId: null, channel: null, status: 'proposto', assignmentId: null, revisao: 'a'.repeat(64) };
  const calls = [];
  const context = { document: { getElementById: id => nodes[id], createElement: tag => new Node(tag) },
    location: { hash: '#token=capacidade', pathname: '/painel/' }, history: { replaceState: (...args) => calls.push(['history', ...args]) },
    URLSearchParams, Option: class extends Node { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
    fetch: async (url, options = {}) => {
      calls.push([url, options]);
      if (url === '/status') return { ok: true, json: async () => ({ mixer: { connected: true, appliedIp: '192.0.2.1' }, commands: { mode: 'passage' } }) };
      if (url === '/painel/api/sessoes') return { ok: true, json: async () => ([{ id: 1, name: 'Ensaio' }]) };
      if (url.startsWith('/painel/api/passagem')) return { ok: true, json: async () => ({ sessao: { id: 1, name: 'Ensaio' },
        pessoas: [], equipamentos: [], propostasVoz: [entry], vinculos: [], vinculosRetorno: [], ligacoes: [],
        pendencias: entry.status === 'proposto' ? [{ tipo: 'voz', id: 1, avisos: [] }] : [] }) };
      if (url === '/painel/api/revisar') {
        const action = JSON.parse(options.body);
        if (action.acao === 'corrigir') {
          entry.personId = action.pessoa; entry.equipmentId = action.equipamento; entry.channel = action.canal; entry.revisao = 'b'.repeat(64);
        } else entry.status = action.acao === 'confirmar' ? 'confirmado' : 'rejeitado';
        return { ok: true, json: async () => entry };
      }
      throw Error(`URL inesperada: ${url}`);
    },
  };
  const source = await readFile(new URL('../src/panel/app.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, context);
  await tick(); await tick();
  assert.equal(nodes.connection.textContent, 'Conectada');
  assert.deepEqual(calls[0], ['history', null, '', '/painel/']);
  nodes.session.value = '1'; nodes.session.listeners.change();
  await tick(); await tick();
  const card = nodes.proposals.children[0];
  assert.equal(card.children[1].children[0].textContent, 'Frase: <img onerror=alert(1)>');
  const actions = card.children.find(child => child.className === 'actions');
  actions.children.find(button => button.textContent === 'Corrigir').click();
  const fields = card.children.find(child => child.className === 'edit-fields');
  fields.children.forEach((label, index) => { label.children[0].value = String(index + 1); });
  card.children.find(button => button.textContent === 'Salvar correção').click();
  await tick(); await tick(); await tick();
  const correction = calls.find(call => call[0] === '/painel/api/revisar');
  assert.equal(JSON.parse(correction[1].body).revisao, 'a'.repeat(64));
  assert.equal(JSON.parse(correction[1].body).pessoa, 1);
  const confirmedCard = nodes.proposals.children[0];
  confirmedCard.children.find(child => child.className === 'actions').children.find(button => button.textContent === 'Confirmar').click();
  await tick(); await tick(); await tick();
  assert.equal(entry.status, 'confirmado');
  assert.equal(JSON.parse(calls.filter(call => call[0] === '/painel/api/revisar').at(-1)[1].body).revisao, 'b'.repeat(64));
  entry.status = 'proposto';
  nodes.session.listeners.change(); await tick(); await tick();
  nodes.proposals.children[0].children.find(child => child.className === 'actions').children.find(button => button.textContent === 'Rejeitar').click();
  await tick(); await tick(); await tick();
  assert.equal(nodes.feedback.textContent, 'Proposta rejeitada.');
  assert.equal(nodes.proposals.children[0].children[0].textContent, 'Tudo revisado por aqui');
});
