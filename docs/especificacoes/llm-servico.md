## Situação atual

- Estado: Integração com provedores e limite persistente implementada em simulação.
- Integração: Serviço e terminal locais; Gemini, OpenAI e Anthropic opcionais.
- Validação: Testes de componentes e HTTP locais passaram com transporte simulado; nenhuma chamada real ou teste em equipamento físico.

# Integração opcional de LLM ao serviço

## Decisão e escopo

Fase 5 do [plano](../plano-de-execucao.md): conectar provedores ao fluxo de propostas sem chamada automática. Seleção, modelo e limite diário de tentativas são persistidos conforme [configuração e limites](llm-configuracao-limites.md). Orçamento financeiro e política de privacidade para uso real dependem do operador. O terminal informa que a transcrição poderá ser enviada ao provedor, gerar custo e que o limite de tentativas não é limite financeiro.

Seleção inicial `none`, sem persistir chave, texto ou consentimento. O operador seleciona provedor, modelo e limite diário explicitamente; a chave é lida da variável de ambiente do processo do serviço, nunca pelo terminal nem no repositório. `none` desabilita. A interpretação local continua independente e sem rede; pedidos textuais e capturas manuais com consentimento expresso podem usar provedor para texto desconhecido localmente. Sem consentimento, seleção ou cota, não há chamada; falhas não provocam troca automática nem execução.

A interpretação recebe apenas o trecho do pedido, sem cadastros nem contexto adicional. A saída é dado não confiável, validado por contrato e regras determinísticas; apenas vira proposta para revisão. Confirmação explícita separada, autorização e conexão são revalidadas no envio. Mudança de configuração, cancelamento, pausa, queda, solicitação substituta, fim do serviço e abandono do cliente invalidam respostas tardias e propostas. Usar transporte falso em todos os testes; não realizar chamadas reais ou pagas.

O contrato distingue explicitamente `set_points` (valor absoluto de 0 a 100) e `adjust_points` (variação assinada em pontos) de `set_level` em dB. O prompt deve instruir a pedir esclarecimento quando unidade, direção ou magnitude forem ambíguas; a interpretação não transforma dB em pontos. A validação da faixa, da origem e do estado observado para ajustes relativos permanece determinística no serviço.

## Critérios

- Seleção `none` e ausência de consentimento não chamam transporte. Permitir selecionar Gemini, OpenAI ou Anthropic com modelo e limite válidos, consultar status e desabilitar pelo terminal.
- Com opção explícita, validar o pedido e o resultado e exigir confirmação distinta antes de enviar; texto reconhecido localmente não chama provedor.
- Testar entrada maliciosa, resposta inválida, recusa de ação/ambiguidade, erro, mudança durante espera, desconexão, pausa, cliente abandonado e ausência de reenvio com serviço e transporte simulados. Cobertura por componentes e testes HTTP de integração passaram.
- Nenhuma chave ou transcrição persistida pela integração; testes automatizados não usam credenciais ou serviços reais. Custo, endpoint, privacidade e capacidade reais seguem sem validação.
