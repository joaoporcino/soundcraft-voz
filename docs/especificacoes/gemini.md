## Situação atual

- Estado: Adaptador opcional implementado.
- Integração: Serviço e terminal conforme [integração opcional](llm-servico.md); aceita transporte injetado e consentimento.
- Validação: Transporte simulado; chamada ao provedor real não validada.

# Provedor Gemini opcional

## Estado e vínculo

- **Estado:** primeira fatia implementada; testes locais simulados passaram. Integração e validação com serviço real não foram feitas.
- **Fase ou atividade no plano:** Fase 5 — LLM, ferramentas e apresentação; atividade “Provedor de LLM”.
- **Dependências:** Node.js 22.13+, interface injetável de transporte HTTP e configuração local explícita. Não depende da mesa, captura de áudio, MCP ou execução de ferramentas.
- **Data da última revisão:** 17/11/2026.

## Problema e objetivo

Preparar uma primeira camada opcional que envie uma solicitação de interpretação ao Gemini e receba uma proposta de intenção em formato estruturado, sem acoplar as regras do serviço a um SDK ou habilitar operações externas. O caminho local de comandos continua independente do provedor.

## Escopo e fora de escopo

Inclui `src/gemini-provider.js` e testes `node:test` em `test/gemini-provider.test.js`, com `fetch` injetável, credencial lida somente do ambiente, prazo máximo configurável, tratamento de erros de rede, timeout, HTTP e quota, contexto mínimo, consentimento explícito para envio e validação estrita de JSON.

Na entrega inicial, ficaram fora de escopo executar comandos, alterar a mesa, chamar ferramentas/MCP, ler arquivos ou executar comandos, persistir conversas, fazer retentativas automáticas, fallback para outro provedor, chamadas pagas nos testes, instalar dependências, integrar ao fluxo principal/CLI ou selecionar automaticamente modelo, política de privacidade e orçamento. A integração posterior está especificada separadamente e mantém consentimento por pedido e confirmação distinta da operação.

## Comportamento e integrações

Correção A6 testada com transporte simulado: envelopes e partes malformados produzem erro classificável `invalid_response_json`, inclusive itens nulos e tipos incorretos.

- A integração usa `generateContent` por HTTP oficial, com `fetch` injetável e sem dependência de SDK. A chave é obtida por `GEMINI_API_KEY` (configurável pelo nome da variável) no momento da chamada e nunca incluída em erros ou resultado público. O modelo padrão é `gemini-2.5-flash`, configurável pelo chamador.
- Cada chamada exige configuração habilitada e consentimento explícito para enviar a transcrição/contexto. Se não habilitada, sem consentimento, sem chave ou com entrada inválida, falha localmente sem requisição de rede.
- Enviar somente a fala necessária e contexto permitido explicitamente pelo chamador; não anexar histórico, dados pessoais, arquivos nem estado da mesa por padrão.
- Pedir resposta JSON sob um esquema limitado (`intent`, `target`, `action`, `value`, `relative`, `clarification`). Validar sintaxe e campos/tipos localmente; rejeitar campos desconhecidos, valores inválidos e conteúdo fora do contrato. A saída é apenas dado não confiável para revisão por lógica determinística posterior.
- A requisição define no máximo 512 tokens de saída. Isso não é limite financeiro e depende do comportamento do provedor.
- Resposta do modelo nunca é autorização, confirmação do usuário, execução de ação ou prova de resultado. Nenhuma operação de mesa ocorre neste componente.
- Usar timeout com `AbortSignal`; distinguir falha de rede, timeout, resposta HTTP de limite/quota (429), outros erros HTTP, corpo inválido e JSON fora do esquema. Não repetir chamadas automaticamente.
- Testes devem usar `fetch` falso/injetado e verificar corpo, destino, consentimento, redaction de chave, validação e falhas. Não acessar serviços reais nem consumir quota.

## Critérios de aceite

- [x] Provedor opcional e sem dependências instaladas; transporte pode ser substituído por fake.
- [x] Sem consentimento explícito, configuração desabilitada, falta de chave ou entrada inválida não ocorre chamada HTTP.
- [x] Chave fica restrita ao cabeçalho da requisição e não aparece em erros ou retorno.
- [x] Solicitação inclui somente entrada/contexto aprovado e exige resposta JSON.
- [x] JSON aceito é validado por esquema estrito; payload malformado ou incompatível é rejeitado com erro classificável.
- [x] Timeout, falha de rede, HTTP 429/quota e outros HTTP são tratados sem retentativa.
- [x] Nenhuma ferramenta, arquivo, comando ou ação na mesa é acessível ou executada pelo provedor.
- [x] Testes automatizados passam integralmente com transporte simulado; nenhum teste efetua chamada real/paga.

## Validação

Executados em 17/11/2026: `node --test test/gemini-provider.test.js` (6/6 passaram) e `npx eslint src/gemini-provider.js test/gemini-provider.test.js` (passou). Testes cobrem consentimento negado, chave ausente, entrada/contexto inválidos, timeout, rede, 429, HTTP 500, JSON inválido, esquema inválido, resposta válida e ausência de ferramentas. Nenhuma chamada real ao Gemini, custo, operação de mesa, áudio ou avaliação da qualidade da interpretação foi executada.

## Questões abertas e decisões

- O operador escolhe modelo e consente a cada envio, com aviso de custo; há limite local de tentativas, que não é limite financeiro. Limite de custo e política de privacidade para uso real continuam pendentes; controles constam na [arquitetura](../arquitetura.md) e na [especificação de integração](llm-servico.md).
- A implementação usa a API REST oficial `generateContent` com `x-goog-api-key` e `responseMimeType`/`responseSchema`, baseada na documentação oficial de [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output?lang=rest). A API continua oficialmente suportada; a [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) é recomendada para novos projetos, portanto a escolha de endpoint deverá ser reavaliada antes de integrar ao produto.
- A escolha de integração HTTP oficial nesta fatia evita adicionar SDK e dependências; reconsiderar SDK somente se houver necessidade demonstrada e compatível com escopo/permissões.
