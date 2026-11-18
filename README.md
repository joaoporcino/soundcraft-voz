# Soundcraft por voz

Protótipo local de controle da Soundcraft Ui24R por voz em português. O microfone grava um comando de cinco segundos, o faster-whisper transcreve e o programa interpreta a ação. No modo real, comandos reconhecidos são enviados imediatamente. A biblioteca comunitária [soundcraft-ui-connection](https://github.com/fmalcher/soundcraft-ui) controla a mesa; não é uma biblioteca oficial da Soundcraft.

A visão futura, a arquitetura proposta e os diagramas das entidades estão em [docs/arquitetura.md](docs/arquitetura.md). O documento distingue as funcionalidades planejadas das já disponíveis neste protótipo.

O andamento, as próximas etapas e os critérios de validação estão em [docs/plano-de-execucao.md](docs/plano-de-execucao.md).

Esta primeira versão controla **mute e fader dos canais de entrada 1 a 24 no mix principal**. Não altera ganho, phantom power, equalização, auxiliares ou master. Para reduzir mudanças inesperadas, o ajuste absoluto do fader está limitado a -60 até 0 dB. Confira a transcrição e teste inicialmente em um canal sem sinal.

## Requisitos

- Windows, Node.js 22.13 ou superior, Python 3.10 a 3.12, microfone e rede conectada à mesa. Python 3.14 pode não ter pacotes compatíveis; instale Python 3.12 se necessário.
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

Conecte o computador à mesma rede da mesa e descubra o IP na configuração de rede da Ui24R. Para salvá-lo no computador, substitua o endereço abaixo:

```powershell
npm start -- --configurar-ip 192.168.1.100
npm start -- --mostrar-ip
```

O endereço fica na configuração local do usuário, fora do repositório. Depois, inicie o modo real usando o endereço salvo:

```powershell
npm start -- --live
```

Também é possível informar outro endereço apenas para a execução atual, sem alterar o salvo:

```powershell
npm start -- --live --ip 192.168.1.100
```

O terminal continua disponível quando a mesa está desligada e mostra as tentativas de conexão. Comandos solicitados enquanto ela estiver desconectada não são enviados nem repetidos após a reconexão. A conexão de rede e o comportamento físico ainda precisam ser validados com a mesa real.

É possível acrescentar `--texto` para testar a conexão sem voz, `--descrever` para mostrar no terminal detalhes da gravação e da transcrição, `--modelo base` para escolher outro modelo do faster-whisper, `--listar-dispositivos` para ver os microfones disponíveis, `--dispositivo <ID>` para escolher um microfone específico e `--canal-audio <1 ou 2>` para selecionar o canal de uma interface estéreo/multicanal. Os comandos válidos são aplicados diretamente na mesa. O processamento de voz acontece somente após apertar Enter, sem escuta contínua. O modelo é carregado uma vez ao iniciar o modo de voz e reutilizado nas gravações seguintes; a gravação ainda dura cinco segundos e a latência depende do computador.

Com `--descrever`, o terminal também exibe o tempo de inicialização e o tempo total de cada gravação e transcrição. Para experimentar o encerramento por silêncio, acrescente `--fim-por-silencio`: após apertar Enter, o programa encerra a gravação ao detectar uma pausa. Esse modo é experimental; música e ruído podem ser confundidos com fala, e pausas naturais podem cortar a frase. Sem a opção, a gravação continua fixa em cinco segundos. Os tempos e o comportamento ainda precisam ser medidos com microfone e modelo reais.

## Cadastro local pelo terminal

Os cadastros ficam em SQLite no diretório local do usuário, fora do repositório. A API SQLite incorporada ao Node ainda é experimental e pode exibir um aviso. Consulte os comandos disponíveis com `npm start -- --cadastro ajuda`. Exemplo, em processos separados:

```powershell
npm start -- --cadastro pessoa adicionar "Ana"
npm start -- --cadastro equipamento adicionar "Voz" microfone amarelo --sem-fio
npm start -- --cadastro sessao criar "Ensaio"
npm start -- --cadastro vinculo propor 1 1 1 3
npm start -- --cadastro vinculo listar 1
npm start -- --cadastro vinculo confirmar 1
```

Os números do exemplo são IDs devolvidos pelos comandos anteriores; use os IDs mostrados na sua instalação. Um vínculo inicia proposto e exige confirmação explícita, canal declarado e ausência de conflito. A cor pode identificar mais de um equipamento. O canal registrado é informado pela pessoa e não comprova o patch ou ligação real da mesa. O cadastro de dispositivos, pontos e ligações permite declarar caminhos pela medusa, conforme abaixo; sua confirmação física continua necessária.

Antes de cadastrar retornos, configure a quantidade de AUX para a instalação. Por exemplo, para uma mesa com oito AUX disponíveis:

```powershell
npm start -- --cadastro aux-config definir 8
npm start -- --cadastro aux-config mostrar
```

Essa quantidade é informada pelo operador e não detectada na mesa. Bancos antigos migram com oito como valor legado não confirmado; confirme ou altere a configuração conforme a instalação. Reduzir a quantidade é recusado se já houver AUX cadastrado acima do novo limite. Ainda não há instalador que solicite esse valor automaticamente.

Para registrar um AUX usado como retorno e associá-lo a uma pessoa da sessão, use os IDs retornados pelos comandos de cadastro:

```powershell
npm start -- --cadastro retorno adicionar SESSAO_ID 3
npm start -- --cadastro retorno listar SESSAO_ID
npm start -- --cadastro retorno-vinculo propor SESSAO_ID PESSOA_ID RETORNO_ID
npm start -- --cadastro retorno-vinculo listar SESSAO_ID
npm start -- --cadastro retorno-vinculo confirmar VINCULO_ID
```

Uma proposta também pode ser rejeitada; para trocar um vínculo confirmado, use `retorno-vinculo revogar VINCULO_ID` e proponha outro. Várias pessoas podem compartilhar um AUX. A contagem de pessoas confirmadas não comprova exclusividade física, patch, disponibilidade de fone ou audição; esses pontos ainda precisam ser conferidos com a mesa.

Para mapear o caminho de entrada ou de retorno, cadastre dispositivos e pontos e depois proponha ligações direcionadas. Consulte os comandos e IDs com `npm start -- --cadastro ajuda`; o tipo de dispositivo é `mesa`, `medusa` ou `outro`. Os tipos de ponto são `equipment`, `person`, `monitor_return`, `channel`, `port`, `snake_way`, `mix` e `other`; suas direções são `input`, `output`, `bidirectional` ou `unknown`. Por exemplo, após cadastrar uma sessão, uma mesa e um equipamento:

```powershell
npm start -- --cadastro fisico-ponto adicionar equipment "Saída do microfone" --equipamento EQUIPAMENTO_ID --direcao output
npm start -- --cadastro fisico-ponto adicionar port "Entrada da mesa" --dispositivo MESA_ID --direcao input
npm start -- --cadastro fisico-ponto adicionar channel "Canal 7" --canal 7 --direcao input
npm start -- --cadastro fisico-ligacao propor SESSAO_ID PONTO_MIC_ID PONTO_ENTRADA_ID physical
npm start -- --cadastro fisico-ligacao confirmar LIGACAO_ID operador
npm start -- --cadastro fisico-ligacao propor SESSAO_ID PONTO_ENTRADA_ID PONTO_CANAL_ID patch
npm start -- --cadastro fisico-ligacao confirmar PATCH_ID operador
npm start -- --cadastro fisico-caminho consultar SESSAO_ID PONTO_MIC_ID
```

Substitua os identificadores pelos valores retornados pelos comandos. `desconhecido` pode ser usado como destino de uma ligação proposta; ligações sem extremidade ou direção conhecida não podem ser confirmadas. Para corrigir um vínculo confirmado, revogue-o e proponha outro. O cadastro não lê nem altera a mesa; a origem `operador` é uma declaração, não uma confirmação física automática.

Uma transcrição de teste como `npm start -- --cadastro voz-vinculo propor SESSAO_ID mic-principal "microfone amarelo sem fio está com a Ana"` cria proposta revisável. `voz-vinculo listar`, `corrigir`, `confirmar` e `rejeitar` fazem a revisão; confirmação requer vínculo e patch confirmados sem ambiguidade. O interpretador aceita frases restritas como `microfone amarelo para Ana` e `Ana está com o microfone amarelo`; não usa LLM.

Para capturar uma frase no serviço, selecione uma sessão ativa com `node src/local-service-cli.js sessao SESSAO_ID`, associe a entrada a uma fonte confirmada e habilite-a no modo passagem ou como master no culto. Após `voz-iniciar ENTRADA`, execute `node src/local-service-cli.js voz-cadastro ENTRADA`; revise a proposta com `npm start -- --cadastro passagem mostrar SESSAO_ID`. A operação não executa comandos na mesa. Uma frase ambígua ou dados ausentes geram proposta incompleta para revisão. Dizer `cancelar`, pausar, mudar a sessão ou perder a conexão durante a captura descarta o resultado. Essa integração foi testada com transcrições e worker simulados; captura real continua pendente.

Para orientar a passagem, use `npm start -- --cadastro passagem mostrar SESSAO_ID`. O resultado reúne cadastros, retornos, ligações e propostas da sessão com instruções de revisão. Por exemplo, `npm start -- --cadastro passagem corrigir SESSAO_ID vinculo VINCULO_ID PESSOA_ID EQUIPAMENTO_ID 7` corrige uma proposta; depois, consulte novamente e use `npm start -- --cadastro passagem confirmar SESSAO_ID vinculo VINCULO_ID REVISAO`, com a revisão apresentada no resultado. A confirmação é recusada se a proposta mudar após a revisão. Os tipos disponíveis são `vinculo`, `retorno`, `ligacao` e `voz`; consulte `--cadastro ajuda`. Para corrigir um retorno ou ligação propostos, rejeite e proponha outro. A conferência do cadastro não verifica automaticamente as ligações ou o áudio reais.

Na mesma revisão, use `passagem corrigir SESSAO_ID pessoa PESSOA_ID REVISAO "Nome corrigido"` para corrigir uma pessoa. `passagem corrigir SESSAO_ID equipamento` aceita os dados completos do equipamento; a ajuda mostra todos os campos. Pessoas e equipamentos são cadastros globais: alterações podem afetar outras sessões. Para substituir uma fonte já confirmada, confira `entradasAssociadas` e use `passagem substituir SESSAO_ID vinculo VINCULO_ID REVISAO_SUBSTITUICAO PESSOA_ID EQUIPAMENTO_ID CANAL`, com `revisaoSubstituicao` obtida em `passagem mostrar`. Complete os comandos com o prefixo `npm start -- --cadastro`. A substituição retira o vínculo anterior, desvincula as entradas apresentadas e cria uma proposta ainda pendente; se a lista de entradas mudar desde a revisão, a operação será recusada. Depois de revisá-la e confirmá-la, associe novamente as entradas necessárias. O histórico fica visível na passagem e incluído no backup.

Os [diagramas de entidades e casos de uso](docs/diagramas.md) separam o que existe no código das funcionalidades planejadas.

Para fazer uma cópia dos cadastros, do IP e das configurações de voz, entradas e modos, ou recuperar essa cópia em um diretório novo ou vazio:

```powershell
npm start -- --exportar-backup "C:\caminho\backup-som.json"
npm start -- --restaurar-backup "C:\caminho\backup-som.json" --destino "C:\caminho\recuperado"
```

O arquivo de backup não é sobrescrito se já existir. A recuperação não altera a instalação ativa; os arquivos recuperados precisam ser conferidos antes de uso. Ela não inclui modelos de voz, credenciais, shows ou snapshots da mesa. Mantenha a cópia protegida, pois pode conter nomes de pessoas.

## Serviço local experimental

O serviço abaixo exige proposta e confirmação para comandos suportados. O protótipo interativo `npm start -- --live` é independente e envia comandos reconhecidos diretamente, sem essa confirmação; somente use `--live` quando esse comportamento for desejado e o destino estiver correto. Em ambos os casos, o envio não comprova aplicação na mesa.

O serviço pode ser iniciado e consultado pelo terminal:

```powershell
npm start -- --servico start
npm start -- --servico status
npm start -- --servico stop
```

Com o serviço iniciado, execute `node src/local-service-cli.js painel` e abra no mesmo computador o link apresentado. Ele contém a capacidade de acesso do serviço; não o compartilhe. O painel consulta conexão, sessões, cadastros e propostas e permite revisar propostas de voz. A capacidade fica apenas na memória da página; depois de recarregar, obtenha novo link. O painel aceita apenas loopback, não isola processos locais que consigam ler o manifesto e ainda não foi inspecionado em navegador real nesta rodada.

A fila de respostas **simulada** é acessada por `node src/local-service-cli.js resposta-simulada listar`; use `configurar JSON`, `enfileirar DESTINATARIO TEXTO`, `concluir ID`, `falhar ID` ou `cancelar ID` para testar os fluxos. A configuração de destinos e disponibilidade é fictícia: não reproduz voz nem altera a mesa. A fila é temporária e seus itens são cancelados ao mudar modo ou sessão, perder conexão ou encerrar o serviço.

O serviço acompanha a conexão em segundo plano e começa com a escuta pausada. Com a mesa conectada, o terminal pode habilitar a entrada, solicitar um comando e confirmar a proposta apresentada:

```powershell
node src/local-service-cli.js modo passagem
node src/local-service-cli.js texto "mesa, mute canal 3"
node src/local-service-cli.js confirmar ID_DA_PROPOSTA
node src/local-service-cli.js modo pausa
```

Substitua o identificador pelo retornado pelo comando anterior. A confirmação solicita a alteração à biblioteca da mesa: o resultado não comprova entrega ou aplicação. Pausa, desconexão e novos pedidos invalidam propostas pendentes. A comunicação usa loopback e token local; processos que possam ler o manifesto podem operar o serviço. Não há isolamento multiusuário comprovado. A alteração do IP bloqueia comandos e exige reiniciar o serviço; edições externas concorrentes do arquivo não têm garantia atômica.

O serviço também aceita, por exemplo, `texto "mesa, coloca canal 3 em 50 pontos"` e `texto "mesa, abaixa canal 3 dez pontos"`. A escala provisória do fader de entrada mapeia 0 a 100 para −60 a 0 dB, sem indicar volume percebido; sua curva ainda precisa ser conferida na mesa. Ajustes relativos exigem observação recente, que é revalidada antes do envio. Zero sem unidade exige esclarecimento; informe `0 pontos` ou `0 dB`.

Para usar mais de uma origem, configure entradas e master com `entradas principal,outra principal`, cadastre dispositivo e canal com `voz-entrada definir ENTRADA DISPOSITIVO|- CANAL` e reinicie o serviço para aplicar a configuração de captura. Use `texto-entrada ENTRADA "mesa, pedido"` ou `voz-iniciar ENTRADA` e `voz-capturar ENTRADA`. A associação de uma entrada a um vínculo confirmado da sessão é feita com `--cadastro entrada-fonte vincular SESSAO_ID ENTRADA VINCULO_ID`; selecione `sessao SESSAO_ID` no serviço para exigir esses vínculos, ou `sessao nenhuma` para operar sem sessão ativa. A associação não comprova a ligação física nem a identidade da pessoa. Testes HTTP passaram com dependências simuladas; testes com múltiplos dispositivos reais permanecem pendentes.

O worker verifica nome exato, API, índice e canais disponíveis antes e depois de capturar. Após falha, se um novo worker apresentar descrição diferente, `voz-iniciar ENTRADA` recusa e mostra os dados anterior e candidato e `candidateRevision`; confira-os e, se correto, use `voz-aceitar-dispositivo REVISAO ENTRADA`, com a revisão exibida. Uma candidata alterada depois da revisão é recusada. Esse comando não grava áudio. A referência dura apenas enquanto o serviço estiver ativo; dispositivos fisicamente distintos com metadados idênticos não são diferenciados, portanto confira a seleção após reiniciar ou reconectar. Os testes são simulados e o comportamento dos drivers reais permanece pendente.

A interpretação por LLM é opcional e inicia desativada em instalação nova. Para usar Gemini, defina `GEMINI_API_KEY` no ambiente **antes de iniciar o serviço**, escolha explicitamente um modelo e limite diário de tentativas, e autorize cada pedido textual:

```powershell
node src/local-service-cli.js llm gemini MODELO 20
node src/local-service-cli.js texto-llm --consinto "mesa, pedido para interpretar"
node src/local-service-cli.js confirmar ID_DA_PROPOSTA
node src/local-service-cli.js llm none
```

Também é possível selecionar `llm openai MODELO 20` ou `llm anthropic MODELO 20`, com `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY` no ambiente do serviço. A seleção, modelo e limite persistem após reinício; consentimento não persiste e é exigido a cada pedido. O limite conta tentativas por dia UTC, inclusive falhas, e é global aos provedores desta instalação. **Não limita gastos financeiros nem uso por outros aplicativos.** Após restaurar qualquer backup, confira o uso no provedor e execute `llm reconhecer-restauracao` antes de permitir chamadas, pois a contagem pode ter retrocedido. Pedidos reconhecidos localmente não chamam provedor. Transporte e modelos foram testados apenas com respostas simuladas; confira privacidade, modelo e custo antes de uso real.

Para uma entrada identificada, use `texto-entrada-llm ENTRADA --consinto "mesa, pedido"`; para captura manual com possível envio da transcrição, use `voz-capturar-llm --consinto ENTRADA` após iniciar o worker. O consentimento vale para cada solicitação e não confirma uma proposta.

Para configurar e solicitar captura manual de voz:

```powershell
node src/voice-config-cli.js show
node src/voice-config-cli.js set --python "C:\caminho\python.exe" --modelo small --dispositivo padrao --canal 1
node src/local-service-cli.js voz-iniciar
node src/local-service-cli.js voz-capturar
```

Após alterar a configuração de voz, reinicie o serviço antes de iniciar o worker. A captura não é contínua e o modelo pode precisar ser baixado na primeira utilização. Voz, inicialização automática e operação na mesa real ainda precisam de validação.

Há comandos experimentais para registrar, consultar ou remover uma tarefa de inicialização após o login (`node scripts/windows/startup.js install`, `status` ou `uninstall`). Eles alteram o Agendador quando executados no Windows; os testes até agora apenas simularam essas operações. A inicialização após reinício e a ausência de janela ainda não foram verificadas no computador real.

O `status` da tarefa apresenta o código bruto da última execução, horários e execuções perdidas quando o Agendador disponibiliza essas informações. Consulte também `node src/local-service-cli.js status`: a tarefa apenas inicia o serviço em segundo plano e seu estado ou código não comprovam que o serviço continua funcionando nem que o áudio ou a mesa estão disponíveis.

## Testes

Execute `npm run docs:check` para conferir campos das especificações e destinos locais de links Markdown inline. A verificação não cobre links por referência ou HTML, não confere âncoras nem garante que as descrições reflitam o código; revise o plano e as especificações ao alterar comportamento.

```powershell
npm test
```

Para as verificações de desenvolvimento, instale as dependências Node com `npm install` e, no ambiente virtual Python, instale as ferramentas separadamente das dependências de áudio:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm run lint
npm test
.\.venv\Scripts\python.exe -m ruff check src tests scripts
.\.venv\Scripts\python.exe -m ruff format --check src tests scripts
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
