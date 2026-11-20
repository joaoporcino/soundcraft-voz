## Situação atual

- Estado: Cadastro de AUX e vínculos implementado.
- Integração: Terminal e SQLite; não altera roteamento da mesa.
- Validação: Testes com banco temporário; capacidade e caminhos físicos não verificados.

# Cadastro de retornos AUX

**Rodada em 20/11/2026:** o CMD usa variantes revisadas de criação de retorno e proposta de vínculo, conferindo sessão, configuração ou referências apresentadas dentro da transação da gravação. A revisão do retorno inclui a contagem exibida de pessoas confirmadas. Os comandos anteriores continuam disponíveis; a proposta permanece pendente até confirmação separada. Sem alteração de esquema ou backup. Testes direcionados passaram 62/62; suíte compartilhada 400/400 com simulação. Os três primeiros parágrafos de contrato abaixo descrevem historicamente as telas antes desta rodada.

## Estado e objetivo

Fase 4 do [plano](../plano-de-execucao.md). Registrar na sessão os auxiliares conforme quantidade configurada na instalação e propor, revisar, confirmar ou rejeitar a associação de pessoas a eles. O cadastro não altera nem lê a mesa, não identifica quem está falando e não valida saída física, medusa ou disponibilidade do fone.

## Contrato

O CMD permite alterar a quantidade de AUX na tela de configuração, mostrando o valor atual, solicitando valor positivo e confirmação explícita e chamando `aux-config definir`. A operação existente decide o limite e bloqueia reduções conflitantes; a tela não detecta capacidade física. A reconsulta antes do envio não é revisão transacional. Testes com banco temporário cobrem configuração ausente, cancelamento e recusa de redução.

O CMD cria retorno na sessão selecionada a partir da lista, apresentando configuração de AUX e pedindo número e confirmação. O domínio valida configuração, faixa e unicidade; a operação não configura a mesa. Sessão e configuração são reconsultadas antes da operação, sem revisão transacional. Testes em banco temporário cobrem ausência de configuração, duplicidade, cancelamento e sucesso.

O CMD propõe vínculo de retorno pela lista da sessão, selecionando pessoa e retorno restrito à sessão, com confirmação explícita da proposta. A tela reconsulta referências e sessão antes de chamar o comando de domínio; a proposta não é confirmada automaticamente e não comprova disponibilidade física. O contrato atual não recebe revisão transacional das referências. Testes com banco temporário cobrem cancelamento, ausência de retorno na sessão, escopo e proposta pendente.

O detalhe permite confirmar ou rejeitar proposta e revogar vínculo confirmado usando operações específicas. A tela consulta a passagem e mostra estado; as três ações enviam revisão verificada na transação do domínio. A revisão não cobre dados relacionados. Testes com banco temporário cobrem estados, conflito, cancelamento, revisão antiga e preservação do histórico sem operação física.

- Um retorno é identificado por sessão e número positivo de AUX, limitado pela quantidade configurada no SQLite e único nessa sessão. Banco novo inicia sem quantidade: o operador precisa configurá-la explicitamente pelo terminal; não presume hardware. Bancos v1/v2 migrados preservam 8 como limite legado não confirmado, compatível com as regras anteriores. A alteração explícita marca a origem como configurada. A redução é recusada se algum retorno cadastrado, inclusive em sessão antiga, exceder o novo limite; não apagar ou reatribuir dados automaticamente. Configuração e inclusão são transacionais para impedir corrida. Essa quantidade é configuração informada, não valida capacidade física. A identificação da saída física e eventual par estéreo são escopo posterior e não são presumidos.
- Um vínculo associa sessão, pessoa e retorno já cadastrados e inicia como `proposto`; pode ser confirmado ou rejeitado. Rejeitar é definitivo. Para trocar retorno confirmado, o operador revoga explicitamente o vínculo anterior e confirma uma nova proposta; o estado `revogado` preserva o histórico. Vínculos revogados não podem ser confirmados novamente. Um vínculo confirmado não pode ser rejeitado silenciosamente.
- Na mesma sessão uma pessoa pode ter no máximo um retorno confirmado nesta primeira fatia. Um AUX pode ser compartilhado por várias pessoas; a consulta informa os vínculos e o total de pessoas confirmadas no retorno. Propostas não são tratadas como confirmadas. A contagem de registros não prova exclusividade física ou disponibilidade, inclusive quando igual a um, e não autoriza roteamento.
- A confirmação é transacional e recusa conflitos sem alterar o vínculo proposto. Sessões diferentes são independentes. Chamadas parametrizadas, validação de IDs e chaves estrangeiras protegem a integridade.
- Migração SQLite v1/v2→v3 é transacional, preserva dados existentes e deve ser segura para processos concorrentes. Novos bancos usam v3 sem configuração inicial. Backup reconhece e valida esquemas canônicos v1, v2 e v3, preserva a recuperação de backups existentes e rejeita estruturas ou dados inválidos. Nenhuma credencial ou áudio é incluído.
- O terminal permite registrar e listar AUX, propor/listar/confirmar/rejeitar vínculos e mostra IDs e estados. Não existe envio de som, decisão de rota, TTS nem vínculo automático com microfone.

## Critérios de aceite

- [x] Configurar e consultar quantidade por terminal e API, com estado ausente explícito e sem declarar capacidade física detectada.
- [x] Permitir AUX 9 quando configuração autorizar; recusar maior que configurado, zero, quantidade inválida e redução que afetaria registros existentes, inclusive com concorrência.
- [x] Migrar bancos v1 e v2 para v3 sem perda, identificando o valor legado; exportar e restaurar v1/v2/v3 e configurações ausentes/definidas.

- [x] Criar/listar retornos e vínculos por sessão; rejeitar AUX inválido, duplicado ou referência inexistente.
- [x] Confirmar associação e impedir dois retornos confirmados para a mesma pessoa na sessão; permitir retorno compartilhado, preservando propostas e estados.
- [x] Rejeitar proposta e impedir confirmação posterior ou alteração silenciosa de vínculo confirmado; revogação explícita preserva histórico e permite trocar o retorno.
- [x] Reabrir banco e migrar versão anterior preservando dados, incluindo concorrência e falha de versão futura.
- [x] Exportar/restaurar banco v2 e aceitar backup com esquema v1, com validação e testes em diretórios temporários.
- [x] Comandos de terminal e testes automatizados passam sem equipamento nem rede. Validação dos vínculos reais e caminhos físicos permanece dependente do usuário e do técnico.

**Validação:** 31 testes Node de cadastro, migração, CLI e backup passaram, incluindo confirmação e migração concorrentes e arquivos temporários; ESLint aprovado. Nenhuma mesa ou dado real foi acessado. A contagem de registros não demonstra exclusividade física nem alimenta automaticamente a fila de áudio.

**Configuração v3:** 39 testes direcionados de cadastro, migração, CLI e backup e ESLint passaram. Testes incluem AUX 9 com limite 10/12, recusa de redução com retorno cadastrado, corrida entre mudança de limite e cadastro, rollback de falha na migração, v1/v2 legados e v3 com configuração ausente ou explícita. Dados e capacidades físicas não foram testados.
