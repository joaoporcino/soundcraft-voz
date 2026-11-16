# Soundcraft por voz

Protótipo local de controle da Soundcraft Ui24R por voz em português. O microfone grava um comando de cinco segundos, o faster-whisper transcreve e o programa interpreta a ação. No modo real, comandos reconhecidos são enviados imediatamente. A biblioteca comunitária [soundcraft-ui-connection](https://github.com/fmalcher/soundcraft-ui) controla a mesa; não é uma biblioteca oficial da Soundcraft.

A visão futura, a arquitetura proposta e os diagramas das entidades estão em [docs/arquitetura.md](docs/arquitetura.md). O documento distingue as funcionalidades planejadas das já disponíveis neste protótipo.

O andamento, as próximas etapas e os critérios de validação estão em [docs/plano-de-execucao.md](docs/plano-de-execucao.md).

Esta primeira versão controla **mute e fader dos canais de entrada 1 a 24 no mix principal**. Não altera ganho, phantom power, equalização, auxiliares ou master. Para reduzir mudanças inesperadas, o ajuste absoluto do fader está limitado a -60 até 0 dB. Confira a transcrição e teste inicialmente em um canal sem sinal.

## Requisitos

- Windows, Node.js 22 ou superior, Python 3.10 a 3.12, microfone e rede conectada à mesa. Python 3.14 pode não ter pacotes compatíveis; instale Python 3.12 se necessário.
- Internet para instalar dependências e baixar o modelo Whisper na primeira execução. Depois do download, a transcrição e a comunicação com a mesa são locais.

No PowerShell, na pasta do projeto:

```powershell
npm install
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Experimentar

```powershell
npm start
```

Por padrão o programa simula os comandos e não acessa a mesa. Aperte Enter, fale após aparecer “Gravando agora” e o comando é executado imediatamente. Use `sair` para terminar. Para experimentar sem microfone nem modelo:

```powershell
npm start -- --texto
```

Exemplos de frases exatas:

- `mute o canal três`
- `desmutar canal 3`
- `ajustar canal 3 para menos 6 dB`
- `ajustar canal vinte e quatro para zero dB`

São aceitos números em algarismos ou por extenso de zero a vinte e quatro. Para outros níveis, use algarismos. O parser rejeita frases fora desses padrões, inclusive comandos múltiplos; corrija manualmente ou tente novamente se a transcrição vier diferente.

## Conectar à mesa

Conecte o computador à mesma rede da mesa, descubra o IP na configuração de rede da Ui24R e substitua o endereço abaixo:

```powershell
npm start -- --live --ip 192.168.1.100
```

É possível acrescentar `--texto` para testar a conexão sem voz, `--descrever` para mostrar em tempo real no terminal tudo o que o Whisper está ouvindo (nível de áudio, trechos identificados e taxa de confiança), `--modelo base` para escolher outro modelo do faster-whisper, `--listar-dispositivos` para ver os microfones disponíveis, `--dispositivo <ID>` para escolher um microfone específico e `--canal-audio <1 ou 2>` para selecionar o canal de uma interface estéreo/multicanal. Os comandos válidos são aplicados diretamente na mesa. O processamento de voz acontece somente após apertar Enter, sem escuta contínua. O carregamento do modelo ocorre a cada gravação e pode demorar; a latência depende do computador.

## Testes

```powershell
npm test
```

Para as verificações de desenvolvimento, instale as dependências Node com `npm install` e, no ambiente virtual Python, instale as ferramentas separadamente das dependências de áudio:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm run lint
npm test
.\.venv\Scripts\python.exe -m ruff check src tests
.\.venv\Scripts\python.exe -m ruff format --check src tests
.\.venv\Scripts\python.exe -m pytest
```

Os testes automatizados cobrem o interpretador e um fluxo de transcrição com áudio e modelo simulados, sem baixar o Whisper ou conectar equipamentos. Para usar áudio real, também instale `requirements.txt`; o uso com microfone e mesa física precisa ser validado no ambiente real. O GitHub Actions está configurado para executar lint e testes em alterações. Referências: [operações de canal](https://fmalcher.github.io/soundcraft-ui/buses/channel) e [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

Os testes Node também usam uma mesa em memória de 24 canais e um servidor WebSocket local de teste. Este último exercita a biblioteca real com mute e fader em um canal configurado, além de comandos inválidos e desconexão. A conexão é restrita ao loopback e pode precisar de permissão no ambiente de execução. O simulador não produz áudio e não comprova compatibilidade com todas as funções ou versões da mesa física; o modo `--texto` continua usando o fluxo simulado original do aplicativo.

## Mesa simulada no terminal

Após `npm install`, inicie no CMD ou PowerShell:

```powershell
npm run simulador
```

Use `lista` para ver os 24 canais, `canal 3` para consultar, `mute 3`, `desmute 3` ou `fader 3 -6` para alterar o estado. `ajuda` mostra os comandos e `sair` encerra. Os valores são simulados, limitados a -60 até 0 dB, e não há áudio nem conexão com a mesa física.

Para conectar o aplicativo ao simulador, mantenha esse terminal aberto e copie o comando mostrado por ele para outro terminal. Por exemplo, se o endereço exibido for `127.0.0.1:56935`:

```powershell
npm start -- --texto --live --ip 127.0.0.1:56935
```

A porta muda a cada execução. Embora o aplicativo mostre “MODO REAL” ao usar `--live`, nesse exemplo ele se conecta apenas ao simulador local; confira o endereço antes de executar. Encerre primeiro o aplicativo com `sair` e depois o simulador. O código HTML da [demonstração oficial da Soundcraft](https://www.soundcraft.com/ui24-software-demo/mixer.html) não está incluído nem conectado ao simulador.
