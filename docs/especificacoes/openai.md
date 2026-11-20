## Situação atual

- Estado: Adaptador implementado para o contrato de provedores.
- Integração: Serviço e terminal locais conforme [integração de LLM](llm-servico.md); o teste individual histórico abaixo usa adaptador isolado.
- Validação: Cinco testes e ESLint passaram com transporte falso; provedor real não testado.

# Adaptador OpenAI opcional

## Objetivo e contrato

Na fase 5, implementar adaptador da Responses API oficial para interpretar uma frase em proposta estruturada não confiável, sem executar ferramentas ou comandos. Modelo escolhido explicitamente e chave em variável de ambiente; não persistir credenciais, texto ou mensagens de erro da rede. Exigir habilitação e consentimento expresso por solicitação e falhar fechado antes do transporte quando ausentes, inválidos ou sem chave.

A requisição `POST /v1/responses` deve usar JSON Schema estrito e os seis campos do contrato do seletor. Enviar apenas frase e contexto explícito, `store: false`, sem ferramentas nem histórico; limitar saída, tempo e comprimento da entrada. O campo `store: false` não estabelece sozinho a política completa de retenção do provedor. Autorização, validação determinística de ações, confirmação, seleção persistente e cotas são responsabilidades separadas do serviço.

Aceitar somente resposta concluída com mensagem de texto estruturado válido; recusar resposta incompleta, recusa do modelo, conteúdo misturado, campos extras, JSON inválido, falha HTTP, quota, rede e timeout, sem expor segredo ou payload. Nenhuma chamada é repetida automaticamente. O adaptador não acessa equipamento, não chama função e não escolhe provedor alternativo.

## Critérios de aceite

- [x] Validar requisição e contrato de interpretação com transporte falso, modelo explícito, consentimento, limites e credencial apenas em cabeçalho.
- [x] Cobrir sucesso e esclarecimento, erros HTTP/rede/timeout, recusa, conclusão incompleta, dados inesperados e sigilo de erro.
- [x] Executar testes Node e ESLint locais sem rede; integração e testes reais permanecem pendentes.

## Validação

`node --test test/openai-provider.test.js`: 5/5; ESLint dos arquivos e verificação documental aprovados. O transporte foi inteiramente simulado, sem credenciais, rede, chamada paga, mesa ou avaliação do comportamento do modelo real. O modelo real deverá suportar Responses e saídas estruturadas; a escolha é explícita e não validada remotamente nesta etapa.

## Referências

- [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).
- [Saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
