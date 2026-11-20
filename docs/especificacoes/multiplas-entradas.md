## Situação atual

- Estado: Implementada com validação parcial.
- Integração: Serviço e terminal com sessão ativa, vínculo de origem, propostas separadas e captura manual por entrada.
- Validação: Testes de fluxo, armazenamento, HTTP e workers simulados passaram; equipamentos reais permanecem pendentes.

# Múltiplas entradas e conversas

## Objetivo e escopo

Fase 3 do [plano](../plano-de-execucao.md): associar entradas identificadas a fontes de uma sessão, preservar conversas e propostas isoladas por entrada e impedir que confirmações concorrentes sobre o mesmo controle façam uma proposta antiga operar sobre estado modificado. O identificador de entrada não identifica a pessoa. Uma associação declarada não confirma conexão física ou dispositivo USB.

## Contrato e decisões

O CMD associa entrada identificada a fonte confirmada da sessão selecionada, com lista contextual e confirmação. A tela reconsulta sessão e fonte antes de chamar a operação transacional existente; não infere identidade ou ligação física. O comando recusa entrada já vinculada e não substitui associação silenciosamente. Testes com banco temporário cobrem escopo, cancelamento, duplicidade e vínculo confirmado.

A remoção revisada usa `bindingId` retornado pela lista e faz exclusão condicional atômica por sessão, entrada e identidade. Se a associação tiver sido removida ou substituída, recusa sem remover a nova. O comando legado permanece; não há mudança de esquema ou backup. O CMD mostra entrada e fonte e exige confirmação. Testes com banco temporário cobrem cancelamento, substituição concorrente e remoção normal, além do comando antigo.

- Persistir vínculo explícito de entrada a um vínculo de fonte confirmado da sessão, com referência íntegra, identidade opaca de entrada, unicidade por sessão/entrada e exclusão explícita; não selecionar pessoa nem canal por inferência. Migrar banco e preservar/restaurar backups de esquemas anteriores.
- Terminal define sessão ativa explicitamente no serviço. Quando ativa, cada origem precisa ter vínculo cadastrado nessa sessão; contexto expõe somente identificadores da sessão, entrada e vínculo, sem atribuir identidade da pessoa que fala. Antes de interpretar, após interpretação assíncrona e antes de confirmar, consultar novamente o banco e recusar vínculo removido ou modificado. Troca de sessão invalida pedidos. Sem sessão ativa permanece disponível o fluxo legado identificado por entrada. A gravação por outro processo após a última leitura pode concorrer com o envio; este limite não prova atomicidade com processos externos.
- Cada entrada tem contexto, ativação, geração e proposta independentes; novo texto ou cancelamento invalida apenas seu contexto. Queda, troca de modo ou revogação invalida as propostas afetadas; respostas tardias não reabrem conversas.
- Durante a persistência de uma alteração de permissões, bloquear pedidos e confirmações até terminar a gravação; invalidar pendências antes de iniciar a operação, inclusive em caso de erro.
- O mesmo controle da mesa tem geração compartilhada: confirmação de uma proposta invalida propostas anteriores sobre aquele controle. Antes do envio, confirmar conexão, origem, modo, autorização e parâmetros. Estado enviado não é confirmação da mesa. Comandos relativos não usam estado presumido.
- O terminal identifica entrada para texto e captura, com opção padrão compatível `principal`. Permissões são geridas pelo canal local autenticado. O trabalhador deve receber configuração de entrada explícita; qualquer restrição de captura e concorrência deve ser exposta e testada com trabalhadores falsos. Não iniciar microfones nem assumir estabilidade do índice do dispositivo.
- Entrada principal usa `voice-config.json`; até três entradas adicionais usam `voice-inputs.json` com dispositivo e canal explícitos e mesmo executável/modelo base. Alterar configuração exige reiniciar serviço; sessão ativa é transitória e precisa ser selecionada novamente. Cada entrada iniciada mantém worker próprio e modelo separado; isso pode consumir memória e não comprova que driver ou dispositivo aceitem capturas paralelas. Encerramento aguarda todos os workers. Uma revogação invalida o resultado de captura tardia, mas não interrompe necessariamente a gravação física em curso.
- O status do serviço mantém o campo `voice` da entrada principal e apresenta `voiceInputs`, lista das entradas configuradas com seus estados e erros individuais, inclusive quando ainda não iniciadas; consultar status não inicia workers nem captura.
- Identidades de dispositivo observadas e candidatas são isoladas por entrada; mudança durante a vida do serviço exige revisão e aceite explícito conforme [recuperação](recuperacao-servico.md). Metadados não comprovam identidade física.
- Terminal: `entrada-fonte vincular SESSAO ENTRADA VINCULO`, `entrada-fonte listar SESSAO` e `entrada-fonte remover SESSAO ENTRADA` no CLI de cadastro; `sessao ID|nenhuma`, `voz-entrada definir ENTRADA DISPOSITIVO|- CANAL`, `voz-iniciar [ENTRADA]`, `voz-capturar [ENTRADA]` e `texto-entrada ENTRADA FRASE` no CLI do serviço. Consentimento explícito por operação é requerido por `texto-entrada-llm ENTRADA --consinto FRASE` ou `voz-capturar-llm --consinto [ENTRADA]` antes de enviar transcrição ao provedor.

## Critérios de aceite

- [x] Vínculo persistente cria, consulta, remove, verifica sessão/fonte confirmada e detecta conflitos; migração e backup compatíveis são testados.
- [x] Conversas de entradas independentes, cancelamento, revogação, resposta tardia e propostas simultâneas passam em testes de fluxo.
- [x] Confirmações para o mesmo controle não aplicam silenciosamente proposta tornada obsoleta; controles diferentes progridem independentemente em testes de fluxo.
- [x] Serviço e terminal identificam origem sem alegar identidade; capturas simuladas cobrem seleção, concorrência e falhas.
- [x] Sessão ativa e vínculo removido ou alterado são revalidados no serviço e na confirmação; transição invalida pedidos em testes simulados.
- [x] Nenhum teste afirma como validado dispositivo, áudio, mesa ou reinício físicos não exercitados.

## Evidência e limites

Testes com SQLite temporário cobriram migração dos esquemas 4 para 5 e 5 para 6, restauração, vínculo e sua remoção/recriação; testes de fluxo cobriram propostas concorrentes, cancelamento independente e provedor atrasado. Workers falsos cobriram seleção, capturas paralelas, status por entrada e limite de quatro. Backup de formato 4 inclui as configurações de voz e mantém leitura de versões 1 a 3. Após falha inicial de loopback no sandbox, testes HTTP com serviço, trabalhadores e mesa simulados passaram fora do sandbox na suíte Node 246/246. Não foram testados driver, microfone, Whisper, Ui24R ou reinicialização reais.
