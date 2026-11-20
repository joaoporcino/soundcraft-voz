## Situação atual

- Estado: Validador determinístico implementado.
- Integração: Serviço revalida propostas limitadas locais ou da LLM antes do envio.
- Validação: Testes automatizados e serviço simulado; aplicação física não comprovada.

# Validação determinística de propostas de ferramentas

## Estado e vínculo

- **Estado:** implementada e validada com testes automatizados locais; sem execução física.
- **Fase ou atividade no plano:** Fase 5 — LLM, ferramentas e apresentação; “Ferramentas e MCP”. Relacionada ao provedor opcional descrito em [gemini.md](gemini.md).
- **Dependências:** Node.js e contratos já existentes para comando de canal e conexão. Sem rede, provedor Gemini, MCP ou mesa física nos testes.
- **Data da última revisão:** 17/11/2026.

## Problema e objetivo

Respostas estruturadas do Gemini são propostas não confiáveis e não devem chegar ao adaptador da mesa sem validação determinística. Esta fatia cria uma barreira local que aceita somente ações já suportadas pelo projeto e exige alvo, parâmetros, autorização e pré-condições explícitos.

## Escopo e fora de escopo

Inclui `src/tool-validation.js` e `test/tool-validation.test.js`. Validar alvo explícito de canal 1–24, ações `mute`, `unmute` e `fader` conforme contrato e faixa existente no projeto, rejeitar campos inesperados ou ambíguos, consultar política de autorização injetada, e impor conectividade e confirmação para execução em modo live.

O módulo não executa ações, chama rede/LLM/MCP, define permissões globais nem opera a mesa. O serviço já o utiliza no fluxo limitado e reaplica conexão, modo e confirmação antes do envio. A validação não equivale a envio ou sucesso na mesa.

## Comportamento e integrações

- Recebe uma proposta estruturada e contexto de execução/política fornecidos pelo chamador; não confia em instruções, alegações de autorização ou pedidos embutidos na proposta.
- Exige canal inteiro explicitamente presente entre 1 e 24. Sem alvo, alvo múltiplo, faixa/alias, conflito ou forma ambígua, recusa sem escolher por conta própria.
- Aceita `mute`, `unmute` e `set_level` em dB de -60 a 0, além de `set_points` e `adjust_points` em pontos conforme [escala de fader](escala-fader.md). Ajuste relativo em pontos é proposta; só o serviço pode resolvê-lo com observação válida e confirmar novamente antes do envio. `adjust_level`, valores ausentes, não finitos ou fora de faixa são recusados.
- Rejeita propriedades desconhecidas e formatos malformados; parâmetros não são convertidos silenciosamente.
- A política de autorização é uma função injetada e consultada para cada ação/alvo; somente retorno literal `true` autoriza. Ausência, exceção ou negativa resulta em recusa.
- No modo live, exige `connected: true` e `confirmed: true`. Estado desconhecido/desconectado e confirmação ausente são recusas. Em modo simulation, pode produzir decisão sem enviar comandos.
- Nenhuma função desta camada tem acesso ao transporte ou invoca a mesa; a decisão é pré-condição para o serviço consumidor.

## Critérios de aceite

- [x] Propostas válidas de mute, unmute e fader são aceitas somente com canal explícito e parâmetros dentro do contrato/faixa.
- [x] Alvo ausente, múltiplo ou ambíguo, ação desconhecida, parâmetros inválidos e campos extras são recusados deterministicamente.
- [x] Política injetada é aplicada; ausência, falha e negação bloqueiam a proposta.
- [x] Live bloqueia quando desconectado, conexão desconhecida ou confirmação ausente; pré-condições satisfeitas apenas validam, sem executar.
- [x] Casos maliciosos e falhas são exercitados com `node:test`, sem rede, LLM ou mesa física.

## Validação

Executados em 17/11/2026: `node --test test/tool-validation.test.js` (8/8 passaram) e `npx eslint src/tool-validation.js test/tool-validation.test.js` (passou). Cobertura inclui payload malicioso com instrução extra, alvos ambíguos, limites, valores inválidos, autorização ausente/negada/com exceção, conectividade desconhecida/desconectada e falta de confirmação. Não houve rede, chamada ao Gemini, execução de comando nem teste com a Ui24R física; conectividade real e efeito na mesa permanecem não verificados.

## Questões abertas e decisões

- O serviço já utiliza o validador e confirmação para comandos limitados, inclusive propostas Gemini, com testes HTTP simulados; permissões por perfil e confirmação física permanecem pendentes.
