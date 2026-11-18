# Análise técnica e validação — 17/11/2026

> **Registro histórico:** este relatório descreve o estado da rodada de auditoria. As correções posteriores A1–A7 e a evolução do serviço, cadastros e ambiente estão no [plano de execução](plano-de-execucao.md); não interprete os achados e o inventário abaixo como estado atual sem consultar esse plano.

## Parecer

O projeto possui uma base funcional de protótipo e testes úteis de integração simulada. O terminal de comandos exatos, a persistência, o simulador, a reconexão e o worker de voz têm comportamentos aprovados nos cenários automatizados existentes. Isso ainda não comprova uma aplicação integrada pronta para operação durante um culto.

Nesta máquina, **o modo de voz padrão não inicia**: o ambiente virtual não contém NumPy, sounddevice ou faster-whisper. A execução de `node src/index.js` falhou com `ModuleNotFoundError: No module named 'numpy'`. É uma pendência de preparação do ambiente, distinta dos defeitos de código descritos abaixo.

Todos os testes existentes passaram, mas verificações dirigidas adicionais reproduziram falhas que a suíte ainda não cobre: encerramento do terminal, cancelamento e invalidação de conversas, cobertura das regras de lint e tratamento de erros. A recomendação é estabilizar esses caminhos e integrar uma fatia ponta a ponta simulada antes de ampliar as funcionalidades.

Esta auditoria propõe correções; não as implementa. Foram alterados somente o relatório e os documentos de acompanhamento. As modificações de código e documentação que já existiam no diretório foram preservadas.

## Escopo e método

- Leitura de `AGENTS.md`, arquitetura, plano, especificações, código, testes, dependências declaradas e workflow de CI.
- Análise do diretório de trabalho atual, incluindo arquivos modificados e não versionados; o resultado não descreve somente o último commit.
- Revisões independentes de comandos/conexão, dados/serviço e voz/IA, com consolidação dos achados.
- Execução dos verificadores disponíveis e de reproduções isoladas com dependências simuladas.
- Sem operação em mesa física, abertura de microfone real, download de modelo, chamada ao Gemini, alteração no Agendador ou teste de reinício do Windows.

SQLite, subprocessos Node/Python e a biblioteca de conexão foram exercitados de verdade nos testes; a mesa, o áudio, o modelo de transcrição, o provedor e o Agendador foram simulados nos respectivos cenários. Não houve medição de qualidade ou latência do reconhecimento real.

## Ambiente e verificações executadas

| Item | Ambiente observado |
| --- | --- |
| Sistema | Windows, versão de kernel `10.0.26200`, x64 |
| Node.js / npm | `24.21.0` / `12.1.0` |
| Python do `.venv` | `3.14.7`; diferente do Python 3.12 recomendado no README e usado pelo CI |
| Bibliotecas Node instaladas | soundcraft-ui-connection `7.0.3`, ESLint e @eslint/js `9.39.5`, ws `8.23.0` |
| Ferramentas Python instaladas | pytest `8.4.2`, Ruff `0.17.5` |
| Dependências de áudio no `.venv` | NumPy, sounddevice e faster-whisper ausentes |

| Verificação | Resultado e alcance |
| --- | --- |
| `npm test` | **114 aprovados, 0 falhas, 0 ignorados**, aproximadamente 10,46 s. O executor também contabiliza o arquivo auxiliar `test/support/ui24r-server.js`. |
| `npm run lint` | Aprovado; há uma lacuna de regras nos scripts, detalhada em A4. |
| `.\.venv\Scripts\python.exe -m pytest` | **14 aprovados**, aproximadamente 3,56 s, com áudio/modelo simulados. |
| `.\.venv\Scripts\python.exe -m ruff check src tests` | Aprovado. |
| `.\.venv\Scripts\python.exe -m ruff format --check src tests` | Aprovado: 2 arquivos já formatados. |
| `.\.venv\Scripts\python.exe -m pip check` | Nenhuma incompatibilidade entre os pacotes instalados. Não verifica se todas as dependências opcionais/de execução do projeto estão presentes. |
| `npm ls --depth=0` | Dependências Node declaradas presentes. |
| `node src/index.js` | **Falhou**, código 1: NumPy ausente; worker encerrou antes de ficar pronto. Não chegou à captura ou ao carregamento do modelo. |
| `git diff --check` | Aprovado; apenas avisos de conversão LF/CRLF nos arquivos já modificados. |

O GitHub Actions foi inspecionado, mas nenhuma execução remota foi consultada ou disparada. Não foram executados `npm ci`, instalação limpa de dependências ou auditoria de vulnerabilidades. As aprovações locais usam o ambiente já instalado.

## O que está implementado e o que está integrado

| Área | Situação verificada | Limite atual |
| --- | --- | --- |
| Parser e terminal | Comandos exatos de mute, unmute e fader; testes de frases inválidas e limites aprovados. | Canais 1–24, fader absoluto de −60 a 0 dB; não entende livremente todos os exemplos da visão futura. |
| Simulação | Estado em memória, terminal de 24 canais e peer WebSocket local exercitado com biblioteca real. | Não produz áudio nem prova fidelidade ao firmware da Ui24R. |
| IP e conexão | Persistência em processo separado, início offline, quedas e reconexão simulados aprovados. | Socket aberto não comprova sincronização nem confirmação física da alteração. |
| Voz | Worker persistente e comunicação Node/Python aprovados com fakes; captura manual por Enter no aplicativo. | Modo padrão indisponível neste `.venv`; microfone, Whisper e latência reais não testados. |
| Fim por silêncio | Segmentação e falhas de stream testadas com áudio falso. | Experimental; limiar, pausas, ruído e música sem validação real. |
| Cadastro | SQLite, referências, confirmação, persistência e conflitos concorrentes testados. | Cadastro inicial; canal declarado não confirma ligação física ou patch. Não há cadastro completo de retornos/medusa. |
| Backup | Exportação consistente com WAL, recuperação em diretório separado e recusa de sobrescrita aprovadas nos testes existentes. | Validação aceita esquema alterado com dados inválidos (A7); recuperação com dados reais continua pendente. |
| Serviço local | Iniciar, consultar e parar processo separado; token e listener restrito a loopback. | Serviço de diagnóstico/conexão: não captura voz nem recebe comandos de operação; mudança de IP exige reinício. |
| Inicialização Windows | Geração e identidade de tarefa testadas com executor falso. | Tarefa não instalada; reinício, janela e acesso a áudio não testados. A ação inicia o daemon por uma CLI e não oferece supervisão contínua após sua queda. |
| Modos e ativação | Regras de origem e palavra inicial “mesa” existem em módulos isolados. | Não governam o caminho operacional de `src/index.js`; há defeitos de invalidação de conversa. |
| Orquestração e Gemini | Propostas, consentimento e validação determinística testados com provedor falso. | Não estão conectados à execução na mesa; não houve requisição ao provedor real. |
| Web, TTS, Holyrics, auxiliares, roteamento, cues e EQ | Permanecem evoluções do plano, com diferentes estágios de investigação. | Não devem ser apresentados como funcionalidades operacionais do produto atual. |

O caminho operacional atual é **Enter/texto → transcrição quando aplicável → parser → envio imediato se `--live`**. As exigências de confirmação e os modos dos novos módulos não se aplicam automaticamente a esse caminho. As especificações reconhecem essa separação; trata-se de integração pendente, não de regressão de uma funcionalidade já entregue.

## Pontos fortes

- A separação Node/Python permite reutilizar o modelo e testar o protocolo sem depender do equipamento.
- O parser usa padrões completos e limites explícitos; reduz a interpretação acidental de frases compostas.
- O aplicativo distingue comando enviado de confirmação na mesa e recusa pedidos observados durante desconexão, sem executá-los automaticamente depois.
- O cadastro usa SQL parametrizado e transações; os testes exercitam conflitos inclusive entre processos.
- Backup consistente com WAL e recuperação sem sobrescrever a instalação ativa são boas escolhas de preservação de dados.
- Gemini é opcional e exige consentimento; a proposta passa por regras determinísticas e não executa ferramentas por conta própria.
- Arquitetura, especificações e pendências documentam bem a diferença entre intenção, implementação e validação física.

## Achados reproduzidos

Prioridades: **P2** = correção relevante para confiabilidade ou antes da próxima integração; **P3** = defeito localizado de diagnóstico/robustez. O impacto de cada achado está limitado ao cenário efetivamente examinado.

### A1 — P2: EOF ou interrupção podem impedir o encerramento correto

**Código:** `src/index.js:83`, `:115` e `:142`.

`interrupt()` fecha o readline, mas não cancela a promessa pendente de `rl.question()`. O fluxo pode permanecer aguardando a resposta sem alcançar o `finally` que encerra a conexão. O indicador `interrupted` também faz as interrupções seguintes retornarem imediatamente.

**Reprodução executada:** iniciar `node src/index.js --texto` como subprocesso, aguardar o prompt e chamar `child.stdin.end('muta canal 3\n')`. O comando foi simulado, mas o processo terminou com código **13** e `Warning: Detected unsettled top-level await`. Outra reprodução emitiu `process.emit('SIGINT')` durante o prompt e o import do CLI permaneceu pendente. No cenário de conexão em tentativa, os recursos mantiveram o processo vivo. Não se afirma teste físico de Ctrl+C ou socket de mesa conectado.

**Melhoria:** usar cancelamento explícito de `question()` com `AbortController`, tratar fechamento de stdin/EOF e garantir a execução de uma rotina única de limpeza.

**Aceite proposto:** EOF e interrupção enquanto aguarda entrada encerram sem código 13, promessa pendente, worker sobrevivente ou novas tentativas de conexão. Testar subprocessos com voz falsa e mesa simulada/offline.

### A2 — P2: “cancelar” não invalida interpretação em andamento

**Código:** `src/voice-orchestrator.js:111`, `:118`; `src/voice-activation.js:47`.

**Reprodução executada:** enviar pedido com ativação para provedor falso que fica aguardando; enviar `cancelar`; resolver o provedor. O cancelamento retornou `inactive` e o pedido anterior ainda retornou `proposal`.

**Causa:** a conversa é consumida ao produzir o pedido; o processamento assíncrono não mantém um identificador cancelável nem verifica se foi substituído ou cancelado.

**Impacto atual:** proposta simulada indevida; o módulo não envia comandos à mesa e mantém `confirmed:false`. A correção é necessária antes de ligar esse fluxo à execução.

**Melhoria e aceite:** manter ID/geração por pedido e entrada, invalidar resultados antigos e propagar cancelamento quando suportado. Uma resposta que chega após `cancelar` nunca pode produzir uma proposta vigente nem liberar execução.

### A3 — P2: ativação antiga sobrevive à pausa ou revogação de autorização

**Código:** `src/voice-orchestrator.js:72`, `:84`; `src/voice-activation.js:47`; `src/mode-policy.js:88`.

**Reproduções executadas:**

1. Passagem → dizer `mesa` (`waiting`) → pausar → voltar à passagem, sem texto intermediário → dizer `mute canal 3`: retornou `proposal` sem nova ativação.
2. Dizer `mesa` → negar autorização → enviar texto (`denied`) → restaurar autorização → dizer `mute canal 3`: também retornou `proposal` usando a espera antiga.

**Causa:** mudanças de modo não notificam diretamente o estado conversacional; a recusa explícita de autorização retorna antes de limpar a ativação.

**Impacto atual:** lifecycle incorreto de propostas simuladas, sem execução física.

**Melhoria e aceite:** invalidar conversas nas mudanças de política/autorização e conferir a geração da política antes de devolver resultados. Pausa, remoção de entrada ou revogação devem exigir nova ativação mesmo que nenhuma fala ocorra durante o bloqueio.

### A4 — P2: lint aprovado não aplica as regras recomendadas aos scripts

**Código:** `eslint.config.js:8`; comando `lint` em `package.json`.

O comando inclui `scripts`, mas a configuração com as regras recomendadas só seleciona `src/**/*.js` e `test/**/*.js`. As fixtures também ficam fora da verificação compartilhada declarada.

**Reprodução executada:** pela API do ESLint, verificar o texto `unassignedAuditVariable = 1;` com diferentes `filePath`. Para `src/index.js`, `no-undef` estava ativo e produziu um erro; para `scripts/windows/startup.js` e `fixtures/voice-worker-fake.js`, nenhum erro foi reportado e `no-undef` estava ausente.

**Melhoria e aceite:** incluir scripts e fixtures na configuração apropriada e no comando compartilhado; declarar os globais necessários. Um identificador indefinido intencional deve falhar em todos esses grupos sem mudar arquivos de produção para realizar o teste.

### A5 — P3: falha ao iniciar Python na listagem gera erro não tratado

**Código:** `src/index.js:58`.

**Reprodução executada:** `node src/index.js --listar-dispositivos --python python-inexistente-auditoria`. Resultado: `Unhandled 'error' event`, `ENOENT`, stack trace e código 1.

O subprocesso registra `close`, mas não `error`. Além disso, `code || 0` pode apresentar término por sinal (`code === null`) como sucesso.

**Melhoria e aceite:** tratar falha de criação e término por sinal; apresentar mensagem curta com código de saída não zero. Acrescentar teste de processo com executável inexistente, sem acessar áudio real.

### A6 — P3: resposta Gemini malformada escapa da classificação de erros

**Código:** `src/gemini-provider.js:125`.

**Reprodução executada:** provedor HTTP falso retorna `{ candidates: [{ content: { parts: {} } }] }`. A chamada de `.map()` produz `TypeError`, sem `GeminiProviderError` ou `code`.

**Impacto:** quebra o contrato de erros do adaptador. O orquestrador captura a exceção e não executa uma ação; não houve teste com resposta real do Gemini.

**Melhoria e aceite:** validar o envelope e cada item antes de extrair texto; classificar `parts` inválido, itens nulos e tipos indevidos como resposta inválida com código estável.

### A7 — P2: restauração aceita esquema alterado com vínculos inválidos

**Código:** `src/backup.js:64`, `:79`, `:89`; `src/registry.js:60`.

**Reprodução executada:** criar um SQLite temporário com `user_version=1`, tabelas/colunas e índice com os nomes esperados, mas sem as restrições de tipo, referências e domínio do esquema oficial. Inserir vínculo `confirmado` com `channel=999` e IDs de sessão, pessoa e equipamento inexistentes. Montar o arquivo de backup com o checksum SHA-256 correspondente e restaurar em pasta nova.

**Resultado observado:** `restoreBackup()` aceitou o arquivo, e `openRegistry(...).listAssignments(99)` devolveu o vínculo com canal 999 e referências inexistentes. Todos os arquivos da reprodução foram removidos; nenhum cadastro real foi acessado.

**Causa:** a validação compara nomes e ordem das colunas, mas não comprova que `CHECK`, `FOREIGN KEY`, tipos e `STRICT` correspondem ao esquema confiável. `foreign_key_check` não encontra violação quando o próprio esquema não declara as chaves. O cadastro confia no banco já marcado como versão 1. O checksum detecta divergência em relação ao conteúdo declarado, mas não autentica a origem nem valida as regras do domínio.

**Impacto e limite:** recuperação pode apresentar dados inválidos como confirmados a partir de backup com esquema alterado e checksum correspondente. Esse cenário não executou operação na mesa; a reprodução não demonstra adulteração remota ou falha de um backup normal gerado com o esquema íntegro.

**Melhoria e aceite:** restaurar dados em esquema canônico ou validar integralmente esquema e invariantes antes da instalação. Rejeitar referências ausentes, canal fora da faixa, status/tipos inválidos e conflitos entre vínculos confirmados, preservando o destino. Acrescentar casos com checksum válido e esquema adulterado; `integrity_check` aprovado sozinho não deve autorizar restauração.

## Melhorias propostas e ordem de execução

As propostas abaixo são trabalho futuro. Devem atualizar as especificações correspondentes antes de mudanças de comportamento, conforme `AGENTS.md`.

| Ordem | Proposta | Fase / dependência | Critério de validação |
| --- | --- | --- | --- |
| 1 | Corrigir encerramento do CLI e os defeitos de lifecycle das conversas. | Base, fases 1 e 3; A1–A3. | Reproduções viram regressões automatizadas; nenhum resultado tardio válido após cancelamento/revogação. |
| 2 | Completar lint e tratamento de falhas de subprocesso/provedor. | Base e fases 1/5; A4–A6. | Mesmas regras nos arquivos previstos, erros estáveis, suíte e linters aprovados. |
| 2 | Fortalecer validação semântica e do esquema na restauração de backup. | Fases 2/4; A7. | Backup com checksum válido e esquema/dados inválidos é recusado sem alterar o destino. |
| 3 | Preparar ambiente de voz suportado e diagnóstico inicial de requisitos. | Fases 0/1; Python e dependências adequados. | Diagnóstico informa pacotes ausentes; ambiente completo inicia worker real, ainda sem enviar comandos físicos automaticamente. |
| 4 | Criar uma fatia integrada no simulador: origem → modo → ativação → proposta → confirmação → validação final → adaptador. | Fases 2/3/5; depende das correções. | Testar comando local e provedor falso, recusa, cancelamento, queda, mudança de modo e resposta tardia pelo mesmo fluxo. |
| 5 | Separar operação e terminal em módulos importáveis; só então incorporá-los ao serviço. | Fase 2; depende da fatia integrada. | Serviço supervisiona worker e conexão; terminal consulta estados reais e alterações de configuração têm efeito definido/testado. |
| 6 | Ampliar CI para Windows e versões suportadas. | Base; workflow atual usa somente Ubuntu. | `npm ci`, SQLite, subprocessos e testes simulados passam em Windows e Linux; testar mínimo Node declarado e Python 3.12. Nenhum hardware/provedor pago no pipeline padrão. |
| 7 | Rastrear solicitação, proposta, envio e estado observado com timestamps e IDs. | Fases 0/2/3; sem alegar ACK inexistente. | Logs distinguem pedido/valor solicitado/observado; diagnósticos não expõem tokens ou dados privados por padrão. |
| 8 | Definir prontidão e prazo de sincronização da mesa, além de socket aberto. | Fase 2 e capacidades comprovadas. | Simular peer silencioso, estado incompleto e reconexão; operações dependentes de leitura recusam estado desconhecido/desatualizado. |
| 9 | Executar validação física pequena e mensurável antes de expandir controles. | Fase 0; equipamento e participação do usuário. | Registrar versões, canal/patch, fonte e limites; conferir mute/fader e recuperação na interface da mesa. |
| 10 | Medir voz e avaliar dataset em português antes de escolher modelo ou detector definitivo. | Fases 0/1/3; ambiente e áudios autorizados. | Comparar os mesmos casos com silêncio, nomes, números, música e pausas; medir erros de ação/alvo e latência mediana/percentil 95. |

Outras melhorias úteis: documentar a compatibilidade de exportação de backup com o sistema de arquivos de destino; validar recuperação com dados representativos; limitar a leitura de backups antes de carregar arquivos inteiros em memória; estabelecer retenção e rotação de logs; definir supervisão e recuperação do daemon após queda; alinhar checklists resumidos e tabelas detalhadas do plano para reduzir estados aparentemente divergentes. São oportunidades identificadas por inspeção, sem teste de consumo de memória ou queda após login nesta rodada. O indicador `exp(avg_logprob)` exibido pelo Whisper deve ser descrito como indicador do modelo, sem ser apresentado como probabilidade calibrada de acerto do comando.

Não há evidência nesta auditoria para justificar troca de Node/Python, adoção obrigatória de MCP ou inclusão imediata de uma interface web. A maior necessidade observada é completar os contratos entre os módulos existentes.

## O que falta para afirmar funcionamento no ambiente real

1. Preparar Python compatível e dependências de áudio; confirmar inicialização e dispositivo escolhido sem transmitir operações à mesa.
2. Registrar computador/Windows, firmware, driver, ligação USB, entrada física e patch de um canal seguro de teste.
3. Testar voz real com frases repetidas, silêncio e erros de reconhecimento; conferir o alvo interpretado antes de habilitar envio.
4. Validar mute e fader nesse canal com acompanhamento da interface da mesa, distinguindo envio de observação/efeito físico.
5. Testar mesa inicialmente desligada, queda/retorno de rede e ausência de execução tardia de comandos offline.
6. Testar mapeamento USB, duas entradas e comportamento de captura quando o canal está mutado.
7. Exercitar instalação após login e reinício apenas quando essa etapa for executada explicitamente; verificar processo, eventual janela e acesso aos dispositivos.
8. Restaurar backup em diretório separado, conferir cadastros e só então definir o procedimento de uso dos dados recuperados.

Gemini real, Holyrics, TTS e controles além de mute/fader têm validação própria e não são pré-requisitos para concluir os reparos locais. Testes físicos e eventuais custos permanecem fora do pipeline padrão.

## Limites do parecer

As aprovações se referem aos casos executados e ao diretório de trabalho desta data. Testes simulados não comprovam qualidade da transcrição, acústica, fidelidade do simulador, compatibilidade de todos os firmwares, isolamento entre usuários do Windows ou inicialização após reinício. A arquitetura e as funcionalidades futuras não foram consideradas implementadas apenas por estarem descritas.

O resultado autoriza afirmar que **a base testada funciona em simulação, com defeitos adicionais identificados; o modo de voz local precisa de preparação e a operação integrada real permanece sem validação nesta rodada**.
