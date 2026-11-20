## Situação atual

- Estado: Cadastro e vínculos de sessão implementados parcialmente.
- Integração: Terminal e SQLite; a [passagem guiada](passagem-guiada.md) permite revisar e corrigir propostas de vínculo. Caminhos físicos são tratados em especificação própria.
- Validação: Testes com bancos temporários; conferência da sessão real pendente.


**Entrega em 20/11/2026:** o CMD corrige fonte e voz com revisão da proposta e das referências selecionadas na mesma transação; voz admite desconhecido. Os comandos anteriores permanecem disponíveis. Doze testes específicos com bancos temporários cobriram concorrência entre conexões, cancelamento e recusas; suíte Node 362/362, ESLint e verificação documental passaram. A recarga da tela foi conferida em 45 testes do menu. Não houve alteração de esquema ou backup, nem validação física. Tokens não autenticam, não comprovam estado físico e não detectam mudanças revertidas.

# Cadastro local e vínculos de sessão

**Rodada de relações em 20/11/2026:** a sessão apresentada é revisada na transação das operações de formação, criação de retorno e proposta de vínculo ou ligação. As regras específicas constam em [equipes](equipes-sessoes.md), [retornos](cadastro-retornos.md) e [caminhos físicos](caminhos-fisicos.md); os comandos legados permanecem disponíveis e não há mudança de esquema ou backup. Suíte compartilhada 400/400 com simulação.

**Entrega em 20/11/2026:** o CMD exige revisões transacionais das novas referências na substituição, além da revisão do vínculo e entradas. O comando anterior permanece disponível. Oito testes específicos passaram com bancos temporários, concorrência e rollback, inclusive restauração de backup; suíte Node 370/370, ESLint e verificação documental passaram. Sem validação física; tokens não autenticam, não comprovam patch e não detectam alterações revertidas.

## Estado e vínculo

- **Estado:** primeira fatia implementada e testada localmente; validação física pendente.
- **Plano:** Fase 4 — Sessão, equipe e retornos.
- **Revisão:** 16/11/2026.

## Objetivo e escopo da entrega inicial (histórico)

Criar armazenamento local para integrantes, equipamentos e sessões, permitindo propor e confirmar vínculos entre pessoa, equipamento e canal declarado. Suportar consulta por cor e tipo sem assumir que cor é única. Entregar acesso pelo terminal em etapa de integração; não usar LLM, voz, medusa ou leitura automática de patch nesta primeira fatia.

## Decisões e integração

**Revisão de referências:** a proposta pode receber revisões de sessão, pessoa e equipamento, verificadas atomicamente com a inserção para recusar dados relacionados alterados ou removidos desde a escolha. Operações existentes sem revisão mantêm comportamento anterior; a interface guiada passa as três revisões. Os tokens cobrem conteúdo, não autenticação ou estado físico, e não detectam uma alteração revertida aos mesmos valores. Não houve mudança de esquema. Testes com banco temporário cobrem alteração por outra conexão e ausência de gravação; não houve teste físico.

**Confirmação no CMD:** fonte proposta pode ser confirmada a partir de detalhe revisado na passagem, usando revisão verificada na transação. Não há rejeição de vínculo simples. Testes com banco temporário cobrem revisão desatualizada e cancelamento; conflito também é validado pelo domínio. Isso não comprova patch físico.

**Correção no CMD:** fonte proposta pode ser corrigida pelo detalhe, selecionando pessoa e equipamento e informando canal ou desconhecido, com revisão e confirmação. A tela usa `passagem corrigir-referencias-revisadas`; as revisões da proposta e das referências selecionadas são verificadas transacionalmente. A correção não confirma vínculo nem altera patch. Testes com banco temporário cobrem cancelamento, alteração concorrente e estado pendente.

**Substituição no CMD:** fonte confirmada pode ser substituída pelo detalhe, apresentando entradas associadas, selecionando novos dados e exigindo confirmação explícita. A operação verifica na mesma transação a revisão do vínculo e entradas e as revisões da pessoa e equipamento selecionados, preservando retirada, desvinculação e nova proposta pendente. O comando anterior não exige revisões das referências. Testes com banco temporário cobrem cancelamento, concorrência e preservação em recusas.

- SQLite local com `node:sqlite` para transações e integridade; requer Node.js 22.13 ou superior, no qual a API deixou de exigir flag experimental, mas ainda é experimental nessa linha. Guardar banco fora do repositório no mesmo diretório de dados do usuário da configuração; testes usam banco temporário ou em memória. A migração entre versões de esquema deve ser explícita e não apagar dados.
- Criar IDs internos estáveis, validar nomes, referências e canais de entrada de 1 a 24 e usar consultas parametrizadas. Cadastrar cores e modelos como texto opcional; transporte sem fio e tipo de cápsula são propriedades independentes.
- Vínculo é proposto ou confirmado; quando retirado de uso por substituição explícita é exposto como `revogado`, preservando o registro e suas referências históricas. Uma proposta pode ser corrigida na passagem guiada, com validação de referências, mas não rejeitada; a substituição de vínculo confirmado cria nova proposta e desvincula entradas sem confirmá-la automaticamente. Confirmar exige referências válidas, canal declarado e ausência de conflito confirmado ativo de equipamento ou canal naquela sessão; o sistema não presume que a entrada física e o canal sejam iguais. Um vínculo sem canal pode permanecer proposto. Não chamar a mesa nem modificar roteamento.
- Consulta por cor e tipo retorna lista; zero ou mais de um resultado não permite resolução automática. Uma pessoa pode ter vários vínculos em uma sessão.
- Dados persistidos podem conter nomes pessoais: não publicar o banco no Git, não incluir dados pessoais em fixtures, e documentar local e backup posteriormente.

## Critérios de aceite

- [x] Cadastros e sessões persistem em novo processo e aceitam nomes Unicode.
- [x] Vínculos iniciam como proposta, verificam referências e detectam conflitos antes de confirmar; diferentes sessões permanecem independentes.
- [x] Busca por cor retorna zero, um ou vários equipamentos sem selecionar arbitrariamente; canal desconhecido não é tratado como confirmado.
- [x] Comandos de terminal permitem criar e consultar os itens e propor/confirmar vínculos sem mesa ou frontend, com erros visíveis.
- [x] Testes de integridade, persistência, concorrência de dados e CLI passam com bancos temporários; validação de patch, dados reais e operação física ficam pendentes.

## Fora de escopo

Cadastro detalhado de grupos, medusa e retornos, reconhecimento de identidade por voz, LLM e equalização ficam para próximas fatias. Um canal declarado não comprova o patch atual da mesa.
