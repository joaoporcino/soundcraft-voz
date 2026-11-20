## Situação atual

- Estado: Orquestrador de texto implementado.
- Integração: Serviço usa entradas identificadas, parser local e provedores opcionais Gemini, OpenAI e Anthropic com consentimento explícito, conforme [integração](llm-servico.md).
- Validação: Testes determinísticos; voz, provedor e mesa reais pendentes.

# Orquestração de pedidos de voz sem execução

## Estado e vínculo

- **Estado:** módulo integrado ao serviço para modos, entradas identificadas, parser local e Gemini opcional; testes HTTP simulados passaram e validação física permanece pendente.
- **Fase ou atividade:** Fase 3 — Voz por múltiplas entradas e modos; integração textual de ativação e política de modos. Dependência futura relacionada: Fase 5 — provedor LLM e validação de ferramentas.
- **Data da última revisão:** 17/11/2026.

## Problema e objetivo

Correção A2/A3 implementada e testada com provedor falso: cancelamento, mudança de política e revogação observada invalidam a ativação e respostas assíncronas anteriores. Mudanças de autorização externa devem chamar `invalidate(inputId)` para detectar revogação mesmo sem fala; o callback isolado não informa alterações ao orquestrador. Isolamento por entrada foi testado sem operação física.

O módulo combina ativação, modos, parser, provedor opcional e validação. O serviço o utiliza com provedor opcional, devolve proposta e exige confirmação antes do envio à biblioteca; o próprio orquestrador não controla a mesa.

## Escopo do módulo isolado

Entregar `src/voice-orchestrator.js` e testes `node:test` em `test/voice-orchestrator.test.js`. O orquestrador recebe texto transcrito, `inputId` e dependências injetadas; consulta a política de modo antes de processar ativação, parser ou provedor; trata ativação “mesa”, cancelamento e ambiguidade; tenta primeiro o parser local `parseCommand`; pode consultar provedor de interpretação injetado somente com consentimento explícito; valida propostas estruturadas com `validateToolProposal`; e retorna uma proposta que informa se precisa de confirmação.

Não inclui frontend/CLI, alteração de `src/index.js`, captura ou geração de áudio, reconhecimento de fala, execução ou agendamento de comandos, conexão à mesa, chamadas reais ao Gemini ou acesso à rede. Propostas jamais são confirmação do usuário nem resultado efetivo da mesa.

## Comportamento e integrações

- Dependências são injetadas ou instanciadas de forma pura/testável. A política de modo é fail closed: entrada bloqueada ou erro de consulta encerra o fluxo antes de qualquer chamada ao parser local ou ao provedor. A autorização de ativação e a autorização por comando devem ser verificadas; o `inputId` é origem opaca, nunca identidade presumida.
- Ativação textual aceita “mesa” conforme o módulo existente. Espera de continuação, cancelamento e ativação ambígua preservam os estados do módulo; cancelamento encerra sem proposta nem provedor. Texto sem ativação não interpreta comandos.
- Para pedido ativado, tenta o parser local. Parser válido produz proposta local; parser não reconhecido pode seguir ao provedor apenas se ele foi injetado e o consentimento explícito for `true`. Falha ou ausência de consentimento não chama o provedor e retorna estado seguro e explícito.
- Resultado do provedor é dado não confiável. Validação determinística exige alvo/canal explícito, parâmetros válidos e autorização; ambiguidades, permissões insuficientes, alvo/canal ausente ou inválido são recusados ou retornados para esclarecimento, sem escolher valores por conta própria.
- Toda proposta aceita exige confirmação humana antes de qualquer execução futura. Este módulo apenas retorna dados, origem e estado de confirmação necessário; não tem acesso ao adaptador ou transporte da mesa.
- Testes usam parser, política, provedor e autorização observáveis/falsos. Não fazem rede, chamada real ao Gemini, captura de áudio ou operação física.

## Critérios de aceite

- [x] Modo pausado/bloqueado ou falha da política impede parser e provedor; nenhuma chamada LLM ocorre antes do gate.
- [x] Ativação ausente, espera de continuação, cancelamento e ativação ambígua têm resultados determinísticos; cancelar não chama provedor.
- [x] Parser local reconhecido evita provedor; texto não reconhecido só consulta provedor injetado com consentimento explícito.
- [x] Consentimento ausente/negado, autorização negada/indisponível e erros falham fechados sem proposta executável.
- [x] Saída de provedor com ambiguidade, canal ausente/ambíguo, ação ou parâmetros inválidos é recusada ou pede esclarecimento; canal válido ainda requer autorização.
- [x] Proposta válida comunica que confirmação é necessária e nunca executa comando nem chama adaptador.
- [x] Testes determinísticos cobrem permissões, origem/inputId, canais, ambiguidades, cancelamento e riscos de não execução, sem rede ou chamadas reais.

## Validação

Executados em 17/11/2026: `node --test test/voice-orchestrator.test.js` (13/13 passaram), `npx eslint src/voice-orchestrator.js test/voice-orchestrator.test.js` (passou) e `git diff --check` (passou; apenas avisos CRLF em alterações pré-existentes do checkout). Cobertura simulada inclui bloqueio antes do parser/provedor, política que lança exceção, invalidação de ativação pendente ao bloquear, revogação de modo e autorização durante chamada assíncrona ao provedor, ativação/cancelamento/ambiguidade, consentimento, autorização e canais inválidos. Nenhuma chamada real ao Gemini, rede, captura de áudio ou operação física foi realizada. O modo retornado permanece `simulation`; confirmação e execução não são implementadas.

## Questões abertas e decisões

- Consentimento é fornecido por chamada do consumidor; interface e persistência do consentimento ficam fora desta fatia.
- A integração no serviço revalida modo, conectividade, parâmetros e confirmação antes do envio. Gemini e múltiplas entradas têm testes HTTP simulados; validação real permanece pendente e a autorização não prova aplicação na mesa.
