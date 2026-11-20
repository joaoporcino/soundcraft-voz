# Roteiro de ensaio local isolado

Este roteiro prepara um ensaio com dados fictícios, sem mesa, microfone ou provedor. O [plano](plano-de-execucao.md) separa os testes automatizados da validação no computador da igreja. O [README](../README.md) contém instalação e referência completa dos comandos.

## Preparar

Use Windows com Node.js 22.13 ou superior e as dependências Node instaladas com `npm install`, conforme o README. Python e as dependências de áudio são necessários apenas para voz real; este roteiro não inicia o worker. Abra um PowerShell na pasta do projeto e crie uma área isolada para o exercício:

```powershell
$pilotRoot = Join-Path $env:TEMP ("sc-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $pilotRoot | Out-Null
$previousSoundcraftConfig = $env:SOUNDCRAFT_CONFIG_DIR
$env:SOUNDCRAFT_CONFIG_DIR = Join-Path $pilotRoot 'dados'
```

Mantenha essa janela aberta: a variável vale apenas para os processos iniciados nela. O aplicativo normal usa o diretório local do usuário descrito no README; não substitua seus dados reais pelos dados deste exercício. O Node pode mostrar aviso de API SQLite experimental.

## Cadastros e revisão

Use apenas nomes fictícios. Os IDs mostrados dependem do banco; os exemplos abaixo pressupõem uma área nova e os primeiros IDs iguais a 1. Confira os resultados antes de continuar.

```powershell
npm start -- --cadastro pessoa adicionar "Pessoa Exemplo"
npm start -- --cadastro equipamento adicionar "Microfone Exemplo" microfone azul
npm start -- --cadastro sessao criar "Ensaio Exemplo"
npm start -- --cadastro aux-config definir 8
npm start -- --cadastro retorno adicionar 1 2
npm start -- --cadastro vinculo propor 1 1 1 3
npm start -- --cadastro passagem mostrar 1
```

Confira a proposta, a sessão e os avisos. Para confirmar pelo CLI, copie a revisão exibida por `passagem mostrar` e execute `npm start -- --cadastro passagem confirmar 1 vinculo 1 REVISAO`, substituindo `REVISAO` pelo valor apresentado. Também é possível usar o menu interativo descrito no README, selecionar a sessão e revisar o vínculo. A confirmação é de cadastro: não comprova conexão, patch ou áudio.

## Backup e recuperação isolada

```powershell
$backup = Join-Path $pilotRoot 'backup.json'
$restore = Join-Path $pilotRoot 'restaurado'
npm start -- --exportar-backup $backup
npm start -- --restaurar-backup $backup --destino $restore
```

A restauração exige destino novo ou vazio e não ativa os dados recuperados. Uma falha de abertura do banco auxiliar em caminho longo no sandbox foi corrigida e o mesmo ensaio passou depois; outros caminhos e sistemas não foram exaustivamente validados. Confira que a restauração terminou antes de consultar o destino. Para conferir os dados em outro processo, aponte temporariamente a variável para o destino restaurado e liste os registros:

```powershell
$env:SOUNDCRAFT_CONFIG_DIR = $restore
npm start -- --cadastro pessoa listar
npm start -- --cadastro vinculo listar 1
if ($null -eq $previousSoundcraftConfig) { Remove-Item Env:SOUNDCRAFT_CONFIG_DIR }
else { $env:SOUNDCRAFT_CONFIG_DIR = $previousSoundcraftConfig }
```

O backup pode conter nomes; proteja-o e descarte a área de exercício conforme a política local. Os comandos não restauram sobre a instalação ativa.

## Serviço e mesa simulados

`npm run simulador` abre uma mesa simulada em loopback e informa o endereço e o comando para conectar outro terminal. Use apenas o endereço exibido pelo simulador e leia a seção “Mesa simulada no terminal” no README. O simulador não emite áudio e o envio à biblioteca não comprova aplicação em uma Ui24R. A suíte inclui um teste do menu pelo serviço HTTP local com mesa simulada; os resultados estão no plano. A opção legada `--live` envia diretamente ao destino informado e tem comportamento distinto do fluxo com confirmação do serviço.

## Antes de uso real

Não instalar tarefa de inicialização, gravar áudio, ligar à mesa ou chamar provedor pago como parte deste roteiro. A lista [suas pendências](suas-pendencias.md) registra validação do CMD no computador da igreja, backup e recuperação, dispositivo, USB, mesa, técnico, reinício, segurança e decisões ainda necessárias. O ensaio com dados fictícios e testes automatizados não conclui o piloto físico.
