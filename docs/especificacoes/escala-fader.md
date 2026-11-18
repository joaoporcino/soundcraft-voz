# Escala de fader de entrada

## Situação atual

- Estado: Implementado para fader de entrada no mix principal.
- Integração: Serviço e terminal; não abrange AUX, master ou ganho.
- Validação: Testes unitários, fluxo e HTTP/CLI com estado simulado passaram; Ui24R física pendente. Simulação não comprova a curva ou aplicação física.

## Objetivo e contrato

O operador pode distinguir posição absoluta em pontos de mudança relativa em pontos. A escala provisória adota 0 = -60 dB, 100 = 0 dB e interpolação linear em dB no intervalo permitido pelo protótipo. Não representa volume percebido nem toda a faixa da mesa. A biblioteca `soundcraft-ui-connection` 7.0.3 converte dB em posição linear do protocolo e vice-versa; sua curva e adequação da escala ainda exigem teste físico. Valores fora do intervalo são recusados, sem truncamento silencioso.

Pedidos relativos requerem uma observação de fader da conexão atual, recente (até cinco segundos) e dentro do intervalo. A proposta apresenta valor observado, horário, alteração e valor calculado. Na confirmação, a mesma observação deve continuar válida e recente; alteração, desconexão, expiração ou falta de estado recusam o pedido e exigem nova proposta. Uma observação recebida não prova aplicação física nem garante que não haja alteração externa não observada. Após envio, não reutilizar o estado observado para outro ajuste até receber nova observação. O serviço continua exigindo confirmação explícita e não repete pedidos.

## Critérios de aceite

- Conversões de limites, ponto intermediário e inversão usam a curva da biblioteca, com rejeição de números não finitos, fora de faixa e de resultados relativos fora da escala.
- Texto aceita unidade explícita em pontos ou dB. Valor absoluto positivo sem unidade, antes recusado pela faixa do comando legado, passa a significar pontos. No serviço, zero sem unidade gera pedido de esclarecimento, pois pode ser 0 pontos ou 0 dB; o fluxo legado independente conserva o comportamento anterior. Valores negativos continuam em dB.
- Comandos absolutos e relativos são revisáveis antes de enviar; relativos recusam estado desconhecido, antigo, invalidado ou alterado antes da confirmação.
- Os testes usam mesa e tempo simulados; medição física, concorrência com controladores externos não observados e limites adequados permanecem pendentes.

## Evidências

Em 18/11/2026, 30 testes direcionados passaram, cobrindo conversão, parser, validador, orquestrador, observação e confirmação do serviço com dependências simuladas. Após bloqueio inicial de loopback no sandbox, o teste HTTP/terminal com estado simulado passou fora do sandbox. O ajuste relativo só dispõe da última mensagem recebida, que pode não refletir alterações externas não observadas.
