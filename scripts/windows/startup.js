import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK_NAME = 'SoundcraftLocalService';
const MARKER = 'Managed by Soundcraft local service startup v1';
const here = path.dirname(fileURLToPath(import.meta.url));

function ps(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function taskIdentity({ node, cli }) {
  return {
    name: TASK_NAME,
    marker: MARKER,
    execute: node,
    cli,
    arguments: `"${cli}" start`,
  };
}

function powershellExecutor(_operation, script) {
  return execFileSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script),
  ], { encoding: 'utf8', windowsHide: true }).trim();
}

function scriptsFor(identity) {
  const id = identity;
  const common = `
$ErrorActionPreference = 'Stop'
$taskName = ${ps(id.name)}
$marker = ${ps(id.marker)}
$expectedExecute = ${ps(id.execute)}
$expectedArguments = ${ps(id.arguments)}
function Get-ManagedTask {
  $task = Get-ScheduledTask -TaskPath '\\' -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) { return $null }
  $info = Get-ScheduledTaskInfo -TaskPath '\\' -TaskName $taskName -ErrorAction SilentlyContinue
  $owned = ($task.Description -eq $marker) -and ($task.Actions.Count -eq 1) -and
    ($task.Actions[0].Execute -eq $expectedExecute) -and
    ($task.Actions[0].Arguments -eq $expectedArguments)
  return [pscustomobject]@{ Task = $task; Info = $info; Owned = $owned }
}`;

  return {
    status: `${common}
$found = Get-ManagedTask
if (-not $found) { @{ status = 'absent' } | ConvertTo-Json -Compress; exit 0 }
if (-not $found.Owned) { @{ status = 'conflict' } | ConvertTo-Json -Compress; exit 0 }
$result = @{ status = [string]$found.Task.State; lastRunTime = $null; nextRunTime = $null; lastTaskResult = $null; missedRuns = $null }
if ($null -ne $found.Info) {
  $result.lastRunTime = [string]$found.Info.LastRunTime
  $result.nextRunTime = [string]$found.Info.NextRunTime
  $result.lastTaskResult = $found.Info.LastTaskResult
  $result.missedRuns = $found.Info.NumberOfMissedRuns
}
$result | ConvertTo-Json -Compress`,
    install: `${common}
$found = Get-ManagedTask
if ($found) {
  if (-not $found.Owned) { throw 'Já existe uma tarefa com esse nome que não pertence ao Soundcraft; nada foi alterado.' }
  'already-installed'; exit 0
}
$action = New-ScheduledTaskAction -Execute $expectedExecute -Argument $expectedArguments -WorkingDirectory ${ps(path.dirname(id.cli))}
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $marker
Register-ScheduledTask -TaskPath '\\' -TaskName $taskName -InputObject $task | Out-Null
'installed'`,
    uninstall: `${common}
$found = Get-ManagedTask
if (-not $found) { 'already-absent'; exit 0 }
if (-not $found.Owned) { throw 'A tarefa existente não corresponde à identidade Soundcraft; nada foi removido.' }
Unregister-ScheduledTask -TaskPath '\\' -TaskName $taskName -Confirm:$false
'removed'`,
  };
}

export async function runWindowsStartup(command, {
  root = path.resolve(here, '..', '..'),
  executor = powershellExecutor,
  platform = process.platform,
  node = process.execPath,
} = {}) {
  if (platform !== 'win32') throw new Error('A inicialização agendada está disponível somente no Windows.');
  if (!['install', 'status', 'uninstall'].includes(command)) {
    throw new Error('Uso: node scripts/windows/startup.js <install|status|uninstall>');
  }
  const identity = taskIdentity({ node, cli: path.resolve(root, 'src', 'local-service-cli.js') });
  const output = await executor(command, scriptsFor(identity)[command]);
  if (command === 'status') {
    try { return JSON.parse(output); }
    catch { throw new Error('Resposta inválida do Agendador de Tarefas.'); }
  }
  return { status: String(output).trim() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runWindowsStartup(process.argv[2]);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Erro na inicialização do Windows: ${error.message}`);
    process.exitCode = 1;
  }
}
