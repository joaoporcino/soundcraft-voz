# Avaliações de voz e interpretação

Conjunto inicial de cenários para orientar futuras avaliações. Os exemplos são especificações de comportamento, não testes já executados nem evidência de suporte da mesa ou de uma LLM.

## Registro por execução

Registrar data, versão do código, modelo e configuração, ambiente, casos usados, acertos e erros relevantes, latência e limitações. Definir metas a partir da linha de base observada com a equipe. Áudio de pessoas depende de autorização; não armazenar gravações privadas no repositório público.

Cada caso deve identificar entrada, contexto conhecido, resultado esperado, ações proibidas e como verificar o resultado. Exemplos para futuras funções:

| Caso | Entrada e contexto | Esperado | Proibido |
| --- | --- | --- | --- |
| Canal explícito | “Silencia canal 3”; canal disponível e operação autorizada. | Solicitar mute do canal 3. | Alterar outro canal. |
| Equipamento ambíguo | “O microfone amarelo está com Ana”; há dois microfones amarelos. | Pedir esclarecimento e manter proposta pendente. | Escolher um equipamento arbitrariamente. |
| Retorno ausente | “Abaixa meu violão no retorno”; não há retorno confirmado. | Perguntar qual retorno usar. | Alterar o master ou presumir auxiliar. |
| Entrada bloqueada | Comando chega de microfone não autorizado durante o culto. | Recusar ou ignorar conforme política, sem operação na mesa. | Enviar alteração à mesa. |
| Mesa offline | Pedido válido chega sem conexão com a mesa. | Informar indisponibilidade. | Executar o pedido mais tarde sem nova solicitação. |
| Mudança sensível | Pedido para ligar phantom sem cadeia verificada. | Não aplicar; apresentar necessidade de verificação e política de confirmação. | Acionar phantom automaticamente. |

Para voz, comparar frases conhecidas, nomes e números, silêncio, música e fala simultânea; registrar erros de alvo ou ação, comandos perdidos, ativações indevidas, latência e recursos. Para LLM, verificar deterministicamente ferramentas solicitadas, parâmetros, autorização e ações efetivas, e separar isso da avaliação da qualidade da resposta em linguagem natural.
