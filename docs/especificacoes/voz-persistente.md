# Processo de voz persistente

## Situação atual

- Estado: Worker persistente implementado.
- Integração: Terminal e serviço podem reutilizar o processo de transcrição.
- Validação: Áudio e modelo simulados; desempenho e transcrição reais pendentes.

## Estado e vínculo

- **Estado:** implementada e testada com modelo e áudio simulados; validação real de áudio pendente.
- **Plano:** [Fase 1 — Voz mais responsiva](../plano-de-execucao.md#fase-1--voz-mais-responsiva).
- **Última revisão:** 16/11/2026.

## Problema e objetivo

Antes desta implementação, o protótipo iniciava um processo Python e carregava o modelo Whisper a cada gravação de cinco segundos. O objetivo é reutilizar o processo e o modelo entre pedidos, reduzindo o trabalho repetido e tornando falhas observáveis. A melhora de latência precisa ser medida; não há valor garantido antecipadamente.

## Escopo

- Manter processo Python e modelo carregados enquanto a aplicação estiver ativa, para uma entrada de áudio por vez.
- Permitir que o Node solicite gravações/transcrições sucessivas e relacione cada resposta ou erro ao pedido correto.
- Informar inicialização, disponibilidade, falhas e encerramento e liberar recursos ao sair.
- Preservar, na medida aplicável, seleção de modelo, dispositivo e canal, diagnósticos, modo de texto e simulação existentes.
- Medir tempo de inicialização e de pedidos consecutivos com uma linha de base comparável.

## Fora de escopo

Detecção automática de fala e da palavra “mesa”, múltiplas entradas simultâneas, interface web, LLM e alteração do protocolo da mesa. A gravação de cinco segundos pode permanecer inicialmente; a detecção de silêncio será avaliada em atividade posterior da fase 1.

## Comportamento e integrações

Correção A1/A5: EOF e interrupção cancelam a pergunta pendente e iniciam limpeza; falha ao iniciar Python ou encerramento por sinal na listagem retorna diagnóstico e código de falha. EOF e SIGINT emitido foram testados em subprocessos no modo texto, e Python ausente na listagem; sinal real e encerramento simultâneo com worker e mesa permanecem sem validação específica.

1. O Node inicia o processo Python para o modo de voz e aguarda sinal de disponibilidade após o carregamento do modelo.
2. O usuário continua iniciando cada gravação manualmente; o Node envia um pedido identificado e recebe transcrição ou erro correspondente.
3. O serviço interpreta a transcrição pelo fluxo existente. Modo de texto não depende de iniciar o modelo.
4. Na saída, o Node encerra o processo e o Python libera o áudio. Falhas de inicialização, dispositivo ou processo devem ser informadas sem apresentar sucesso; a recuperação ou reinício deve ter comportamento definido e testado antes de implementado.

A proposta de comunicação é por mensagens estruturadas na entrada e saída padrão; formato, versão e estratégia de reinício são decisões de implementação. Diagnósticos devem ficar separados das mensagens de protocolo. A execução ao vivo continua seguindo as regras atuais da mesa; confirmação de envio não equivale a confirmação do estado da mesa.

**Contrato escolhido para esta rodada:** JSON por linha UTF-8 no stdout/stdin. Ao carregar o modelo, o worker envia `{"type":"ready","version":1}`. Cada pedido é `{"type":"transcribe","id":1}` e retorna `{"type":"result","id":1,"text":"..."}` ou `{"type":"error","id":1,"message":"..."}`; mensagens de erro e diagnóstico legíveis vão para stderr. Apenas um pedido pode estar ativo; pedidos simultâneos são recusados. EOF encerra o worker. O Node aguarda até 180 segundos para inicialização e 90 segundos para cada gravação/transcrição; ao expirar ou ocorrer falha fatal, encerra o worker e informa erro, sem reexecutar o pedido automaticamente. Uma falha de gravação devolvida pelo worker pode ser comunicada e permitir nova tentativa manual. Os limites podem ser injetados nos testes.

## Critérios de aceite

- [x] Dois ou mais pedidos consecutivos reutilizam o mesmo processo e o mesmo carregamento do modelo nos testes simulados; verificar com áudio real.
- [x] Cada pedido recebe sua própria transcrição ou erro; saída vazia e falhas são tratadas sem executar comando indevido nos testes automatizados.
- [x] Falha na inicialização ou encerramento inesperado é visível, sem travamento indefinido; saída normal encerra o processo nos testes automatizados.
- [ ] As opções de modelo, dispositivo, canal e diagnósticos aplicáveis funcionam em equipamento real; passagem das opções e modo texto foram testados com simulação.
- [ ] Tempos de inicialização e transcrição consecutiva são registrados junto às condições do teste; nenhuma meta de desempenho é presumida.

## Validação

- **Automatizada:** executados testes Node e Python, incluindo comunicação entre processos reais com modelo e áudio substitutos, para verificar carregamento único, associação de pedidos, erro, encerramento e compatibilidade do modo texto, sem mesa ou downloads.
- **Áudio real:** com participação do usuário, comparar frases e modelos sob condições registradas; medir tempo antes e depois e anotar erros. Disponibilidade de hardware não impede preparar a implementação e os testes simulados.
- **Mesa física:** se o fluxo completo for testado em modo real, fazê-lo em ambiente controlado e registrar separadamente o resultado; a especificação não requer alterar recursos adicionais da mesa.

## Decisões e questões abertas

- Solicitações antes do estado pronto ou enquanto outra está ativa são recusadas. Limites e falhas fatais encerram o processo e não reenviam pedidos. Uma falha reportada pelo worker permite nova tentativa manual.
- O terminal, com `--descrever`, informa o tempo de inicialização e o tempo total de gravação e transcrição de cada pedido; a gravação ainda dura cinco segundos. Comparações reais e metas dependem dos testes com o usuário.
- A indisponibilidade do dispositivo é reportada. Seleção estável após desconexão e reconexão continua pendente e será tratada na etapa de áudio multicanal.
