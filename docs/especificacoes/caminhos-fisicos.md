# Caminhos físicos, patch e propostas por voz

## Situação atual

- Estado: Cadastro de caminhos e propostas por fala restrita implementados.
- Integração: Terminal, SQLite e captura manual do serviço; sem LLM neste fluxo.
- Validação: Testes com dados temporários e worker simulado; patch e ligações reais não verificados.

## Estado e objetivo

Implementado para cadastro e simulação na fase 4 do [plano](../plano-de-execucao.md). Registra e consulta caminhos de entrada e de retorno sem alterar a mesa, e permite que uma transcrição capturada ou fornecida pelo operador proponha vínculo de microfone a pessoa com revisão humana. Captura manual integrada é descrita em [captura para cadastro](captura-cadastro.md); não há LLM integrada a este fluxo.

## Modelo e regras

- SQLite versionado, migração transacional e compatibilidade de backup; mesa, medusa e outros dispositivos são configuráveis, sem quantidades fixas. Pontos representam portas, vias, equipamento, canais, AUX, pessoas e demais extremidades; números de entrada, via e canal são distintos.
- Ligações direcionadas por sessão têm origem, destino quando conhecido e estado proposto, confirmado, rejeitado ou revogado; confirmar requer extremidades válidas, ausência de conflito e origem/data. Corrigir é revogar explicitamente a ligação confirmada e propor outra, preservando histórico. Um ponto de destino físico não pode receber ligações confirmadas conflitantes; ramificações e mistura devem ser representadas explicitamente. Destinos desconhecidos permanecem propostos.
- Consulta apresenta caminhos e lacunas, sem percorrer ciclos indefinidamente. Apenas trechos confirmados constituem caminho confirmado. Patch físico é uma ligação própria, não inferir que entrada e canal coincidam. Não tratar cadastro como leitura ou prova de patch real.
- Expor no terminal criação e consulta de dispositivos/pontos, proposta/consulta/confirmar/rejeitar/revogar ligações e visualização de caminho de entrada e retorno. Acesso por IDs explícitos, validação e erros compreensíveis.
- Interpretar transcrição local simulada como dado, preservar frase e origem, buscar pessoa e microfone por critérios explícitos; candidatos duplicados ou pessoa inexistente geram esclarecimento. Canal só é inferido de caminho e patch confirmados, sem adivinhar; se ausente, manter pendente e solicitar esclarecimento. Oferecer revisão, correção, confirmação e rejeição pelo terminal. Propostas nunca executam comandos de mesa nem se tornam definitivas sem confirmação.

## Validação e limites

- [x] Testes Node usam bancos temporários e cobrem migração e backups anteriores/atuais, concorrência, referências e integridade.
- [x] Testes cobrem caminhos diretos e pela medusa nos dois sentidos, destino desconhecido, conflito, correção, ciclos, consulta e persistência em novo processo.
- [x] Testes de texto de voz incluem frase clara, duplicidade de cor, sem fio desconhecido, patch ausente, revisão, rejeição, permissão e nenhum comando ou integração externa.
- [ ] UI física, patch e equipamentos reais não são alterados nem considerados validados; conferência posterior com o técnico permanece registrada nas pendências.

**Resultado:** os caminhos são declarações do operador e a confirmação guarda origem e data, sem comprovar estado da mesa. A revisão de fala aceita transcrição textual em formato restrito; campos parciais e origem são preservados. O terminal confirma somente após revalidar caminho/patch. Testes automatizados incluem banco temporário, subprocessos, dispositivo e mesa simulados; não houve teste físico.
