import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { runRegistryCommand } from '../src/registry-cli.js';

const directories = new Set();

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundcraft-registry-cli-'));
  directories.add(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all([...directories].map((directory) => rm(directory, { recursive: true, force: true })));
  directories.clear();
});

async function command(directory, ...args) {
  const lines = [];
  await runRegistryCommand(args, { directory, output: (line) => lines.push(line) });
  const json = lines.find((line) => line.startsWith('{') || line.startsWith('['));
  return { lines, value: json === undefined ? undefined : JSON.parse(json) };
}

test('ajuda não cria diretório nem banco', async () => {
  const directory = path.join(os.tmpdir(), `soundcraft-registry-help-${process.pid}-${Date.now()}`);
  const lines = [];
  await runRegistryCommand(['ajuda'], { directory, output: (line) => lines.push(line) });
  assert.match(lines[0], /pessoa adicionar/);
  assert.match(lines[0], /--sem-fio\|--com-fio/);
  await assert.rejects(readdir(directory), { code: 'ENOENT' });
});

test('cadastra e consulta dados persistidos pelo SQLite, sem equipamento físico', async () => {
  const directory = await temporaryDirectory();
  const person = (await command(directory, 'pessoa', 'adicionar', 'Ana Luz')).value;
  const sameName = (await command(directory, 'pessoa', 'adicionar', 'Ana Luz')).value;
  assert.notEqual(person.id, sameName.id, 'nomes não são identificadores únicos');

  const equipment = (await command(directory, 'equipamento', 'adicionar', 'Microfone amarelo', 'microfone', 'amarelo')).value;
  assert.equal(equipment.wireless, null, 'característica não informada permanece desconhecida');
  const anotherEquipment = (await command(directory, 'equipamento', 'adicionar', 'Microfone amarelo', 'microfone', 'amarelo')).value;
  assert.notEqual(equipment.id, anotherEquipment.id, 'cores e nomes podem se repetir');
  const filtered = (await command(directory, 'equipamento', 'listar', 'amarelo')).value;
  assert.equal(filtered.length, 2);

  const session = (await command(directory, 'sessao', 'criar', 'Ensaio de sábado')).value;
  const proposal = (await command(directory, 'vinculo', 'propor', String(session.id), String(person.id), String(equipment.id), '7')).value;
  assert.equal(proposal.status, 'proposto');
  assert.equal(proposal.channel, 7);
  const confirmed = (await command(directory, 'vinculo', 'confirmar', String(proposal.id))).value;
  assert.equal(confirmed.status, 'confirmado');

  const people = (await command(directory, 'pessoa', 'listar')).value;
  assert.equal(people.length, 2, 'cadastros sobrevivem a invocações separadas');
  const assignments = (await command(directory, 'vinculo', 'listar', String(session.id))).value;
  assert.equal(assignments[0].status, 'confirmado');
});

test('aceita características explícitas do equipamento sem inferi-las', async () => {
  const directory = await temporaryDirectory();
  const wireless = (await command(directory, 'equipamento', 'adicionar', 'Sem fio', 'microfone', '--sem-fio', '--capsula', 'condensadora', '--modelo', 'Modelo X')).value;
  const wired = (await command(directory, 'equipamento', 'adicionar', 'Com fio', 'microfone', 'azul', '--com-fio')).value;
  assert.equal(wireless.wireless, true);
  assert.equal(wireless.capsule, 'condensadora');
  assert.equal(wireless.model, 'Modelo X');
  assert.equal(wired.wireless, false);
  assert.equal(wired.color, 'azul');
});

test('rejeita argumentos e IDs inválidos antes de acessar o banco', async () => {
  const directory = await temporaryDirectory();
  await assert.rejects(command(directory, 'vinculo', 'propor', '0', '1', '1'), /ID da sessão/);
  await assert.rejects(command(directory, 'vinculo', 'propor', '1', '1', '1', '25'), /Canal/);
  await assert.rejects(command(directory, 'equipamento', 'adicionar', 'Mic', 'microfone', '--sem-fio', '--com-fio'), /apenas uma opção/);
  await assert.rejects(command(directory, 'equipamento', 'adicionar', 'Mic', 'microfone', '--capsula'), /valor após --capsula/);
  await assert.rejects(command(directory, 'pessoa', 'adicionar'), /Uso:/);
  await assert.rejects(command(directory, 'nao-existe'), /Comando desconhecido/);
  assert.deepEqual(await readdir(directory), []);
});

test('exibe erro de conflito ao confirmar canal já ocupado', async () => {
  const directory = await temporaryDirectory();
  const firstPerson = (await command(directory, 'pessoa', 'adicionar', 'Pessoa A')).value;
  const secondPerson = (await command(directory, 'pessoa', 'adicionar', 'Pessoa B')).value;
  const equipmentA = (await command(directory, 'equipamento', 'adicionar', 'Microfone A', 'microfone')).value;
  const equipmentB = (await command(directory, 'equipamento', 'adicionar', 'Microfone B', 'microfone')).value;
  const session = (await command(directory, 'sessao', 'criar', 'Culto')).value;
  const first = (await command(directory, 'vinculo', 'propor', `${session.id}`, `${firstPerson.id}`, `${equipmentA.id}`, '3')).value;
  const second = (await command(directory, 'vinculo', 'propor', `${session.id}`, `${secondPerson.id}`, `${equipmentB.id}`, '3')).value;
  await command(directory, 'vinculo', 'confirmar', `${first.id}`);
  await assert.rejects(command(directory, 'vinculo', 'confirmar', `${second.id}`), /conflito|ocupad|já confirmado/i);
});
