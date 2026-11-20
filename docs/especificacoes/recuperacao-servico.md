## Situação atual

- Estado: Recuperação implementada com validação simulada.
- Integração: Serviço local, observações de mesa e workers de áudio.
- Validação: Testes HTTP, workers e áudio simulados; mesa, USB e microfone físicos pendentes.

# Recuperação de conexão e captura

## Objetivo e contrato

Na fase 2 do [plano](../plano-de-execucao.md), recuperar conexão e captura após falhas, sem reenviar pedidos e sem usar observações antigas. A conexão abre com estado desconhecido; cada valor depende de mensagem recebida na conexão atual. Não assumir protocolo de sincronização, confirmação física ou completude ainda não demonstrados. Queda ou reconexão invalida gerações, propostas e observações.

A captura continua manual. Ao iniciar, o worker informa a descrição disponível do dispositivo e canal, obtida de `sounddevice`: nome, API, índice e capacidade; nome configurado exige correspondência exata. Nomes ambíguos, metadados inválidos ou ausência do dispositivo falham fechados. Antes e depois de cada captura comparar a descrição e recusar se mudar; erro de consulta, ausência ou mudança invalida a transcrição e exige reinício explícito do worker. Nenhuma captura é repetida ou iniciada automaticamente.

Durante a vida do serviço, cada controlador mantém sua descrição anterior. Caso o dispositivo observado após reinício do worker seja diferente, `voz-iniciar` falha e exibe a identidade anterior, a candidata e sua revisão opaca no resultado e no status; o operador deve verificar as duas e usar `voz-aceitar-dispositivo REVISAO [ENTRADA]` para aceitar expressamente aquela revisão. Na mesma operação o controlador compara a revisão ainda vigente e a identidade reportada pelo novo worker; revisão antiga ou outra candidata é recusada, inclusive se outro cliente tiver consultado ou substituído a candidata. Não capturar automaticamente. A referência não persiste após reinício do serviço: conferir a seleção novamente ao iniciar. Um índice reutilizado por dispositivo de descrição idêntica não é detectável por esta API: não alegar identidade física garantida. Alterações durante captura também podem não ser percebidas se o sistema reportar os mesmos metadados.

No protocolo, erro de dispositivo exige reinício explícito e fecha o worker; erros comuns de interpretação/ausência de fala não devem bloquear o dispositivo. Encerramento, queda e revogação durante uma operação descartam resultados tardios. Não realizar verificação ativa que grave áudio nem escolha outro dispositivo.

## Critérios

- [x] Testar conexão, queda e reconexão parcial ou silenciosa sem recuperar observações anteriores; pedido/proposta anterior jamais reexecuta.
- [x] Testar dispositivo ausente, índice ou padrão alterado, nome duplicado, canal indisponível, mudança durante captura e metadados inválidos, sem transcrição aproveitada.
- [x] Testar falha reportada, recuperação por reinício explicitamente solicitado e nova captura somente por novo pedido, inclusive retorno tardio e isolamento entre entradas.
- [x] Executar testes Node/Python e lint relevantes; validação de equipamento, driver, firmware e reinício reais permanece pendente.

**Evidências:** 2 testes HTTP passaram fora do sandbox com serviço, mesa e workers simulados, cobrindo estado desconhecido após queda, não reenvio, alteração concorrente da candidata, rejeição de revisão antiga e aceite da revisão atual pelo terminal. Vinte testes Node direcionados de worker e controladores passaram; pytest Python 21/21, Ruff e ESLint direcionado passaram. Os testes não garantem identidade física nem validam USB ou comportamento de firmware.
