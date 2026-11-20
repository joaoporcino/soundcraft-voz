## Situação atual

- Estado: Seletor e adaptadores de três provedores implementados.
- Integração: Serviço e terminal integram seleção persistente conforme [especificação](llm-servico.md); painel permanece pendente.
- Validação: Adaptadores, transporte e HTTP simulados; chamadas reais pendentes.

# Seleção de provedor de linguagem

## Objetivo e estado

Fase 5 do [plano](../plano-de-execucao.md): permitir que a lógica de interpretação seja independente de Gemini, OpenAI ou Anthropic. A entrega inicial criou uma base em memória, sem interface, persistência, ferramentas, mesa ou chamadas reais. A integração posterior ao serviço e terminal está descrita em [llm-servico](llm-servico.md).

## Contrato

O seletor conhece identificadores `none`, `gemini`, `openai` e `anthropic`. Um adaptador injetado implementa `interpret({text, context?, consent})` e devolve campos `intent`, `target`, `action`, `value`, `relative` e `clarification`. Os campos e tipos são validados de modo independente do provedor; dados e instruções inesperadas são recusados. O consumidor determinístico deve ainda validar alvo, parâmetros, autorização, conexão e confirmação antes de qualquer ação. Selecionar `none` ou provedor sem adaptador informa indisponibilidade, sem escolher outro automaticamente. Texto/contexto e consentimento explícito são verificados antes de invocar adaptador; erros não expõem mensagem, credenciais ou payload do provedor. Se a seleção mudar durante uma chamada, a resposta anterior é descartada; nenhum pedido é enviado automaticamente ao novo adaptador.

O projeto possui adaptadores HTTP para Gemini, OpenAI e Anthropic, testados com transporte falso. Seleção e modelo são persistidos com limite local de tentativas e o envio depende de consentimento explícito; a integração está em [llm-servico](llm-servico.md). Validação com provedores reais, custos financeiros e painel continuam pendentes.

## Aceite

- [x] Adaptadores simulados para Gemini, OpenAI e Anthropic usam o mesmo contrato; troca seleciona somente o adaptador solicitado.
- [x] Ausência de provedor/adaptador, consentimento negado, entrada inválida, erro e resposta malformada falham sem dados sensíveis e sem fallback automático.
- [x] Testes cobrem troca durante pedido e validam que nenhuma execução na mesa ou chamada real de rede ocorre.

**Validação histórica:** cinco testes dedicados passaram, incluindo adaptador Gemini existente com `fetch` falso, e a suíte Node 204/204 e ESLint passaram. Naquela rodada o seletor era isolado; a integração posterior e suas evidências são acompanhadas em [llm-servico](llm-servico.md).
