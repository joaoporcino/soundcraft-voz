import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('modo texto simula comando sem iniciar Python', { timeout: 5000 }, async (t) => {
  const child = spawn(process.execPath, ['src/index.js', '--texto', '--python', 'python-inexistente'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = '';
  let prompts = 0;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    output += chunk;
    const count = (output.match(/Digite o comando/g) || []).length;
    if (count > prompts) {
      prompts = count;
      child.stdin.write(count === 1 ? 'mute canal 3\n' : 'sair\n');
    }
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.match(output, /Mutar canal 3/);
  assert.match(output, /Simulação concluída/);
});

test('falha de inicialização da voz é informada sem aguardar comando', { timeout: 5000 }, async (t) => {
  const child = spawn(process.execPath, ['src/index.js', '--python', 'python-inexistente-soundcraft'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const [code] = await once(child, 'close');
  assert.notEqual(code, 0);
  assert.match(errors, /Erro:/);
  assert.doesNotMatch(output, /Enter para gravar/);
});

test('EOF no prompt encerra sem promessa pendente', { timeout: 5000 }, async (t) => {
  const child = spawn(process.execPath, ['src/index.js', '--texto'], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  child.stdout.once('data', () => child.stdin.end());
  const [code] = await once(child, 'close');
  assert.equal(code, 0);
  assert.doesNotMatch(errors, /unsettled|Warning/i);
});

test('Python ausente na listagem é tratado sem erro não capturado', { timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ['src/index.js', '--listar-dispositivos', '--python', 'python-inexistente-auditoria'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const [code] = await once(child, 'close');
  assert.notEqual(code, 0);
  assert.match(errors, /Erro ao iniciar Python/);
  assert.doesNotMatch(errors, /Unhandled|stack/i);
});

test('SIGINT durante pergunta encerra o processo e limpa recursos', { timeout: 5000 }, async (t) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', "process.argv = ['node', 'src/index.js', '--texto']; setTimeout(() => process.emit('SIGINT'), 500); await import('./src/index.js');"], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0);
  assert.doesNotMatch(errors, /unsettled|Warning/i);
});
