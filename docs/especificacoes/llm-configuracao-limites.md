## Situação atual

- Estado: Implementado e testado em simulação.
- Integração: Serviço local, terminal, provedores e backup.
- Validação: Testes Node e HTTP com provedores e transportes simulados; serviços reais pendentes.

# Configuração persistente e limite de uso de LLM

## Objetivo e decisões

Fase 5: persistir escolha `none`, Gemini, OpenAI ou Anthropic, modelo explícito e limite diário global de tentativas. Início sem configuração mantém `none`; provedores externos exigem limite inteiro positivo antes de ativação. Credenciais permanecem exclusivamente no ambiente do serviço e consentimento continua por pedido; nenhum texto, chave ou consentimento é persistido. Configuração e contagem serão protegidas em SQLite próprio, com transações e concorrência entre processos, sem compartilhar a migração do cadastro.

Cada chamada reserva uma tentativa atômica imediatamente antes de invocar transporte. Consumir cota mesmo para erro, timeout, resposta inválida ou abandono: o provedor pode ter cobrado. O limite é quantidade de tentativas por dia UTC, não mede nem limita gastos financeiros ou tokens; alterações de limite e provedor não zeram contagem. Relógio retrocedido bloqueia reservas até recuperação, sem antecipar renovação. Falha de banco, limite esgotado, falta de consentimento, ausência de chave ou provedor indisponível recusam antes da reserva e da chamada. O status informa apenas `credentialAvailable` booleano, sem valor da chave, e reflete alterações no ambiente do processo. Atualização concorrente invalida resultados tardios e não há troca automática nem replay.

Backup incluirá configuração e contagens, sem chaves, texto ou consentimento. Como restauração pode retroceder contagens, um marcador de recuperação impedirá chamadas até ação explícita do operador para reconhecer a restauração; histórico posterior ao backup não pode ser recuperado. A opção `none` permanecerá disponível. A proteção local não substitui limites do provedor, não impede uso por outros aplicativos e não protege contra alteração ou exclusão externa dos dados.

## Critérios

- [x] Configuração persistida e recuperada entre processos, sem segredos; falha ou conteúdo inválido falham fechados.
- [x] Terminal escolhe provider/modelo e limite, consulta e desativa; consentimento continua por pedido.
- [x] Reserva persistente e atômica recusa esgotamento, relógio retrocedido e concorrência; falhas e respostas tardias não devolvem cota ou executam operações.
- [x] Backup/restauração preserva configuração e contagens, impede uso até aceite explícito após restauração e lê versões antigas.
- [x] Adaptadores usam somente transporte simulado; execução física e provedores reais permanecem pendentes.

**Evidências:** 42 testes Node direcionados cobriram provedores, armazenamento, backup, cinco processos concorrentes, relógio retrocedido, falha consumindo cota, troca durante resposta tardia ou antes da confirmação e restauração de backup legado. Dez testes HTTP fora do sandbox cobriram seleção dos provedores, confirmação e preservação da contagem após reinício, com rede externa simulada. ESLint direcionado e verificação documental passaram. Não houve chamadas pagas nem validação física.

Após a auditoria de credenciais, 11 testes Node de LLM/estado passaram, incluindo ausência, adição e remoção de credencial para os três provedores sem reserva ou transporte enquanto ausente; ESLint direcionado passou. A disponibilidade informa somente booleano, sem verificar se a chave é válida no provedor.
