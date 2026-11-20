# Análise dos cadastros e da interface

Data: 19/11/2026. A análise inicial registra uma proposta; posteriormente, o catálogo versão 2 passou a cobrir pessoa, equipamento, sessão, grupo, papel e dispositivo físico, conforme a [especificação](especificacoes/evolucao-interface-cadastros.md) e o [plano](plano-de-execucao.md). A revisão foi feita no código e na documentação locais, inclusive alterações ainda não versionadas, sem acessar banco da igreja, serviço, mesa ou áudio reais. As afirmações da análise inicial abaixo são históricas; resultados posteriores estão no plano.

## Conclusão

O cadastro já tem regras e persistência relevantes, mas telas, comandos e banco descrevem os dados separadamente. Recomenda-se um catálogo explícito de entidades e operações, consumido por uma interface genérica de terminal e, depois, pelo painel web. Esse catálogo deve representar apenas operações autorizadas e chamar as regras existentes. Ele pode tornar automática a apresentação de campos declarados e sinalizar divergências; não pode, por si só, descobrir o significado ou a segurança de qualquer alteração arbitrária no banco.

## O que existe hoje

### Inventário de fronteiras — 19/11/2026

Conferência dirigida em `src/registry-cli.js`, `src/physical-registry-cli.js`, `src/terminal-registry-screens.js`, `src/terminal-registry-forms.js`, `src/local-service-cli.js` e `src/local-service.js`. A tabela é um mapa de famílias; argumentos exatos e regras definitivas continuam nos comandos e nas especificações de domínio. Consultas podem abrir ou migrar o banco local. Erros do cadastro são apresentados pela tela e não equivalem a gravação concluída.

| Família e entrada | Saída e efeito | Confirmação, revisão e limites |
| --- | --- | --- |
| Pessoa, equipamento, sessão, grupo, papel: listar e adicionar/criar | CLI devolve JSON; criação persiste no cadastro local. O menu lista, detalha e oferece formulário para esses tipos. | Formulário pede `SIM`; operação valida dados. Correção de pessoa/equipamento via passagem usa revisão e histórico; nomes e cores não são únicos. |
| Integrantes, funções, grupos e formação da sessão: IDs e operações específicas | Inclusão/remoção altera relações; formação mostra composição por sessão. Menu só consulta relações. | Não inferir função a partir de nome; conferir grupo e sessão. Não há revisão genérica no formulário atual. |
| Fonte e entrada: sessão, pessoa, equipamento, canal opcional; entrada e vínculo | `propor` persiste proposta; `confirmar` altera estado; associação de entrada usa vínculo confirmado. Menu apenas consulta. | A passagem oferece revisão e substituição; vínculo declarado não comprova patch. Substituir remove associações de entrada e cria proposta pendente. |
| AUX, retorno e vínculo de retorno: quantidade, sessão, AUX, pessoa | Configuração, criação e propostas persistem; confirmar, rejeitar e revogar são operações distintas. Menu consulta. | Quantidade é declarada, não descoberta; retorno confirmado não comprova ligação física. |
| Dispositivos, pontos e ligações: tipo, referências, direção, sessão e origem | Dispositivo pode ser criado no menu; pontos e ligações têm operações específicas no CLI. Consulta de caminho não controla a mesa. | Ligação exige confirmação explícita e origem; desconhecido não pode ser tratado como confirmado. Rejeição e revogação são distintas. |
| Proposta de voz e passagem: sessão, frase ou IDs e revisão | CLI permite propor, listar, corrigir, confirmar e rejeitar conforme tipo; passagem reúne revisão e histórico. | Confirmação por passagem exige revisão; o painel aplica validações adicionais de sessão e revisão. Não há identificação física automática. |
| Serviço: CLI administrativo, modo, sessão, texto, captura e confirmação | CLI usa canal local autenticado; serviço mantém estados e chama adaptadores. `/status` informa conexão e necessidade de reinício. | Pausa e mudanças invalidam propostas; confirmação de envio não confirma aplicação física. Captura é manual; não há reenvio automático de pedidos antigos. |
| Painel: `GET /painel/api/sessoes`, `GET /painel/api/passagem`, `POST /painel/api/revisar` | Consultas e revisão limitadas sobre cadastro; resposta JSON ou erro HTTP. | Token local; POST exige origem local exata e revisão. Tipos e ações são limitados e algumas correções exigem terminal. Não existe API genérica de cadastro. |

O menu carrega novamente as listas ao retornar e após criação; não garante atualização contínua entre processos. A seleção de pessoa e equipamento por nome e contexto foi acrescentada posteriormente para propostas de fonte; outros seletores permanecem pendentes. O serviço e painel não substituem as operações de domínio, e a capacidade local não estabelece isolamento entre usuários capazes de ler o manifesto.

#### Operações do cadastro local

Referência de argumentos: ajuda exportada por `registry-cli.js`; roteamento adicional em `teams-cli.js`, `physical-registry-cli.js` e `soundcheck-cli.js`. Salvo indicação, a saída é JSON do resultado e erros são propagados ao chamador; as mutações abaixo são explícitas no CLI e não pedem uma segunda confirmação por si mesmas. A revisão apresentada pelo menu é uma camada de interação, não autorização.

| Operação | Entrada e resultado/efeito | Revisão e limite |
| --- | --- | --- |
| `pessoa adicionar/listar` | Nome cria pessoa; listar devolve pessoas. | Correção global e histórico são feitos por passagem; nome pode repetir. |
| `equipamento adicionar/listar` | Nome, tipo e opcionais criam equipamento; lista aceita cor opcional. | Não identifica fisicamente pela cor; correção global usa passagem. |
| `sessao criar/listar` | Nome cria; lista devolve sessões. | Sessão é declaração local. |
| `grupo`, `papel` adicionar/listar | Nome cria grupo ou papel; listas devolvem registros. | Papel não concede permissão. |
| `grupo-integrante adicionar/remover/listar` | Grupo e pessoa; inclui, remove ou lista membros e funções. | Exclusão com função ou formação dependente é bloqueada; não há revisão transacional do contexto. |
| `grupo-funcao adicionar/remover` | Grupo, pessoa e papel alteram função habitual. | Integrante e papel devem existir; não escala automaticamente na sessão. |
| `sessao-grupo adicionar/remover` | Sessão e grupo alteram associação. | Dependências de formação bloqueiam remoção. |
| `sessao-integrante adicionar/remover` | Sessão, grupo e pessoa alteram formação. | Requer grupo associado e integrante; dependências bloqueiam remoção. |
| `sessao-papel adicionar/remover` | Sessão, grupo, pessoa e papel alteram função efetiva. | Não concede autorização nem presume função habitual. |
| `formacao mostrar` | Sessão; devolve grupos, integrantes e papéis. | Consulta não prova presença física. |
| `vinculo propor/propor-revisado/listar/confirmar` | IDs de sessão, pessoa e equipamento, canal opcional; cria proposta, lista ou confirma por ID. A variante revisada recebe três tokens. | Variante revisada verifica conteúdo na transação; confirmação direta valida domínio, enquanto passagem exige revisão da proposta. Nenhuma prova patch. |
| `entrada-fonte vincular/listar/remover` | Sessão, entrada e vínculo confirmado para associar; lista ou remove associação. | Confere vínculo e escopo; não identifica pessoa ou conexão física. |
| `aux-config mostrar/definir` | Consulta ou define quantidade de AUX. | Redução incompatível é recusada; quantidade é informada, não detectada. |
| `retorno adicionar/listar` | Sessão e número AUX criam retorno; lista por sessão. | Limite depende de configuração; não configura roteamento. |
| `retorno-vinculo propor/listar/confirmar/rejeitar/revogar` | Sessão, pessoa e retorno criam proposta; demais ações usam IDs ou sessão na listagem. | Estados e conflito por pessoa são validados no domínio; passagem pode exigir revisão na confirmação. |
| `fisico-dispositivo adicionar/listar` | Nome e tipo criam dispositivo declarado; lista consulta. | Não descobre hardware. |
| `fisico-ponto adicionar/listar` | Tipo, etiqueta e referências/direção opcionais criam ponto; lista consulta. | Validação de tipo e referência no domínio; não lê patch. |
| `fisico-ligacao propor/listar/confirmar/rejeitar/revogar` | Sessão, pontos e tipo criam proposta; confirmação usa ID e origem; ações alteram estado. | Destino desconhecido impede confirmação; origem é declaração. |
| `fisico-caminho consultar` | Sessão e ponto inicial; devolve caminho e lacunas. | Consulta não comprova sinal real. |
| `voz-vinculo propor/listar/corrigir/confirmar/rejeitar` | Sessão, origem e frase criam proposta ou esclarecimento; ações revisam por ID. | Interpretador restrito; confirmação requer condições do domínio e não executa mesa. |
| `passagem mostrar` | Sessão; devolve formação, cadastros, propostas, histórico, pendências e revisões. | Revisões de proposta não cobrem alterações em todos os objetos relacionados. |
| `passagem confirmar` | Sessão, tipo, ID, revisão e origem para ligação. | Valida estado, escopo e revisão na confirmação. |
| `passagem rejeitar` | Sessão, tipo e ID de retorno, ligação ou voz. | Vínculo simples não tem rejeição; operação verifica escopo e estado. |
| `passagem corrigir` | Sessão, tipo, ID e campos; pessoa/equipamento exigem revisão. | Correção global tem histórico; propostas de vínculo/voz seguem regras próprias. |
| `passagem substituir` | Sessão, vínculo confirmado, revisão, pessoa, equipamento e canal. | Retira vínculo e associações de entrada atomicamente; cria proposta pendente. |

#### Serviço e painel

`local-service-cli.js` expõe `start/status/stop` (ciclo e diagnóstico), `painel` (link local com capacidade), `modo/entradas/sessao` (configuração de operação), `texto`, `texto-entrada` e variantes `-llm` (pedido), `confirmar` (ID de proposta), `voz-iniciar`, `voz-aceitar-dispositivo`, `voz-capturar`, `voz-cadastro` e `voz-capturar-llm` (worker e captura manual), `voz-entrada listar/definir/remover` (arquivo de configuração), `llm` (configuração e reconhecimento de restauração) e `resposta-simulada` (fila fictícia). Saídas são JSON ou mensagens, com código de sucesso/falha; erros são informados no CLI. Chamadas administrativas exigem serviço e capacidade local, exceto configuração de voz em arquivo e ciclo de vida. As variantes LLM exigem consentimento por pedido e podem gerar custo; não foram chamadas nesta análise. Mudança de voz exige reinício, e confirmação de comando não comprova aplicação na mesa.

O painel usa somente `GET /painel/api/sessoes`, `GET /painel/api/passagem?sessao=...` e `POST /painel/api/revisar` para o cadastro. A revisão aceita tipos e ações previstos em `local-service.js`; confirma exige revisão e ligação exige origem, enquanto correção/rejeição suportadas também conferem revisão e sessão. O servidor exige capacidade e origem exata no POST; não é API geral de edição. `GET /status` e comandos administrativos pertencem ao canal do serviço, não significam paridade do painel com o CLI.

- `src/registry.js` contém esquema SQLite v7, migrações e métodos de cadastro. As consultas e gravações selecionam colunas explicitamente; não há metaclasse ou definição única de entidades da qual todas as telas sejam derivadas.
- `src/registry-cli.js` e módulos auxiliares expõem comandos. Os formulários em `src/terminal-registry-forms.js` definem separadamente campos e argumentos para pessoas, equipamentos, sessões, grupos, papéis e dispositivos físicos. As telas em `src/terminal-registry-screens.js` mantêm listas, nomes e rótulos próprios. Criar pessoa ou equipamento foi testado com SQLite temporário; os demais formulários usam o mesmo mecanismo, mas não têm teste interativo individual registrado.
- O menu permite consultar registros e criar aqueles seis tipos; relações e pontos físicos são apenas consultáveis no menu. Vários vínculos já podem ser criados ou revistos pelos comandos de cadastro usando IDs. Não há seletor de registros relacionados nem sequência guiada.
- O painel web local implementa consulta e revisão limitadas, com campos e ações específicos no código. Não cobre todos os comandos; não foi visualmente validado em navegador real. Seu acesso permanece restrito à máquina e à capacidade local existente.
- `src/backup.js` aceita explicitamente versões de esquema e verifica o esquema canônico e invariantes. Uma alteração direta da estrutura do SQLite pode tornar um backup incompatível; alterar o banco não atualiza automaticamente consultas, comandos ou telas.
- IP e configurações de voz e modo usam arquivos locais; estado de conexão, propostas de comando e fila simulada não são todos cadastros SQLite. Tratar tudo como tabelas editáveis perderia essa distinção.

## Categorias para o operador

| Área | Registros ou funções | Situação e tratamento |
| --- | --- | --- |
| Pessoas e equipe | Pessoas, grupos e papéis | Cadastros globais; integrantes e funções são relações. A seleção deve mostrar nomes e contexto, sem conceder permissões automaticamente. |
| Equipamentos | Microfones e outras fontes; tipo, cor, cápsula, modelo e ligação | Cadastro global. Cor e nome não são identificadores únicos; mostrar outros detalhes ao escolher. |
| Estrutura física | Mesa, medusa, outros dispositivos, pontos, portas e vias | Dispositivos têm criação no menu; pontos e ligações usam comandos próprios. Representam declarações, não leitura física. |
| Sessões | Ensaio ou culto, grupos, integrantes e papéis efetivos | Cadastro de sessão no menu; formação e associação disponíveis por comandos. Seletores devem ser restritos à sessão e ao grupo corretos. |
| Fontes da sessão | Pessoa, equipamento, canal declarado e entrada associada | Vínculos passam por proposta e confirmação. Associação de entrada exige vínculo confirmado; não presumir que canal e entrada física sejam iguais. |
| Retornos | Quantidade configurada de AUX, retornos da sessão e seus vínculos | Quantidade depende da instalação; retorno e vínculo têm validações e estados próprios. Não presumir capacidade, exclusividade ou roteamento físico. |
| Ligações e patch | Ligações entre pontos e suas revisões | Tratar como fluxo de proposta, confirmação, rejeição ou revogação, não como edição direta do estado. |
| Revisão e histórico | Propostas por voz, correções e vínculos retirados | Mostrar frase, origem, pendências e histórico; estados e revisões são controlados pelas operações existentes. |
| Configuração e operação | IP, áudio, modos, serviço e estado observado | Telas próprias; não incluir como linhas genéricas de cadastro ou confundir estado observado com registro declarado. |

Uma ordem orientadora é cadastrar pessoas, equipamentos, grupos, papéis e estrutura física; organizar os grupos; criar uma sessão; escolher sua formação; e então propor fontes, retornos e ligações. Isso é orientação, não uma ordem universal obrigatória: por exemplo, é possível criar uma sessão antes de cadastrar toda a equipe. Se faltar uma referência, a tela deve indicar o que falta e permitir voltar ou abrir o cadastro necessário, sem criar relações incompletas silenciosamente.

## Como automatizar com controle

1. **Definição de entidade revisada e versionada:** identificar nome, categoria, lista, detalhes, campos visíveis, tipo, rótulo, ajuda, obrigatório/opcional, seleção de referência, escopo e operações permitidas. Os dados para isso hoje não existem de forma unificada. É preciso decidir quais partes serão fonte de verdade e quais serão apenas apresentação, evitando manter três cópias equivalentes.
2. **Formulário e lista genéricos:** a interface de terminal interpreta o catálogo para desenhar menus, formulários, paginação, filtros e detalhes. O futuro HTML pode consumir o mesmo contrato, com apresentação própria. Um campo de referência mostra candidatos por nome e detalhes, filtra pelo contexto e guarda o ID correto; candidatos iguais continuam distinguíveis. Ao não haver candidatos, explicar a dependência e permitir cancelar.
3. **Operações de domínio explícitas:** criar pessoa, associar integrante ou confirmar ligação invocam funções aprovadas; não gerar `INSERT`, `UPDATE` ou `DELETE` genéricos a partir do nome da tabela. Revisões concorrentes, histórico, permissões, transações e restrições continuam sendo aplicados na camada responsável.
4. **Compatibilidade com o esquema:** nas alterações previstas, uma migração versionada adapta os bancos antigos, e um verificador compara metadados, consultas e esquema canônico. Novos campos devem ser acrescentados também ao contrato e às operações de leitura/gravação quando necessário. Divergências devem produzir aviso ou falha controlada, não campos editáveis inventados. Preservar backup e testes de migração.
5. **Atualização de dados:** ao salvar pelo aplicativo, recarregar a lista afetada e referências dependentes. Alterações feitas por outro processo exigem política explícita de atualização: inicialmente um comando de atualizar ou recarga ao entrar é suficiente; atualização contínua/eventos podem ser avaliados depois. Se um registro foi alterado enquanto aberto, recarregar ou recusar a gravação usando revisão quando disponível; a revisão de propostas atual não detecta todas as alterações em objetos relacionados.

### O que pode ou não ser automático

- Mudança de **dados** por operação suportada: a lista pode ser recarregada, e seletores podem mostrar os valores atuais, inclusive nomes alterados. Confirmar novamente a referência e o contexto ao salvar.
- Mudança de **rótulo, ordem, ajuda ou campo já suportado** no catálogo: pode refletir nas telas que consomem esse catálogo, depois de atualizar o aplicativo.
- Novo **campo de domínio**: pode gerar apresentação se for declarado no contrato, mas precisa ter leitura, escrita, migração, validação, backup e testes compatíveis. Se for somente de leitura, indicá-lo explicitamente. Adicionar somente uma coluna não entrega automaticamente essas etapas.
- Mudança manual na **estrutura física do banco** ou no código de uma classe/função: não deve produzir edição automática confiável. O aplicativo deve detectar incompatibilidade quando os verificadores estiverem implementados e orientar a atualização; hoje não existe essa garantia geral.
- Regras como conflitos por sessão, confirmação, histórico, autorização e patch físico não são inferíveis de uma lista de colunas. Permanecem explícitas nas operações de domínio.

## Fases propostas

1. **Inventário e contrato mínimo:** escolher uma entidade simples, como pessoa, e uma com campos opcionais, como equipamento. Definir metadados de exibição e operações existentes. Critério: telas geradas equivalentes às atuais e erros/regras mantidos, sem mudar esquema.
2. **Seletores de referência:** implementar e testar escolha de pessoa/equipamento por nome e ID interno, duplicatas, nenhum resultado, paginação, alteração entre seleção e envio e escopo da sessão. Começar por uma proposta de vínculo, mantendo confirmação posterior.
3. **Fluxos especiais:** integrar formação de equipe, retornos, ligações e passagem com ações explícitas e revisão concorrente; preservar históricos. Apresentar dependências como orientação, sem bloquear cadastros independentes.
4. **Verificação de evolução:** confrontar catálogo, operações e esquema de teste, validar migrations, backups antigos e discrepâncias; nenhuma alteração estrutural fora do mecanismo de migração é aplicada automaticamente.
5. **Reuso no painel web:** disponibilizar apenas o contrato e operações necessários pelo canal local existente; validar autenticação, autorização, origem e revisão no servidor. Testar visualmente em navegador e, separadamente, equipamento real quando disponível.

## Verificações propostas

Usar bancos temporários para telas geradas, formulários, opcionais, campos ausentes e extra, nomes duplicados, seletores vazios, mudança concorrente de registro, migração e restauração de backups antigos. Testar que alterações diretas de estado, confirmações sem revisão, vínculos de outra sessão e criação de dados inválidos são recusadas; testar que não há ação na mesa. Cobrir navegação, cancelamento e EOF no terminal. Se a interface web adotar o contrato, testar a mesma regra pelo serviço e pelo terminal, além da apresentação real no navegador. Dados, permissões, rede e mesa da igreja exigem validação própria.

## Divergências documentais encontradas

- `docs/diagramas.md` apresentava o esquema v4 como visão consolidada; o código atual declara v7 e inclui equipes, histórico e associações de entrada. O texto foi esclarecido para identificar o diagrama como recorte histórico; um diagrama completo v7 continua pendente.
- `docs/especificacoes/backup-local.md` mencionava na seção de escopo schemas v1 a v6, enquanto `src/backup.js` inclui v7. O texto foi corrigido; não houve nova execução dos testes de backup nesta análise.
- O painel de terminal mostra somente campos e operações declarados nos módulos de tela. Sua separação atual facilita evolução, mas não comprova geração automática de formulários a partir do banco.
