import test from 'node:test';
import assert from 'node:assert/strict';
import { runWindowsStartup } from '../scripts/windows/startup.js';

const fixture = (command, executor, extra = {}) => runWindowsStartup(command, {
  root: 'C:\\Sound Craft\\App',
  node: 'C:\\Program Files\\nodejs\\node.exe',
  platform: 'win32',
  executor,
  ...extra,
});

test('install gera tarefa de logon oculta e limitada sem sobrescrever', async () => {
  let calls = 0;
  const result = await fixture('install', async (operation, script) => {
    calls += 1;
    assert.equal(operation, 'install');
    assert.match(script, /New-ScheduledTaskTrigger -AtLogOn/);
    assert.match(script, /-RunLevel Limited/);
    assert.match(script, /New-ScheduledTaskSettingsSet -Hidden/);
    assert.match(script, /Register-ScheduledTask -TaskPath '\\' -TaskName \$taskName -InputObject \$task/);
    assert.doesNotMatch(script, /Register-ScheduledTask[^\n]*-Force/);
    assert.ok(script.includes("$expectedExecute = 'C:\\Program Files\\nodejs\\node.exe'"));
    assert.ok(script.includes('$expectedArguments = \'"C:\\Sound Craft\\App\\src\\local-service-cli.js" start\''));
    return 'installed';
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: 'installed' });
});

test('status interpreta resposta estruturada do executor simulado', async () => {
  const result = await fixture('status', async (operation, script) => {
    assert.equal(operation, 'status');
    assert.match(script, /Managed by Soundcraft local service startup v1/);
    assert.match(script, /\$null -ne \$found\.Info/);
    assert.match(script, /lastTaskResult = \$null/);
    assert.match(script, /\$found\.Info\.LastTaskResult/);
    assert.match(script, /\$found\.Info\.NumberOfMissedRuns/);
    return JSON.stringify({ status: 'Ready', lastRunTime: '01/01/2026', nextRunTime: null, lastTaskResult: 1, missedRuns: 2 });
  });
  assert.deepEqual(result, { status: 'Ready', lastRunTime: '01/01/2026', nextRunTime: null, lastTaskResult: 1, missedRuns: 2 });
});

test('status informa respostas inválidas sem executar outra operação', async () => {
  let calls = 0;
  await assert.rejects(fixture('status', async () => { calls += 1; return 'erro'; }), /Resposta inválida/);
  assert.equal(calls, 1);
});

test('uninstall só remove depois de verificar marcador e ação exata', async () => {
  const result = await fixture('uninstall', async (operation, script) => {
    assert.equal(operation, 'uninstall');
    assert.match(script, /if \(-not \$found\.Owned\) \{ throw/);
    assert.match(script, /Unregister-ScheduledTask -TaskPath '\\' -TaskName \$taskName -Confirm:\$false/);
    assert.match(script, /\$task\.Description -eq \$marker/);
    assert.match(script, /\$task\.Actions\[0\]\.Execute -eq \$expectedExecute/);
    assert.match(script, /\$task\.Actions\[0\]\.Arguments -eq \$expectedArguments/);
    return 'removed';
  });
  assert.deepEqual(result, { status: 'removed' });
});

test('comandos inválidos e plataformas não Windows não chamam executor', async () => {
  let calls = 0;
  const executor = async () => { calls += 1; return ''; };
  await assert.rejects(fixture('start', executor), /Uso:/);
  await assert.rejects(fixture('status', executor, { platform: 'linux' }), /somente no Windows/);
  assert.equal(calls, 0);
});

test('caminho absoluto do serviço é derivado da raiz, mesmo com espaços', async () => {
  let captured;
  await fixture('install', async (_operation, script) => { captured = script; return 'installed'; });
  assert.ok(captured.includes("$expectedArguments = '\"C:\\Sound Craft\\App\\src\\local-service-cli.js\" start'"));
});
