## Situação atual

- Estado: Fluxo demonstrativo implementado.
- Integração: Componentes em simulação; serviço possui integração própria e limitada.
- Validação: Testes determinísticos; provedor e mesa físicos não testados.

# Fluxo integrado de comandos simulados

## Estado e vínculo

- Estado: implementada e validada em simulação; atividade de integração simulada após a auditoria, fases 1 a 3 e 5 do [plano](../plano-de-execucao.md).
- Revisão: 17/11/2026.

## Objetivo e escopo

Integrar transcrição textual identificada por entrada, política de modo, ativação, interpretação local ou provedor simulado, proposta, confirmação, validação final e execução exclusivamente no estado de mesa em memória. Não conecta hardware, captura áudio, executa serviço nem comprova confirmação da Ui24R. Provedor externo não é configurado automaticamente.

## Contrato

O controlador inicia desconectado; conexão simulada é explícita. Cada entrada mantém no máximo uma proposta com identificador opaco. Novo texto invalida sua proposta anterior, inclusive cancelamento. Uma mudança de política, desconexão ou invalidação explícita invalida propostas e interpretações pendentes; reconectar não as restaura. Confirmação exige o identificador exato, entrada correspondente e autorização explícita, e consome a proposta mesmo se falhar. A política de entrada, autorização de ativação e comando, conexão e parâmetros são verificados novamente antes de alterar o estado. A validação final converte novamente o comando interno em proposta completa; nenhum parâmetro é aceito da confirmação. Erros não são reportados como execução. Política e callbacks devem sinalizar alterações externas por invalidação quando uma revogação não puder ser observada no instante de execução.

## Critérios de aceite

- [x] Pedido local ou de provedor simulado só altera canal correto após confirmação autorizada.
- [x] Recusa, ambiguidade, cancelamento, confirmação repetida ou de outra entrada não alteram mesa.
- [x] Pausa, revogação, queda e resposta tardia não geram ação nem proposta recuperável após reconexão.
- [x] Saída identifica estado simulado; teste não acessa dispositivo, mesa física ou provedor real.

## Validação

Sete testes Node passaram em 17/11/2026 com estado e provedor em memória, incluindo recusa e concorrência. Este fluxo simulado isolado não foi integrado como tal ao serviço; o serviço possui fluxo próprio limitado com confirmação no terminal. Voz, mesa e provedor reais permanecem pendentes. A conexão neste teste é um sinal simulado, não um transporte de rede.
