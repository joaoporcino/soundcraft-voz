# Passagem de som guiada

## Situação atual

- Estado: Revisão guiada e correção com histórico implementadas.
- Integração: Terminal de cadastro e SQLite; captura manual pelo serviço produz propostas sem comandar a mesa.
- Validação: Testes de terminal, migração e backup com bancos temporários; conferência física depende do usuário.

## Objetivo e escopo

Na fase 4, orientar a revisão de uma sessão pelo terminal: apresentar cadastros, vínculos, ligações e propostas pendentes com seus dados e instruções de revisão, permitindo confirmar, rejeitar ou corrigir conforme o tipo de registro. Toda confirmação exige ação explícita do operador. Uma declaração confirmada no banco não comprova o patch ou o funcionamento físico.

## Correção de cadastros e fontes

A revisão permite corrigir nome de pessoa e dados de equipamento existentes com revisão de valores, token do estado anterior e histórico transacional de antes/depois; dados antigos não são descartados. Pessoa e equipamento são cadastros globais: uma correção pode afetar todas as sessões que os referenciam e o terminal deve exibir esse aviso antes da operação. Para corrigir um vínculo de fonte confirmado, a passagem apresenta explicitamente as entradas afetadas e uma revisão de substituição que cobre vínculo e associações; dentro da mesma transação, conferir novamente a revisão, registrar a retirada, remover associações afetadas e criar uma nova proposta, nunca confirmada automaticamente. Se uma entrada for adicionada, removida ou alterada após a revisão, recusar sem mudanças. O vínculo retirado e seu histórico permanecem consultáveis e a entrada deverá ser vinculada novamente após confirmar a nova proposta. Revisão desatualizada, referências inválidas e falha na transação não alteram dados. Conflitos são conferidos na confirmação da nova proposta. Tokens não autenticam usuários.

A migração SQLite v6 adiciona histórico de correções e tabela de vínculos retirados. O vínculo original continua no banco para manter referências históricas, mas é exposto como `revogado` e excluído dos conflitos ativos e das fontes disponíveis. `passagem mostrar` exibe revisões e histórico; `passagem corrigir` altera pessoa/equipamento e `passagem substituir` retira explicitamente fonte confirmada e cria proposta. Apenas a nova proposta pode ser confirmada e vinculada à entrada. Testes com bancos temporários cobriram revisão concorrente, rollback por referência inválida, remoção de entrada, migração v5 e backup/restauração; nenhuma operação confirma caminho ou execução físicos.

## Comportamento e critérios

- `passagem mostrar SESSAO` apresenta a sessão, pessoas e equipamentos cadastrados, vínculos de fonte, retornos, ligações físicas e propostas de voz, com estados e instruções. Lista pendências e sinaliza canal ou destino desconhecido, proposta de voz incompleta e conflitos com vínculos confirmados de equipamento, canal ou retorno. Não substitui as validações na confirmação nem encontra todos os conflitos possíveis. Sessão inexistente é erro; nenhuma consulta modifica registros.
- `passagem confirmar SESSAO TIPO ID REVISAO [ORIGEM]`, `passagem rejeitar SESSAO TIPO ID` e `passagem corrigir SESSAO TIPO ID ...` validam que o registro pertence à sessão e está pendente antes de chamar as regras existentes. Os tipos são `vinculo`, `retorno`, `ligacao` e `voz`; confirmação de ligação exige origem. Correções de vínculo de fonte e proposta de voz editam apenas propostas; para retorno e ligação, rejeitar e propor novo registro preserva o histórico. O modelo de vínculo simples não possui rejeição: uma proposta pode ser corrigida, mas não rejeitada.
- Corrigir vínculo de fonte exige pessoa, equipamento e canal declarado ou `desconhecido`; validar referências e faixa. A confirmação mantém validação de conflitos existente. Operações inválidas não modificam os dados.
- `mostrar` apresenta uma revisão calculada para cada proposta; `confirmar` exige essa revisão e a verifica dentro da mesma transação da confirmação. Se outro processo alterar os dados da proposta desde a visualização, a operação é recusada e exige nova revisão. Aplicável a vínculo, retorno, ligação e voz; a revisão não comprova patch físico, nem detecta alterações em dados de objetos relacionados. O terminal alerta essa limitação: correções de pessoas ou equipamentos e alterações externas nos cadastros relacionados podem mudar o contexto sem invalidar a revisão da proposta.

## Validação

Em 18/11/2026, 25 testes direcionados passaram, incluindo alteração de proposta entre revisão e confirmação por instâncias separadas, e testes existentes de concorrência de cadastro e caminhos físicos. Após a correção com histórico e migração v6, a suíte Node passou 246/246 com dependências simuladas. Sem validação física.
- Testar por comandos em banco temporário uma sessão com propostas, correção e confirmação, recusa por conflito, sessão incorreta e persistência. Não há teste de mesa, sinais, áudio ou passagem física.
