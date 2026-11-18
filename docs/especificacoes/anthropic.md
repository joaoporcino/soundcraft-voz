## Situação atual

- Estado: Adaptador implementado e testado isoladamente.
- Integração: Adaptador isolado para o contrato de provedor; integração ao serviço será tratada separadamente.
- Validação: Quatro testes com transporte falso e seletor; sem chamadas externas ou credenciais reais.

# Adaptador Anthropic

Fase 5 do [plano](../plano-de-execucao.md): implementar adaptador opcional para a API Messages da Anthropic, com modelo escolhido explicitamente, acesso por `ANTHROPIC_API_KEY` no ambiente, consentimento por pedido e tempo limite. Não selecionar automaticamente, persistir chave, invocar ferramentas ou comunicar-se com a mesa. O contexto deve ser estritamente fornecido pelo consumidor, sem inserir cadastros por conta própria.

Conforme a [API Messages oficial](https://platform.claude.com/docs/en/api/messages/create) e a [saída estruturada oficial](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), usar `POST /v1/messages` com cabeçalhos `x-api-key`, `anthropic-version`, `max_tokens`, modelo explícito e `output_config.format` com esquema JSON estrito. O modelo informado precisa suportar saída estruturada; modelos não confirmados falham com erro do serviço, sem alternativa automática. Exigir `stop_reason: end_turn`, um único bloco de texto JSON e contrato comum exato de intenção/alvo/ação/valor/relativo/esclarecimento; recusar recusa de modelo, saída incompleta, blocos imprevistos, dados malformados e propriedades adicionais. O consumidor continua responsável por validar alvo, parâmetros, permissões, conexão e confirmação determinística.

Testes usam somente transporte injetado, sem rede, chamadas pagas, credenciais ou mesa reais. Cobrir consentimento, isolamento de chave, configuração inválida, timeout, transporte, quota, HTTP, envelopes inesperados, recusa, truncamento, JSON e campos inválidos, e sucesso com contrato comum. Não incluir transcrição, resposta externa, credencial ou mensagem de exceção externa em erros ou logs.

## Evidências

Em 18/11/2026, `node --test test/anthropic-provider.test.js` passou 4/4; ESLint direcionado e `npm run docs:check` passaram. Os testes incluem timeout de transporte e leitura do corpo, erro com segredo, recusa, corte por limite, blocos inesperados, esquema inválido e compatibilidade com o seletor. Não houve chamada à Anthropic, nem validação de disponibilidade ou compatibilidade de um modelo real. Respostas continuam sujeitas às regras e confirmação do serviço.
