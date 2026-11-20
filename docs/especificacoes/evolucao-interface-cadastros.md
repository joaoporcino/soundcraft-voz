## Situação atual

Rodada de 20/11/2026: os fluxos de equipe, formação, retorno, ponto referenciado e ligação usam operações revisadas do domínio, com verificação transacional do contexto selecionado; comandos antigos permanecem disponíveis. Suíte compartilhada 400/400 com simulação.

- Estado: Catálogo versão 2 para seis cadastros simples, seletores e telas de cadastro e operação parcialmente implementados no CMD; expansão do catálogo e demais ações permanecem pendentes.
- Integração: CMD usa adaptadores de cadastro e CLI do serviço; painel web usa API local própria com recursos limitados. O catálogo de apresentação não cria API compartilhada.
- Validação: Catálogo e seletor iniciais testados com banco temporário e adaptadores simulados; critérios não marcados seguem pendentes. Evidências e limites constam no [plano](../plano-de-execucao.md); não houve validação com mesa ou dados reais nesta rodada.


**Entrega em 20/11/2026:** o CMD corrige fonte e voz com revisão da proposta e das referências selecionadas na mesma transação; voz admite desconhecido. Os comandos anteriores permanecem disponíveis. Doze testes específicos com bancos temporários cobriram concorrência entre conexões, cancelamento e recusas; suíte Node 362/362, ESLint e verificação documental passaram. A recarga da tela foi conferida em 45 testes do menu. Não houve alteração de esquema ou backup, nem validação física. Tokens não autenticam, não comprovam estado físico e não detectam mudanças revertidas.

# Evolução da interface e dos cadastros

**Entrega em 20/11/2026:** o CMD usa variante de substituição que verifica vínculo, entradas e novas referências na transação, mantendo a operação anterior e a confirmação explícita. Concorrência, cancelamento e recarga foram testados com bancos temporários; oito testes específicos, suíte Node 370/370, ESLint e verificação documental passaram. Sem validação física; tokens não autenticam, não comprovam estado físico e não detectam mudanças revertidas.

## Objetivo e limites

Evoluir o CMD em telas modulares, fáceis de navegar e reaproveitáveis por uma futura interface web, reduzindo trabalho repetido. Preservar regras e contratos existentes do backend, seu comportamento e banco; não editar o SQLite diretamente a partir de metadados, nem apresentar como implementadas ações planejadas. A interface deve separar cadastros, revisão, configurações e comandos de mesa.

As primeiras fatias usam as operações já existentes e acrescentam apenas apresentação e adaptadores. Se uma funcionalidade exigir mudar esquema, operação, permissão, API ou efeito do backend, registrar a necessidade no plano e especificação apropriada antes da mudança, fazer testes de compatibilidade e manter explícita a dependência; não inventar suporte. Não há promessa de isolamento entre usuários locais ou acesso pela rede.

## Fronteiras e operações

| Área | Caminho atual | Contrato a preservar |
| --- | --- | --- |
| Cadastros no CMD | `terminal-registry-*` → `runRegistryCommand` → `openRegistry`/SQLite | Mesmas validações e transações do cadastro; comandos existentes continuam acessíveis. Cada execução pode abrir/migrar banco. |
| Mesa, modos e voz | CMD → `runLocalServiceCli` → serviço local autenticado → fluxo de domínio/mesa | Pausa, origem, conexão, cancelamento, confirmação e ausência de reenvio são do serviço. `sent` não prova aplicação física. |
| Painel web atual | navegador → API local restrita → operações de consulta/revisão existentes | Token, origem e revisão validados no servidor; não pressupor API genérica nem paridade total com o CMD. |
| Catálogo parcial | consumidor de interface → definições de apresentação → operações mapeadas e autorizadas | Catálogo não concede permissão, não executa SQL genérico e não expõe chaves, tokens ou propriedades internas. |

O serviço, o cadastro e os validadores continuam fontes de verdade para decisões e persistência. Não duplicar regras de negócio somente no formulário. A apresentação pode orientar e validar formato para dar feedback, mas reexecutar todas as validações definitivas na operação existente. Uma nova API compartilhada não é necessária para os primeiros formulários CMD e não será considerada pronta sem implementação e verificação próprias.

## Catálogo de apresentação previsto

Primeira fatia histórica: catálogo versão 1 em `src/terminal-catalog.js`, com entradas explícitas para pessoa e equipamento. A versão 2 acrescentou sessão, grupo, papel e dispositivo físico, com lista, criação, campos e rótulos explícitos. O renderizador comum continua tratando relações por telas específicas. A montagem dos argumentos é adaptador específico de cada operação, sem SQL e sem derivar escrita de campos desconhecidos. Uma definição sem operação explícita não habilita criação. Testes usam SQLite temporário ou adaptador simulado.

Definir por entidade identificador estável, categoria e rótulos; operações explicitamente habilitadas; origem e escopo de lista/detalhe; campos exibíveis, tipos e ordem; obrigatoriedade e ajuda quando conhecida; referência com consulta e identificador; valores de exibição, somente leitura, opcionais e estados disponíveis. O contrato deve ter versão própria e não depender de nomes físicos das tabelas na interface. Estado de implementação, permissões e disponibilidade devem ser explícitos; desconhecido é não editável até ser mapeado. As definições não devem registrar credenciais, dados pessoais nem representar o estado de hardware como comprovado.

Metadados são fonte de verdade para **apresentação**, não substituem o esquema SQLite ou o código de domínio. Regras repetidas devem ser reduzidas por contratos compartilhados ou verificadores, sem prometer inferência completa. Não são obrigatórias dependências externas ou um gerador de SQL. Campos novos de domínio dependem de operação, leitura, validação, migração, versões e testes, além de metadados. Mudanças feitas manualmente no banco ou no código não se propagam automaticamente e podem comprometer compatibilidade; divergências não devem habilitar gravação.

## Navegação, seleção e evolução de dados

Primeira fatia de seletores: a tela de vínculos da sessão escolhida oferece proposta com seletores de pessoa e equipamento. Cada seletor consulta registros atuais, apresenta nome, ID e atributos úteis, pagina, busca e permite voltar ou abrir criação correspondente. Antes de propor, a interface recarrega sessão e referências e envia revisões dos dados selecionados; a operação verifica novamente as três na transação da inserção. Tokens verificam conteúdo atual e não detectam uma mudança revertida aos mesmos valores. A confirmação é outra ação, disponível pelos comandos existentes, e não faz parte deste fluxo. Cancelamento, listas vazias, nomes repetidos, busca, paginação e mudança observada foram testados com adaptador simulado e banco temporário.

- Categorias e ordem orientadora estão na [análise](../analise-cadastros-e-interface.md). Mostrar listas, detalhes e ações disponíveis; retornar ao contexto anterior. A lista vazia explica como criar ou qual cadastro falta. Cadastro fora da ordem sugerida permanece possível quando suas próprias regras o permitem.
- Referências são escolhidas entre registros reais pelo nome e contexto, com identificador interno e informação suficiente para distinguir duplicatas; preservar escopo da sessão e filtro de elegibilidade. Não escolher o primeiro candidato automaticamente. Seleção vazia, cancelamento, indisponibilidade e fim da entrada não criam vínculo.
- Após criação ou alteração bem-sucedida, recarregar registros e seletores dependentes; recarregar ao retornar ou oferecer atualização explícita. Não afirmar atualização instantânea de outros processos. Revalidar dados, referências e escopo na operação; quando o backend fornece token de revisão, preservar e verificar na operação, informando os limites específicos de cada revisão; a correção de fonte e voz cobre as referências selecionadas.
- Mostrar proposta, pendências, conflito, revisão e estado separadamente; confirmação só por ação explícita e apenas quando a operação existente a suporta. Corrigir pessoa/equipamento deve usar revisão e histórico; substituir fonte confirmada deve preservar remoção de associações e proposta pendente. Confirmação de cadastro não comprova ligação ou patch físico.
- Usar entrada principal apenas onde o serviço atual o faz; configuração de múltiplas entradas e LLM não devem ser inventadas. Deixar função indisponível claramente identificada. Captura de voz é manual e falhas, interrupção e resultados tardios obedecem ao serviço.

## Evolução de esquema e compatibilidade

Primeira fatia de verificação: para pessoa e equipamento, o catálogo declara campos públicos editáveis e somente leitura, além de listas explícitas de internos e calculados, ambas vazias nesses dois casos. O verificador compara colunas e tipos com esquema SQLite canônico criado em memória a partir das migrações do código, confere operações e campos do formulário contra contrato explícito e valida o formato das respostas antes de exibi-las. Divergência bloqueia a ação afetada com erro claro. A verificação não autoriza escrita nem habilita colunas novas. O esquema em memória é referência do código, não auditoria completa do arquivo SQLite real; erros do banco real continuam tratados pelo cadastro. Testes cobrem campos extras, ausentes, operação não suportada e esquema incompatível sem gravar no banco do usuário.

Na versão 2, sessão, grupo, papel e dispositivo físico também usam classificação explícita e verificação por entidade contra o esquema canônico em memória e as respostas. Os comandos de lista e criação foram preservados e formulários foram exercitados em SQLite temporário; relações e configurações não se tornam editáveis por essa mudança.

As listas oferecem `U` para recarga explícita, além das recargas ao retornar ou após operações. Teste com adaptador simulado cobre mudança entre consultas; não há atualização instantânea entre processos.

Uma mudança estrutural requer migração versionada e compatibilidade com `src/backup.js`, restauração de versões antigas, consultas, operações, catálogo e testes. Verificadores futuros devem confrontar cobertura declarada por entidade/campo/operação com contratos e esquema de teste, distinguindo propriedades calculadas, internas e de armazenamento de campos públicos. Uma coluna adicional não é necessariamente um campo público; uma chave estrangeira não define rótulo, escopo, permissão ou regra de conflito. Um resultado de incompatibilidade deve ser claro e bloquear a ação afetada, sem tentativa de corrigir ou migrar estrutura fora do mecanismo existente.

## Critérios de aceite planejados

- [x] Uma entidade simples e uma com campos opcionais têm lista, detalhe e criação pelo catálogo, com mensagens, cancelamento e EOF testados; operações existentes e SQLite são usados sem migração nesta fatia.
- [x] Um seletor contextual usa banco temporário, distingue duplicatas, não pressupõe primeiro resultado, lida com vazio e revalida referência e sessão no envio; a proposta de fonte verifica revisões transacionalmente.
- [ ] Vínculos usam estados e operações próprias, nunca confirmação automática; revisões antigas, alterações de contexto e conflitos são recusados conforme contrato existente.
- [ ] A alteração de rótulos e campos já suportados no catálogo se reflete no renderizador consumidor; campo desconhecido ou operação indisponível não é habilitado. Testes demonstram os limites de evolução, inclusive mudança de dados por outro processo.
- [ ] Fluxos CMD executam testes sem acesso a mesa, voz real ou provedor pago; testes de regressão existentes de domínio, backup, serviço e CLI continuam passando. Evidências separam testes unitários, subprocessos, simulações, navegador e ambiente real.
- [ ] Ajustes futuros de web reaproveitam apenas contratos expostos, sem remover validação no servidor nem ampliar rede/ACL implicitamente. Validação visual e fluxo em navegador real são registrados separadamente.

## Validação e questões abertas

Primeiro testar com banco temporário e serviço/mesa simulados, falhas, EOF, cancelamento, paginação, concorrência, migração e restauração quando o escopo atingir essas áreas. Conferir legibilidade e navegação no CMD do Windows e no computador da igreja com dados de exemplo; teste controlado de áudio e mesa é uma etapa distinta. Os detalhes do formato do catálogo, a fronteira concreta do adaptador e as dependências de biblioteca serão escolhidos e documentados por fatia; não são implementação existente.
