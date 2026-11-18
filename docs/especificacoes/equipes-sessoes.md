## Situação atual

- Estado: Implementado para cadastro e formação por sessão.
- Integração: Cadastro local, passagem guiada e serviço com sessão ativa.
- Validação: Testes com SQLite temporário e fluxo simulado; sem dados ou equipamento reais.

# Equipes, papéis e formação da sessão

Fase 4 do [plano](../plano-de-execucao.md): cadastrar grupos recorrentes, pessoas integrantes, papéis e funções habituais, associar grupos à sessão e registrar as participações e papéis efetivos para cada sessão. A mesma pessoa pode ter vários papéis e participar de grupos diferentes; o papel efetivo não precisa coincidir com sua função habitual. Duplicatas exatas, referências inexistentes, escalação de pessoa não integrante e participação de grupo não associado à sessão são recusadas atomicamente. Para evitar alterações silenciosas de formação, exclusões que deixariam participação sem membro ou grupo associado são bloqueadas; remover explicitamente cada participação primeiro. A formação é declaração do operador e não prova presença ou conexão física.

O terminal permite adicionar/listar grupos e papéis, incluir/remover/listar integrantes e funções habituais, associar/desassociar/listar grupos e adicionar/remover/listar participações por sessão. A passagem mostra formação por sessão junto aos demais vínculos. O serviço expõe a formação da sessão autenticada sem inferir que alguém da formação está falando; a revisão da formação integra o contexto das propostas e é revalidada após interpretação e antes da confirmação, recusando proposta antiga após alterações de formação. O dirigente ou qualquer papel jamais concede permissão de operação automaticamente. Sem sessão ativa permanece o fluxo legado. O serviço não envia dados da formação à LLM sem consentimento e autorização próprios.

SQLite v7 introduz tabelas relacionais com chaves estrangeiras e unicidade e preserva bases anteriores por migração transacional. A restauração valida estrutura canônica e invariantes e aceita versões anteriores suportadas. Testes com bancos temporários cobriram cadastro, múltiplos papéis, duplicatas, referências, remoções em conflito, persistência, migração, backup e alteração de formação por outra conexão antes da confirmação. A operação real e a conferência da formação permanecem pendentes. Programação ordenada de etapas e escalas de coral continuam fora desta entrega.
