# Processo de voz persistente

## Estado e vínculo

- **Estado:** proposta; ainda não implementada.
- **Plano:** [Fase 1 — Voz mais responsiva](../plano-de-execucao.md#fase-1--voz-mais-responsiva).
- **Última revisão:** 16/11/2026.

## Problema e objetivo

O protótipo atual inicia um processo Python e carrega o modelo Whisper a cada gravação de cinco segundos. O objetivo é reutilizar o processo e o modelo entre pedidos, reduzindo o trabalho repetido e tornando falhas observáveis. A melhora de latência precisa ser medida; não há valor garantido antecipadamente.

## Escopo

- Manter processo Python e modelo carregados enquanto a aplicação estiver ativa, para uma entrada de áudio por vez.
- Permitir que o Node solicite gravações/transcrições sucessivas e relacione cada resposta ou erro ao pedido correto.
- Informar inicialização, disponibilidade, falhas e encerramento e liberar recursos ao sair.
- Preservar, na medida aplicável, seleção de modelo, dispositivo e canal, diagnósticos, modo de texto e simulação existentes.
- Medir tempo de inicialização e de pedidos consecutivos com uma linha de base comparável.

## Fora de escopo

Detecção automática de fala e da palavra “mesa”, múltiplas entradas simultâneas, interface web, LLM e alteração do protocolo da mesa. A gravação de cinco segundos pode permanecer inicialmente; a detecção de silêncio será avaliada em atividade posterior da fase 1.

## Comportamento e integrações

1. O Node inicia o processo Python para o modo de voz e aguarda sinal de disponibilidade após o carregamento do modelo.
2. O usuário continua iniciando cada gravação manualmente; o Node envia um pedido identificado e recebe transcrição ou erro correspondente.
3. O serviço interpreta a transcrição pelo fluxo existente. Modo de texto não depende de iniciar o modelo.
4. Na saída, o Node encerra o processo e o Python libera o áudio. Falhas de inicialização, dispositivo ou processo devem ser informadas sem apresentar sucesso; a recuperação ou reinício deve ter comportamento definido e testado antes de implementado.

A proposta de comunicação é por mensagens estruturadas na entrada e saída padrão; formato, versão e estratégia de reinício são decisões de implementação. Diagnósticos devem ficar separados das mensagens de protocolo. A execução ao vivo continua seguindo as regras atuais da mesa; confirmação de envio não equivale a confirmação do estado da mesa.

## Critérios de aceite

- [ ] Dois ou mais pedidos consecutivos reutilizam o mesmo processo e o mesmo carregamento do modelo.
- [ ] Cada pedido recebe sua própria transcrição ou erro; saída vazia e falhas são tratadas sem executar comando indevido.
- [ ] Falha na inicialização ou encerramento inesperado é visível, sem travamento indefinido; recursos são liberados ao sair.
- [ ] As opções de modelo, dispositivo, canal e diagnósticos aplicáveis funcionam; modo texto e simulação continuam operacionais.
- [ ] Tempos de inicialização e transcrição consecutiva são registrados junto às condições do teste; nenhuma meta de desempenho é presumida.

## Validação

- **Automatizada:** usar processo/modelo substituto para verificar carregamento único, associação de pedidos, erro, encerramento e compatibilidade do modo texto, sem mesa ou downloads.
- **Áudio real:** com participação do usuário, comparar frases e modelos sob condições registradas; medir tempo antes e depois e anotar erros. Disponibilidade de hardware não impede preparar a implementação e os testes simulados.
- **Mesa física:** se o fluxo completo for testado em modo real, fazê-lo em ambiente controlado e registrar separadamente o resultado; a especificação não requer alterar recursos adicionais da mesa.

## Questões abertas

- Como tratar solicitações recebidas durante inicialização ou uma gravação em andamento?
- Qual política de tempo limite e reinício evita processos presos ou reexecução inesperada de pedidos?
- Como reportar indisponibilidade do dispositivo e garantir que uma reconexão não selecione outro microfone?
