# Controle de execução

## Rodada integrada de revisão concorrente de cadastros — validação automatizada

Fase 4. Inventário em 20/11/2026: o CMD inclui e remove integrantes e funções habituais (`grupo-integrante`, `grupo-funcao`), associa grupos, participantes e papéis efetivos (`sessao-grupo`, `sessao-integrante`, `sessao-papel`); cria retornos e propõe seus vínculos (`retorno`, `retorno-vinculo`); cria pontos e propõe ligações (`fisico-ponto`, `fisico-ligacao`). As telas apresentam nomes, IDs, sessão, relações ou configuração antes do SIM. Reconsultas anteriores à gravação não são atômicas. Restrições SQLite protegem duplicatas, referências, escopo e dependências; configuração AUX e confirmação de vínculos têm verificações transacionais, mas isso não protege todo o conteúdo apresentado na criação. Operações antigas permanecem disponíveis com seus contratos.

- [x] Implementar variantes revisadas para os contextos apresentados, verificando referências e relações necessárias na mesma transação da gravação, sem migração nem mudança do formato de backup; integrar telas, preservando propostas pendentes, confirmação separada, cancelamento, recarga e histórico. Pontos sem referência selecionada (canal, mix e outro) mantêm a operação anterior, cuja inserção e validações não dependem de dados relacionados apresentados.
- [x] Exercitar sucesso, sessão incorreta, listas vazias, cancelamento, alterações e remoções concorrentes por segunda conexão, recusa sem gravação parcial, bloqueios, conflitos e compatibilidade legada; executar testes direcionados, suíte compartilhada, lint e verificação documental.
- [x] Auditar código, resultados e documentação e registrar limites. Tokens de conteúdo não autenticam, não provam estado físico e não detectam alteração revertida ao mesmo conteúdo. A formação integral é revisada conservadoramente e pode provocar recusa por mudança em outro integrante. Confirmações existentes cobrem o vínculo e não referências relacionadas; sua ampliação não integra esta rodada de criação e relações.

**Evidências em 20/11/2026:** equipes: 14 testes próprios passaram, incluindo dez ações revisadas no CMD e concorrência nas famílias de relações; testes direcionados de equipe e menu passaram 50/50 antes da ampliação. Retornos: 62/62 direcionados e depois 5/5 no arquivo ampliado; pontos e ligações: 63/63 direcionados e depois 8/8 no arquivo ampliado. Após os novos testes de remoção, a suíte compartilhada `npm test -- --test-timeout=30000 --test-concurrency=4` passou 400/400 fora do sandbox; ESLint, verificação documental e `git diff --check` passaram (este último com avisos de finais de linha). A primeira tentativa no sandbox foi interrompida após falhas de loopback; teste isolado confirmou `EACCES` em `127.0.0.1`. Bancos temporários, serviços e mesa simulados; não houve teste físico, chamada paga ou CI remoto. A conferência estrutural de documentação não substitui revisão de conteúdo.

Este documento acompanha as entregas do projeto. A [arquitetura](arquitetura.md) reúne decisões e propostas técnicas; este plano registra o que falta implementar e como validar cada etapa. Não há prazos ou responsáveis definidos ainda.

Para acompanhar o que depende de você, consulte [suas pendências](suas-pendencias.md).

Última revisão: 20/11/2026.

## Estado atual

**Correções da auditoria de 17/11:** A1–A7 implementadas e testadas em simulação, com as limitações indicadas abaixo. Um ambiente Python 3.12 de desenvolvimento foi preparado; instalação definitiva e validação com voz real continuam pendentes.

**Protótipo validado pelo usuário:** captura de voz, transcrição e execução de comandos diretamente na Ui24R. A validação relatada comprova o fluxo experimentado, mas não estabelece desempenho, cobertura ou confiabilidade em todos os cenários.

**Existente no código:** terminal, painel web local e serviço local, simuladores, IP persistente e reconexão, mute e fader de entradas, workers Whisper persistentes e cadastro SQLite v7 de pessoas, equipes, papéis, equipamentos, AUX, caminhos físicos e associações de entrada a fonte. A revisão guiada permite correções com histórico e exige revisão atual para confirmar ou substituir vínculos. Modos, sessão ativa, captura de cadastro, escala provisória de fader, provedores opcionais e fila de respostas simuladas foram integrados ao serviço. A gravação padrão dura cinco segundos; encerramento por silêncio é experimental. Os fluxos novos passaram em testes HTTP e de componentes com dependências simuladas; validação física permanece pendente.

**Substituição revisada em 20/11:** o CMD verifica atomicamente vínculo, entradas e novas referências; a variante anterior permanece compatível. Suíte Node 370/370 e oito testes específicos com backup, ESLint e verificação documental passaram. Sem validação física ou CI remoto.

**Ainda não implementado como produto completo:** serviço validado com voz e mesa reais, painel com acesso de rede e funcionalidades completas, cadastro completo de retornos, respostas faladas e roteamento individual real e integração Holyrics. Gemini, OpenAI e Anthropic estão integrados com seleção persistente e limite de tentativas, testados apenas com transporte falso; limites financeiros e provedores reais seguem pendentes. A fila de respostas integrada é apenas simulação; múltiplas entradas e conversas exigem validação com dispositivos reais.

**Evidências registradas:** em 18/11, após ampliar a revisão no painel, `npm test -- --test-timeout=30000 --test-concurrency=4` passou 276/276 fora do sandbox com loopback e dependências simuladas. ESLint e verificação documental passaram. Python 3.12: pytest 21/21 e Ruff check aprovados. O [CI do commit 588a2e5](https://github.com/joaoporcino/soundcraft-voz/actions/runs/44445307720) passou em Node e Python, Windows e Linux. A apresentação em navegador real, microfone/Whisper e mesa físicos, provedores reais e inicialização após reinício ainda não foram verificados. Os registros preservam resultados de cada rodada, não o estado atual por si só.

**Recorte proposto para o primeiro piloto, ainda a confirmar:** um operador configura a conexão pelo terminal, solicita mute ou fader de entrada por texto ou uma captura manual de voz, revisa e confirma a proposta e recebe o resultado conhecido. Resposta no ouvido e seleção de LLM ficam como marcos posteriores desse piloto, a menos que sejam definidas como indispensáveis. A preparação e os testes simulados podem avançar enquanto se aguarda equipamento; o piloto com mesa exige teste controlado e evidência própria.

**Prioridade de interface:** terminal e painel web inicial local; acesso por celulares/tablets e captura de voz no navegador são melhorias posteriores. O painel inicial cobre consulta e revisão limitadas, não todas as opções do terminal. O canal local autenticado tem as limitações entre usuários locais indicadas na arquitetura.

**Evolução do CMD em 19/11:** catálogo e verificador versão 2 cobrem pessoa, equipamento, sessão, grupo, papel e dispositivo físico; seletores, edição com histórico, equipes e formação, fontes e entradas, AUX, retornos, pontos e ligações têm telas parciais com ações específicas. Operação inclui sessão, modos, voz e recuperação de candidato por meio dos CLIs existentes. A suíte completa daquela rodada passou 343/343 fora do sandbox, com simulações. O catálogo ainda não cobre todas as entidades, verificações não auditam integralmente o banco real, várias reconsultas não são transacionais e faltam validação visual na igreja e testes reais; detalhes e tarefas seguem nas seções abaixo.

**Revisão anterior da passagem em 20/11 (histórico):** as variantes revisadas e seu uso no CMD, já presentes nas alterações locais, foram conferidos e receberam testes adicionais. A suíte Node atual passou 350/350 fora do sandbox, com serviços e mesa simulados; ESLint e verificação documental passaram. Não houve CI remoto novo nem teste físico. Naquela rodada o token cobria o vínculo, não os cadastros relacionados ou alterações revertidas; a correção com referências selecionadas evoluiu na entrega registrada adiante.

## Como usar este controle

- `[ ]` pendente; `[x]` concluído e validado conforme descrito. Usar **Em andamento** ou **Bloqueado**, com motivo, no registro ao final quando necessário.
- Marcar tarefas somente após registrar a evidência e, quando envolver equipamento, as condições do teste. Separar testes simulados de testes com a mesa.
- Rever prioridades e critérios ao final de cada etapa. As próximas fases são hipóteses de planejamento, não uma promessa de implementação automática.
- Registrar decisões e mudanças de desenho na [arquitetura](arquitetura.md); registrar execução e resultados aqui ou em arquivos de evidência vinculados.
- Manter [suas pendências](suas-pendencias.md) coerente com decisões e testes que dependam do usuário; concluir itens apenas após confirmação ou evidência correspondente.
- Para funcionalidades relevantes, consultar ou criar uma especificação em `docs/especificacoes/` antes da implementação; mudanças pequenas podem ter escopo e validação registrados diretamente neste plano.

## Menu interativo no terminal

**Análise de 19/11/2026:** [cadastros e interface](analise-cadastros-e-interface.md) registra inventário, categorias e dependências. A arquitetura adota CMD modular e catálogo explícito de apresentação; a versão 2 cobre seis cadastros simples, com verificador e seletores parciais; expansão permanece pendente. A [revisão documental](revisao-documental-interface-2026-11-19.md) identifica as fontes e os limites. O diagrama v4 foi preservado e complementado com as tabelas v5–v7. Nenhum equipamento ou dado real foi usado.

### Plano integrado de evolução, interface e sistema

**Objetivo:** permitir que a equipe use gradualmente o CMD para cadastros, consulta e operação, mantendo serviços, validações, persistência e regras existentes independentes da apresentação. O [contrato de interface](especificacoes/evolucao-interface-cadastros.md) prevalece para os limites desta evolução; os contratos específicos de cada domínio mantêm suas regras. Os itens abaixo são planejamento e não substituem as fases e evidências históricas. Nenhuma fase está concluída por este registro. Implementar em fatias pequenas; se um passo exigir modificar o backend, especificar e planejar essa mudança antes, com testes de compatibilidade.

1. **Linha de base e fronteiras** — [x] Mapear operações de cadastro, serviço e painel, entradas, saídas, efeitos e revisão na [matriz](analise-cadastros-e-interface.md), com referência aos módulos e contratos específicos. [x] Testar o menu atual com banco temporário e dependências simuladas como baseline; registrar versão e limitações. [x] Complementar diagrama de entidades v7 sem retirar o histórico v4. **Aceite:** matriz rastreável ao código e testes de regressão reproduzíveis; nenhum dado real ou backend alterado na linha de base.
2. **Catálogo e telas comuns** — [x] Implementar catálogo versão 1, com pessoa e equipamento, campos e operações de lista/criação explícitas e adaptador sobre comandos existentes, conforme [especificação](especificacoes/evolucao-interface-cadastros.md). [x] Usar lista, detalhe e criação comuns para pessoa e equipamento, incluindo opcionais, listas vazias, erros, cancelamento e EOF. [x] Preservar comportamento exercitado pelo menu atual, dados, mensagens essenciais e comandos antigos. **Aceite:** testes por interface e cadastro em bancos temporários; nenhuma migração ou SQL de escrita genérico.
3. **Seletores e dependências** — [x] Implementar seleção inicial de pessoa e equipamento por nome e identificador, com contexto, pesquisa/paginação e ausência de candidatos. [x] Orientar sequência livre e permitir abrir cadastro necessário e voltar sem vínculo implícito. [x] Testar remoção observada e sessão inexistente com adaptador simulado; a proposta usa revisão transacional e confirmação posterior. [ ] Expandir seletores aos demais domínios junto às respectivas operações da fase 4. **Depende:** fases 1–2. **Aceite inicial:** testes de duplicatas, referências removidas/alteradas, sessão inexistente, cancelamento e ausência de confirmação automática; tokens de conteúdo não detectam mudanças revertidas aos mesmos valores.
4. **Gestão de entidades e relações** — [ ] Cobrir progressivamente grupos, papéis e formação; estrutura física, pontos e ligações; AUX, retornos e vínculos, de acordo com operações suportadas. Além da primeira fatia de integrante, as ações descritas nas evidências abaixo já têm telas; sua robustez concorrente está em andamento na rodada registrada no início do plano. [ ] Exibir estado, escopo, dependências e ações disponíveis; permitir correção/revisão somente por operações existentes e informar limitações de campos relacionados e revisão concorrente. [ ] Acrescentar testes por fluxo, inclusive conflitos, histórico, revogação e rollback. **Depende:** fases 1–3. **Aceite:** cada tela declara explicitamente suas operações e o efeito; vínculo cadastrado não é tratado como patch físico confirmado.
5. **Operação e recuperação no CMD** — [ ] Completar acesso às configurações e diagnósticos já existentes de IP, serviço, modos, entradas e voz; informar reinício necessário, estado desconhecido e indisponibilidade. [ ] Preservar proposta e confirmação, invalidação por pausa/queda e ausência de reenvio, sem chamar mesa diretamente da tela. [ ] Validar dispositivo e revisão quando o serviço exigir. **Depende:** contratos das fases 2–3 de serviço, modos e recuperação. **Aceite:** testes HTTP/CLI com mesa e workers simulados; não declarar aplicação física pelo resultado de envio.

**Primeira fatia da operação:** seleção de sessão ativa, configuração de entradas de passagem/master e diagnóstico de voz usando o CLI do serviço, conforme [menu](especificacoes/menu-terminal.md). Em 19/11, 52 testes direcionados passaram com banco temporário e serviço simulado, incluindo cancelamento, encaminhamento e diagnóstico; ESLint e verificação documental passaram. A suíte completa 322/322 antecede esta tela. As demais configurações e recuperação seguem abertas; não houve teste físico ou novo CI remoto.

- [x] Acrescentar consulta e alteração de parâmetros principais de voz por seu CLI, com confirmação e aviso de reinício, conforme [menu](especificacoes/menu-terminal.md) e [configuração de voz](especificacoes/configuracao-voz-servico.md). Em 19/11, 59 testes direcionados passaram com diretórios temporários e adaptadores simulados, incluindo cancelamento, falha e persistência parcial; ESLint e verificação documental passaram. A suíte 322/322 antecede esta tela; nenhum dispositivo real foi acessado.

- [x] Acrescentar texto, captura manual e captura de cadastro por entrada identificada, além de aceite revisado de dispositivo candidato, conforme [menu](especificacoes/menu-terminal.md) e [recuperação](especificacoes/recuperacao-servico.md). Em 19/11, 56 testes direcionados passaram com banco temporário e serviço simulado, incluindo recusa, revisão antiga e ausência de captura automática; ESLint e verificação documental passaram. Suíte completa 322/322 antecede esta tela; dispositivo e voz reais não foram testados.

- [x] Acrescentar consulta e edição de configuração de voz adicional por entrada, com confirmação e aviso de reinício, conforme [menu](especificacoes/menu-terminal.md). Em 19/11, 58 testes direcionados passaram com diretórios temporários e adaptadores simulados, incluindo cancelamento e persistência pelo CLI; ESLint e verificação documental passaram. A suíte completa 322/322 antecede essa tela; arquivo não tem revisão transacional entre processos.

- [x] Exercitar o menu de operação através do CLI e serviço HTTP reais com mesa simulada, incluindo confirmação e pausa, sem hardware físico. Em 19/11, um teste passou fora do sandbox; o envio foi observado no simulador e não comprova aplicação física.
6. **Evolução dos dados e proteção de compatibilidade** — [ ] Criar verificadores explícitos entre catálogo, operações e esquema de teste, com tratamento de campos internos, calculados e somente leitura; inconsistências bloqueiam a função afetada. [ ] Ao alterar domínio ou banco, planejar migração transacional, consultas, validações, backup/restauração de versões antigas e testes de regressão antes de publicar a tela. [ ] Recarregar valores após operações e oferecer atualização explícita; documentar concorrência entre processos. **Depende:** fase 2 e especificações de backup e revisão. **Aceite:** inconsistência detectada sem escrita indevida, restauração antiga e regras verificadas em bancos temporários; sem propagação implícita de estrutura arbitrária.

**Primeira fatia de compatibilidade:** catálogo de pessoa/equipamento, respostas e operações são verificados contra contrato explícito e esquema canônico em memória; divergência bloqueia ação afetada, conforme [evolução da interface](especificacoes/evolucao-interface-cadastros.md). As listas oferecem `U` para recarga explícita. Em 19/11, 63 testes direcionados passaram, incluindo campos extras/ausentes, tipo incompatível, operação não suportada e mudança entre consultas; ESLint e verificação documental passaram. A suíte 322/322 antecede esta fatia. O esquema do arquivo real não é auditado integralmente por essa verificação; outras entidades ainda não integram o catálogo.

**Regressão após catálogo e operação:** em 19/11, a suíte completa passou 341/341 fora do sandbox com mesa e serviços simulados, incluindo o teste do menu pelo serviço HTTP local. Não houve novo CI remoto ou teste físico.

- [x] Ampliar catálogo e verificador para sessão, grupo, papel e dispositivo físico, preservando comandos e validando formulários individualmente em banco temporário, conforme [evolução da interface](especificacoes/evolucao-interface-cadastros.md). Em 19/11, 64 testes direcionados passaram com SQLite temporário ou adaptador simulado; ESLint e verificação documental passaram. Suíte 342/342 antecede esta fatia; outras entidades e auditoria do banco real permanecem pendentes.

**Regressão do catálogo versão 2:** em 19/11, a suíte completa passou 343/343 fora do sandbox com serviços e mesa simulados; não houve novo CI remoto ou teste físico.

- [x] Acrescentar variantes de passagem com revisão transacional para correção, rejeição e revogação e usá-las no CMD, preservando comandos legados, conforme [passagem](especificacoes/passagem-guiada.md) e [arquitetura](arquitetura.md). Em 20/11, 18 testes direcionados passaram com bancos temporários, incluindo sucesso para os tipos suportados, sessão incorreta, referência inválida, revisão antiga, alteração entre conexões, preservação dos estados e compatibilidade legada. A suíte Node passou 350/350 fora do sandbox; ESLint e verificação documental passaram. A primeira suíte no sandbox foi interrompida após falhas de loopback; teste isolado confirmou `EACCES` em `127.0.0.1`. Nenhum equipamento real foi usado.
7. **Preparação e piloto local** — [ ] Documentar instalação suportada, dependências, armazenamento e recuperação; testar primeiro sem mesa e com dados de exemplo. [ ] Validar visualmente navegação e formulários no CMD/Windows, fazer backup e restauração em destino separado e testar reinício e disponibilidade de dispositivos. [ ] Com técnico e em canal apropriado, testar texto, confirmação, voz e conexão reais e registrar hardware, resultados e falhas. **Depende:** funções do piloto escolhidas e disponibilidade do usuário/equipamento. **Aceite:** evidência separada para testes simulados, usabilidade no computador da igreja e mesa/áudio reais; não marcar piloto validado por CI.

**Preparação isolada:** o [roteiro de piloto local](roteiro-piloto-local.md) reúne diretório temporário, dados fictícios, cadastro, revisão, backup e restauração. Em 19/11, os comandos equivalentes passaram no diretório temporário normal do Windows, incluindo confirmação e leitura do vínculo restaurado; o teste HTTP do menu também passou com mesa simulada. A primeira restauração no sandbox falhou com `unable to open database file` em caminho temporário longo; após correção do banco auxiliar, o mesmo ensaio longo passou. Outros caminhos longos permanecem sem cobertura exaustiva. Nenhum equipamento, áudio real ou serviço pago foi usado.

- [x] Corrigir abertura do banco auxiliar de estado de LLM em caminho longo no Windows com caminho estendido, preservando `:memory:` e formato de backup, conforme [backup](especificacoes/backup-local.md) e [arquitetura](arquitetura.md). Em 19/11, 23 testes direcionados de backup e LLM passaram, inclusive restauração longa no Windows; o ensaio longo que falhara passou após a mudança. Reprodução isolada: SQLite abriu caminhos de 165, 195 e 225 caracteres, falhou em 255 sem prefixo e abriu 255 com caminho estendido no sandbox. ESLint e verificação documental passaram; não generalizar a todos os arquivos e sistemas.

**Regressão após correção de caminho:** em 19/11, a suíte completa passou 342/342 fora do sandbox com serviços e mesa simulados, incluindo o teste de restauração longa no Windows. Nenhum CI remoto novo ou teste físico foi executado.
8. **Evoluções posteriores do produto** — [ ] Reutilizar contratos no painel web apenas após definir endpoints locais mínimos, validação e testes de origem/autorização e inspecionar navegador real. [ ] Tratar acesso por rede e dispositivos móveis em decisão própria. [ ] Avançar LLM real após decisões de modelo, privacidade, credenciais e custos, com consentimento por pedido. [ ] Implementar TTS/roteamento após verificar capacidades e segurança física; manter fila atual como simulação. [ ] Investigar Holyrics, cues, monitoramento e equalização conforme capacidades reais e especificações próprias. **Depende:** fases anteriores e, quando aplicável, usuário, serviços ou equipamento. **Aceite:** cada recurso possui contrato e evidências próprias; não inferir suporte da biblioteca ou da simulação.

**Rastreabilidade com as fases existentes:** esta trilha de interface atravessa a base de qualidade e fases 0–5; a fase 6 de monitoramento permanece investigativa. As tarefas de voz, medição física, LLM, retorno e integração abaixo continuam válidas e não ficam concluídas pela construção de telas. Critérios por entidade e ações do usuário serão atualizados em suas especificações e [pendências](suas-pendencias.md) a cada entrega.

**Revisão documental de 19/11:** inventário e contratos documentados na [revisão](revisao-documental-interface-2026-11-19.md); `npm run docs:check` e os dois testes do verificador passaram. `git diff --check` passou com avisos de fim de linha. A verificação é estrutural, não comprova correção semântica; não houve execução física, de provedor ou de CI remoto nesta revisão.

- [x] Normalizar a ordem inicial das 31 especificações identificadas na revisão, preservando títulos e histórico, e ampliar o verificador/testes para exigir `## Situação atual` como primeira seção, salvo o modelo. Em 19/11/2026, a reorganização preservou os textos e títulos; `npm run docs:check`, 3 testes do verificador e ESLint passaram. A conferência automática cobre links locais inline suportados, não âncoras nem fidelidade semântica. O CI remoto não foi executado nesta rodada.

**Linha de base em 19/11/2026:** os 8 testes existentes de menu passaram com banco temporário e serviço simulado, junto aos testes documentais. A [matriz de famílias](analise-cadastros-e-interface.md) aponta para os módulos consultados e indica efeitos, revisão e limites; detalhes de argumentos permanecem no CLI e nos contratos específicos. O [diagrama](diagramas.md) foi complementado com as tabelas v5–v7, conferidas nas migrações; preserva o recorte v4. Corrigida a descrição do modo culto, já reconhecido pelo CLI e serviço, sem inferir validação física. Esta execução não valida CMD visual, mesa ou áudio reais.

**Catálogo inicial em 19/11/2026:** Node v24.21.0; 10 testes do menu e 3 do verificador passaram, incluindo rótulos do catálogo e EOF. ESLint e `npm run docs:check` passaram. A suíte completa passou 287/287 fora do sandbox com dependências simuladas; a tentativa dentro do sandbox apresentou falhas de loopback e foi interrompida. Não houve nova verificação do CI remoto. Cadastros usam SQLite temporário ou adaptador simulado; não houve validação visual no CMD da igreja, mesa ou áudio reais. A comparação sistemática entre esquema, operações e catálogo permanece na fase 6.

**Primeira proposta com seletores em 19/11/2026:** 15 testes direcionados de menu e proposta passaram com SQLite temporário ou adaptador simulado, cobrindo duplicatas, busca, paginação, vazio, criação pelo seletor, cancelamento, EOF, alteração ou remoção observada, sessão inexistente e ausência de confirmação automática. A primeira versão tinha janela entre recarga e gravação; a revisão transacional descrita abaixo a cobre para valores atuais. A conferência com equipamento e a usabilidade no computador da igreja permanecem pendentes.

- [x] Implementar opção compatível de revisões de sessão, pessoa e equipamento na proposta de fonte, verificadas na mesma transação que a inserção; adaptar seletor e testar alteração antes da transação, recusa sem gravação e comandos legados. Decisão e impacto em [arquitetura](arquitetura.md) e [cadastro](especificacoes/cadastro-sessao.md). Sem migração. Em 19/11, 31 testes direcionados passaram com banco temporário; tokens inválidos e alterações de sessão, pessoa e equipamento foram recusados. Remoção observada foi exercitada com adaptador simulado. ESLint e verificação documental passaram; suíte completa 294/294 fora do sandbox, com integrações simuladas. Não houve novo CI remoto ou teste físico.

**Orientação de cadastros:** o menu agora sugere pessoas, equipamentos, sessões e relações, sem impor ordem. Após esse ajuste de apresentação, 17 testes direcionados passaram; a suíte completa acima antecede essa alteração textual.

**Inclusão de integrante:** tela usa o comando existente e recarrega grupo e pessoa antes de adicionar; duplicidade continua bloqueada no domínio. Mudanças entre recarga e gravação não possuem revisão transacional nesse fluxo. Em 19/11, 18 testes direcionados de menu e seletores passaram; o caso de grupo com SQLite temporário verificou inclusão, recusa de duplicata, cancelamento e ausência de função automática. ESLint e verificação documental passaram; a suíte completa 294/294 antecede essa fatia. Os testes não comprovam formação real da equipe.

- [x] Acrescentar remoção explícita de integrante no detalhe, preservando bloqueios de funções e formação, conforme [equipes](especificacoes/equipes-sessoes.md). Em 19/11, 19 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo cancelamento, bloqueios por função e formação, sucesso e recarga. ESLint e verificação documental passaram; a suíte completa 294/294 antecede as alterações de equipe. A reconsulta dessa associação não é revisão transacional.

- [x] Acrescentar inclusão e remoção de função habitual do integrante com seleção e confirmação, preservando formação efetiva e permissões conforme [equipes](especificacoes/equipes-sessoes.md). Em 19/11, 21 testes direcionados passaram com banco temporário ou adaptador simulado; cobrem cancelamento, duplicidade, função removida antes do envio e manutenção do papel efetivo na sessão. ESLint e verificação documental passaram; a suíte completa 294/294 antecede essas telas. O contrato de equipe não fornece revisão transacional dos dados relacionados.

- [x] Acrescentar associação e desassociação de grupo na formação da sessão, preservando bloqueio por participações e sem exclusões implícitas, conforme [equipes](especificacoes/equipes-sessoes.md). Em 19/11, 22 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo cancelamento, duplicidade, bloqueio e remoção; a primeira execução revelou divergência no formato do grupo e foi corrigida. ESLint e verificação documental passaram; a suíte completa 294/294 antecede as telas de equipe. A reconsulta não é revisão transacional.

- [x] Acrescentar inclusão e remoção de participação na sessão com seleção restrita aos integrantes do grupo, mantendo bloqueios de papéis efetivos, conforme [equipes](especificacoes/equipes-sessoes.md). Em 19/11, 23 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo cancelamento, duplicidade e bloqueio por papel; ESLint e verificação documental passaram. A suíte completa 294/294 antecede as telas de equipe. Reconsulta não é revisão transacional.

- [x] Acrescentar atribuição e remoção de papel efetivo na formação, mantendo função habitual e permissões separadas, conforme [equipes](especificacoes/equipes-sessoes.md). Em 19/11, 24 testes direcionados passaram com SQLite temporário e adaptador simulado, incluindo duplicidade, cancelamento e manutenção da função habitual. ESLint e verificação documental passaram; a suíte completa 294/294 antecede essas telas. A reconsulta não é revisão transacional.

- [x] Acrescentar configuração de quantidade de AUX no CMD com revisão e confirmação, preservando recusa de redução incompatível, conforme [retornos](especificacoes/cadastro-retornos.md). Em 19/11, 25 testes direcionados passaram com SQLite temporário ou adaptador simulado; cobrem configuração inicial, cancelamento e redução recusada. ESLint e verificação documental passaram; a suíte completa 294/294 antecede as telas de equipe e AUX. A reconsulta não é revisão transacional.

- [x] Acrescentar criação de retorno na sessão pelo CMD, com consulta da configuração, confirmação e validação de faixa e duplicidade no domínio, conforme [retornos](especificacoes/cadastro-retornos.md). Em 19/11, 26 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo configuração ausente, cancelamento e duplicidade. ESLint e verificação documental passaram; suíte completa 294/294 antecede as telas de equipe e AUX. A reconsulta não é revisão transacional.

- [x] Acrescentar proposta de vínculo de retorno com seletores contextualizados e confirmação separada, conforme [retornos](especificacoes/cadastro-retornos.md). Em 19/11, 27 testes direcionados passaram com SQLite temporário ou adaptador simulado, incluindo sessão sem retorno, escopo, cancelamento e proposta pendente. ESLint e verificação documental passaram; suíte completa 294/294 antecede as telas de equipe e AUX. A reconsulta não é revisão transacional.

- [x] Acrescentar confirmação revisada de fonte e confirmação/rejeição/revogação de retorno nas telas de detalhe, conforme [cadastro](especificacoes/cadastro-sessao.md) e [retornos](especificacoes/cadastro-retornos.md). Em 19/11, 30 testes direcionados passaram com SQLite temporário ou adaptador simulado; incluem cancelamento, revisão antiga, conflito de retorno, revogação, rejeição e atualização da tela. ESLint e verificação documental passaram; a suíte completa 294/294 antecede essas telas. Naquela etapa, rejeição e revogação ainda não tinham revisão transacional; a revisão de 20/11 registra a evolução.

**Regressão posterior:** em 19/11, a suíte completa passou 307/307 fora do sandbox com serviços e mesa simulados, após as telas de equipe, AUX e revisão de vínculos. Nenhum teste físico ou CI remoto novo foi executado.

- [x] Acrescentar criação guiada inicial de pontos de canal, porta e via de medusa, conforme [caminhos físicos](especificacoes/caminhos-fisicos.md), com seleção de dispositivo e confirmação. Em 19/11, 33 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo ausência e filtro de medusa, alteração observada do dispositivo, cancelamento e persistência. ESLint e verificação documental passaram; a suíte completa 307/307 antecede essa fatia. A reconsulta de dispositivo não é transacional; tipos restantes ainda usam CLI.

- [x] Ampliar pontos para equipamento, pessoa, mix e outro com seleção e confirmação, mantendo tipo de retorno e opções avançadas nos comandos conforme [caminhos físicos](especificacoes/caminhos-fisicos.md). Em 19/11, 34 testes direcionados passaram com banco temporário ou adaptador simulado. Um teste foi ajustado após mudança de mensagem; ESLint e verificação documental passaram. A suíte completa 307/307 antecede essa fatia; reconsulta não é revisão transacional.

- [x] Acrescentar ponto de retorno com seleção de sessão e retorno contextual, conforme [caminhos físicos](especificacoes/caminhos-fisicos.md), preservando escopo e confirmação. Em 19/11, 35 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo sessão sem retorno e seleção restrita; ESLint e verificação documental passaram. A suíte completa 307/307 antecede os formulários de pontos; reconsulta não é revisão transacional.

- [x] Acrescentar proposta de ligação entre pontos, com seleção contextual e destino desconhecido explícito, conforme [caminhos físicos](especificacoes/caminhos-fisicos.md). Em 19/11, 36 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo filtro por sessão, cancelamento e proposta pendente com destino desconhecido. ESLint e verificação documental passaram; suíte completa 307/307 antecede as telas físicas. Reconsulta não é transacional.

- [x] Acrescentar confirmação revisada, rejeição e revogação de ligação no detalhe, conforme [caminhos físicos](especificacoes/caminhos-fisicos.md), mantendo histórico e limites de revisão. Em 19/11, 38 testes direcionados passaram com banco temporário ou adaptador simulado, cobrindo destino desconhecido, conflito, origem, rejeição, revogação e nomes exibidos na revisão. ESLint e verificação documental passaram; a suíte completa 307/307 antecede as telas físicas. A revisão antiga foi exercitada na tela comum para fonte; rejeição e revogação não são transacionais com a reconsulta.

- [x] Acrescentar correção de fonte proposta com seletores e confirmação, usando o contrato existente e explicitando sua limitação de revisão, conforme [cadastro](especificacoes/cadastro-sessao.md). Em 19/11, 40 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo cancelamento, alteração observada durante seleção e manutenção do estado proposto. ESLint e verificação documental passaram; a suíte 307/307 antecede as telas físicas e essa correção. A reconsulta não é transacional.

- [x] Acrescentar substituição explícita de fonte confirmada, mostrando entradas afetadas e usando revisão transacional existente, conforme [cadastro](especificacoes/cadastro-sessao.md). Em 19/11, 42 testes direcionados passaram com SQLite temporário ou adaptador simulado, incluindo cancelamento, entrada adicionada após revisão e preservação da fonte anterior na recusa. ESLint e verificação documental passaram; suíte 307/307 antecede as telas físicas e de correção. Naquela entrega dados relacionados não integravam a revisão; a variante posterior cobre as referências selecionadas.

- [x] Acrescentar associação de entrada a fonte confirmada da sessão, com seleção e confirmação, conforme [múltiplas entradas](especificacoes/multiplas-entradas.md). Em 19/11, 43 testes direcionados passaram com SQLite temporário ou adaptador simulado, incluindo sessão sem fonte confirmada, cancelamento e duplicidade. ESLint e verificação documental passaram; suíte 307/307 antecede essa tela.

- [x] Implementar remoção revisada por `bindingId`, condicional e compatível com comando legado; expô-la no CMD e testar substituição concorrente, conforme [múltiplas entradas](especificacoes/multiplas-entradas.md) e [arquitetura](arquitetura.md). Em 19/11, 48 testes direcionados passaram com banco temporário e simulações, incluindo substituição concorrente e cancelamento; ESLint e verificação documental passaram. A suíte 307/307 antecede essa alteração no domínio; sem migração ou novo CI remoto.

**Regressão após remoção revisada:** em 19/11, a suíte completa passou 322/322 fora do sandbox, com mesa e serviços simulados; sem novo CI remoto, equipamento físico ou serviço pago.

- [x] Acrescentar confirmação e rejeição de proposta de voz no detalhe da sessão, preservando revisão, validação de patch e limites de concorrência, conforme [captura](especificacoes/captura-cadastro.md). Em 19/11, 47 testes direcionados passaram com SQLite temporário ou adaptador simulado, incluindo proposta incompleta, rejeição e confirmação com patch declarado; ESLint e verificação documental passaram. A suíte completa 322/322 antecede esta tela; naquela etapa a rejeição ainda não dispunha de revisão transacional.

- [x] Acrescentar correção de proposta de voz com referências opcionais explícitas e sem confirmação automática, conforme [captura](especificacoes/captura-cadastro.md). Em 19/11, 49 testes direcionados passaram com SQLite temporário ou adaptador simulado, cobrindo campos desconhecidos e alteração observada durante a seleção; ESLint e verificação documental passaram. Suíte 322/322 antecede esta tela; reconsulta não é transacional.

- [x] Acrescentar correção de pessoa e equipamento global a partir do detalhe, com sessão de passagem, revisão transacional e histórico conforme [passagem](especificacoes/passagem-guiada.md). Em 19/11, 51 testes direcionados passaram com banco temporário ou adaptador simulado, incluindo cancelamento, opcionais, efeito global e revisão concorrente. ESLint e verificação documental passaram; a suíte 322/322 antecede esta tela.

Fases 1 e 2: oferecer menu opcional no CMD/PowerShell para configurar IP, administrar e consultar o serviço, escolher modo e solicitar comandos por texto ou captura manual de voz. A confirmação deve apresentar a proposta recebida e exigir escolha explícita, preservando validações do serviço e sem afirmar aplicação física. Manter comandos existentes. Contrato e limites em [menu do terminal](especificacoes/menu-terminal.md).

- [x] Implementar menu opcional, tratamento de saída e erros, e documentar acesso.
- [x] Testar navegação, confirmação, recusa e encerramento com serviço simulado; três testes direcionados passaram. Não foram exercitados apresentação em CMD real, áudio ou mesa físicos. O menu usa a entrada principal e não oferece todos os comandos administrativos; não cancela a proposta no serviço ao recusar.

**Evidências:** em 19/11/2026, suíte Node 279/279 fora do sandbox com conexões e equipamento simulados; ESLint aprovado. A primeira execução isolada encontrou falhas em testes de loopback e foi interrompida; a execução com acesso local passou. A interface visual no CMD e seu uso na igreja seguem pendentes.

### Telas de consulta dos cadastros

Fase 4: ampliar o menu com navegação modular por entidade, lista paginada e tela de detalhes de cada registro. Consultar os cadastros já disponíveis, inclusive relações por sessão e integrantes de grupo, por meio do adaptador de cadastro existente. Manter consultas separadas do controle da mesa e preservar estados de proposta e declarações físicas. Critérios e limites em [menu do terminal](especificacoes/menu-terminal.md).

- [x] Implementar módulos de telas e navegação para registros disponíveis, sem inventar entidades ainda não implementadas. A barra lateral identifica seções; a navegação usa números no menu principal. Edição segue pelos comandos existentes.
- [x] Testar navegação, paginação, seleção, escopo de sessão, listas vazias e falhas com banco temporário e atualizar documentação. Cinco testes direcionados passaram; visualização no CMD e conferência de dados reais continuam pendentes.

**Evidências:** em 19/11/2026, suíte Node 281/281 fora do sandbox, com integrações simuladas e banco temporário; ESLint e verificação documental aprovados. As listas são consultadas ao entrar na tela, sem atualização automática contínua. Nenhuma mesa, áudio ou dado da igreja foi usado.

### Criação de registros no painel de terminal

Fase 4: permitir criar pessoas, equipamentos, sessões, grupos, papéis e dispositivos físicos a partir de suas listas, por formulários de texto com cancelamento e revisão antes de salvar. Encaminhar ao cadastro existente, atualizar a lista após sucesso e preservar mensagens de validação. Pontos físicos, relações, edição e confirmação seguem pelos comandos existentes até terem telas próprias. Contrato em [menu do terminal](especificacoes/menu-terminal.md).

- [x] Implementar formulários modulares e atualização após gravação, sem contato com a mesa.
- [x] Testar persistência, cancelamento e falhas: oito testes direcionados passaram, com criação de pessoa e equipamento em SQLite temporário e falha simulada. Os demais formulários usam o mesmo fluxo e comandos existentes, sem teste interativo individual; validação no CMD real permanece pendente.

## Atualização de documentação e robustez

**Fases:** base de qualidade e fases 1 a 5. Reconciliar os documentos com a implementação, preservar registros históricos e limitar a leitura de backups antes de consumir memória. Validar restauração normal e rejeição de arquivo maior que o limite sem alterar o destino. Revisar os testes de conexão silenciosa, estado parcial e reconexão; resultados simulados não comprovam aplicação na mesa.

- [x] Atualizar README, arquitetura, especificações de serviço e orquestração, guia de voz e aviso no relatório histórico.
- [x] Limitar leitura de backup de entrada e testar rejeição de arquivo grande e preservação do destino, além de restauração normal, conforme [backup local](especificacoes/backup-local.md). A leitura também limita o crescimento durante operação; esse caso concorrente não foi reproduzido.
- [x] Conferir cobertura existente de estado parcial e reconexão e acrescentar cenário de peer silencioso; os testes observam apenas valores recebidos, sem comprovar sincronização física.
- [x] Esclarecer no README os dois caminhos operacionais, sem retirar a opção legada silenciosamente. A eventual consolidação continua pendente.
- [ ] Avaliar e implementar, conforme especificações próprias e critérios existentes das fases 2–5, recuperação do serviço e integração dos provedores e voz. Execução real, credenciais, equipamento e validações pagas permanecem pendentes até disponibilidade e execução explícita.

## Confiabilidade da documentação

**Fase:** base de qualidade. Decisão e limites em [arquitetura](arquitetura.md); contrato em [verificação documental](especificacoes/verificacao-documental.md). Acompanhar estado no plano, distinguir situação atual e histórico nas especificações e verificar automaticamente links locais e campos estruturais, sem afirmar correção semântica por automação.

- [x] Corrigir divergências conhecidas e padronizar estado, integração e validação das especificações, confrontando os resumos com código e evidências registradas. Isso não comprova ausência de outras divergências semânticas.
- [x] Implementar verificador de campos e destinos locais de links inline com testes de sucesso e falha, documentar comando e configurar etapa no CI; links por referência, HTML e âncoras não são verificados.
- [x] Executar verificações locais aplicáveis e registrar resultados; na rodada original, o CI remoto e as validações reais ainda estavam pendentes. O CI foi confirmado posteriormente; as validações reais seguem pendentes.

### Correção do CI após sincronização

O CI do commit `05ede9a` falhou no Linux em dois testes da tarefa Windows porque a simulação interpretou caminhos Windows com as regras do sistema anfitrião. Ajustar a construção e o diretório de trabalho com semântica Windows e verificar os argumentos no teste simulado; executar os testes locais e acompanhar nova execução remota. Nenhuma tarefa agendada real é instalada.

Correção implementada com `path.win32` para o executável e diretório da tarefa; seis testes simulados passaram no Windows local, bem como ESLint e verificação documental. O CI remoto do commit `588a2e5` passou em Windows e Linux, incluindo esses testes; a tarefa agendada física não foi instalada nem testada.

## Auditoria técnica de 17/11/2026

**Escopo:** análise do estado local atual, incluindo alterações ainda não versionadas; revisão da arquitetura, integrações, testes, recuperação e segurança operacional. Esta rodada não altera o comportamento do aplicativo nem executa operações em mesa, microfone, provedor pago ou Agendador reais.

- [x] Executar os verificadores disponíveis de Node e Python e registrar versões, resultados e limitações.
- [x] Revisar os fluxos de comandos, conexão, voz/IA, cadastro, backup e serviço; reproduzir problemas com dependências simuladas quando possível.
- [x] Publicar diagnóstico com evidências e melhorias priorizadas; separar defeitos de funcionalidades futuras e da validação física pendente.
- [x] Vincular o diagnóstico e atualizar as pendências do usuário sem concluir testes que dependem de equipamento.

**Critérios de aceite:** resultados reproduzíveis com identificação do ambiente; achados com cenário e referência ao código; propostas com prioridade e critérios de validação; limites explícitos sobre equipamento e serviços reais. Fases relacionadas: base de qualidade e fases 0 a 5. A validação física depende do equipamento e permanece separada da conclusão desta auditoria.

**Resultado:** [análise técnica e validação](analise-tecnica-2026-11-17.md). Windows x64, Node 24.21.0 e Python 3.14.7: 114 entradas aprovadas pelo executor Node (inclui um arquivo auxiliar), 14 testes Python aprovados, ESLint e Ruff aprovados. `pip check` não encontrou incompatibilidades, mas NumPy, sounddevice e faster-whisper estão ausentes no `.venv`; `node src/index.js` falhou antes da captura com `ModuleNotFoundError: numpy`. Probes adicionais reproduziram falhas não cobertas pela suíte. Nenhum teste novo em equipamento/provedor/Agendador reais; o CI remoto não foi verificado. Não houve correção de código nesta rodada.

**Correções após a auditoria:**

- [x] Corrigir EOF/interrupção do terminal, cancelamento e invalidação após pausa/revogação (A1–A3). Subprocessos em modo texto testaram EOF e SIGINT emitido; provedor falso testou resposta tardia. A autorização externa deve notificar o orquestrador por `invalidate(inputId)` quando for alterada sem fala; não há detecção automática de alterações invisíveis no callback. SIGINT físico e encerramento simultâneo de worker e mesa não foram exercitados nesta rodada.
- [x] Aplicar lint aos scripts/fixtures e classificar falhas de subprocesso e envelope do provedor (A4–A6). `no-undef` foi conferido nos quatro grupos; executável inexistente e respostas malformadas testados sem áudio/rede externos. Encerramento do Python por sinal não foi reproduzido no Windows.
- [x] Fortalecer validação de esquema e invariantes no backup (A7). Backup com checksum válido e esquema adulterado e backup canônico com conflitos confirmados foram recusados antes da instalação; testes normais e WAL passaram em diretórios temporários.

**Validação de 17/11:** `npm test` 121/121; `npm run lint` aprovado; pytest 14/14; Ruff check e format aprovados; `git diff --check` aprovado com avisos de CRLF. Python 3.14 usado nos testes simulados; lançador `py` indisponível. Não foram testados Python 3.12, microfone, modelo, Gemini ou mesa reais. Não houve instalação de dependências de áudio.
- [ ] Preparar ambiente suportado de voz e testar worker real explicitamente. [Diagnóstico de dependências](especificacoes/diagnostico-voz.md) implementado e testado; `.venv/voice312` foi criado com Python 3.12.14 do runtime do Codex e dependências instaladas, com importações e `pip check` aprovados. Esse ambiente depende da instalação do runtime e não é distribuição definitiva. Worker com modelo e microfone reais seguem pendentes.
- [x] Especificar e integrar uma fatia ponta a ponta com mesa e provedor simulados, passando por origem, modo, ativação, proposta, confirmação e validação final. Sete testes automatizados verificaram recusa, cancelamento, queda e resposta tardia: [contrato da fatia](especificacoes/fluxo-simulado.md). A integração ao serviço e equipamento real continua pendente; conexão aqui é apenas sinal simulado.
- [x] Ampliar CI para Windows e versões suportadas e conferir execução no GitHub após envio. Matriz Windows/Linux com Node 22 e Python 3.12 aprovada no commit `588a2e5`, sem instalar tarefa, acessar hardware ou usar provedor pago.

## Fase inicial — Base de qualidade

**Objetivo:** permitir que mudanças futuras sejam verificadas de forma repetível antes de ampliar a arquitetura.

- [x] Manter os testes Node existentes com `node:test` e configurar ESLint para o código do projeto. Verificações locais passaram em 16/11/2026.
- [x] Configurar pytest e Ruff para o Python, com comandos documentados e dependências de desenvolvimento separadas. Verificações locais passaram com Python 3.14 e também com Python 3.12 em 17/11, com áudio/modelo simulados; a execução do CI remoto ainda não foi conferida.
- [x] Criar verificações simuladas para os fluxos já implementados, sem exigir mesa, microfone, Holyrics ou credenciais. O conjunto deverá ser ampliado conforme novos componentes forem implementados.
- [x] Implementar dois simuladores complementares conforme [especificação de mesa simulada](especificacoes/mesa-simulada.md): estado em memória para testes de regras e servidor WebSocket local para exercitar a biblioteca real. Conexão, mute, fader, mensagem inválida, queda e reconexão foram testados localmente; fidelidade com equipamento real permanece pendente.
- [x] Criar terminal interativo para visualizar e manipular 24 canais virtuais, com servidor WebSocket em loopback e estado compartilhado com o aplicativo. Comandos, erros, saída e alteração entre terminal e biblioteca real foram testados sem mesa física. A demonstração web da Soundcraft é referência externa; integração com ela não está comprovada nem é requisito.
- [x] Configurar workflow GitHub Actions para lint e testes em Windows/Linux sem hardware ou chamadas pagas. O arquivo está no projeto; a execução remota permanece pendente abaixo.
- [x] Confirmar execução do workflow no GitHub após envio das alterações; a execução do commit `588a2e5` passou após correção dos caminhos Windows.
- [x] Preparar formato de casos para avaliação de voz e LLM, incluindo resultados esperados e ações proibidas, preservando privacidade dos áudios: [cenários iniciais](avaliacoes.md). A execução das avaliações ainda depende da implementação e de amostras apropriadas.
- [ ] Depois de estabilizar os comandos locais e o CI, avaliar hook Git local opcional para verificações rápidas, com instruções de instalação e sem hardware ou chamadas pagas.

**Concluída quando:** comandos locais e pipeline executarem as verificações configuradas com resultados reproduzíveis, documentação atualizada e limitações conhecidas. A validação com a mesa continua em etapa própria.

## Fase 0 — Medição e viabilidade

**Objetivo:** conhecer o atraso atual e confirmar o acesso ao áudio e aos controles necessários antes de expandir o sistema.

- [ ] Registrar modelo do computador, Windows, firmware da mesa, driver e ligação de áudio usados nos testes.
- [ ] Medir carregamento do modelo, gravação, transcrição e tempo até envio, com frases repetíveis; separar o primeiro pedido dos seguintes.
- [ ] Listar dispositivos e APIs de áudio disponíveis e confirmar a quantidade de canais da Ui24R acessíveis pelo Python.
- [ ] Conferir o mapeamento USB com uma fonte conhecida, testar duas entradas e verificar áudio com o canal mutado.
- [ ] Levantar, por recurso da biblioteca, se é possível ler, alterar, receber mudanças externas e confirmar o resultado: canais, auxiliares, grupos de mute, roteamento, snapshots e cues.
- [ ] Testar acesso ao áudio no contexto de inicialização pretendido. O usuário informou que o Windows entra automaticamente no desktop; o teste após reinício ainda não foi feito.
- [ ] Verificar se identificadores de dispositivos mudam após reinício ou reconexão e como identificar a Ui24R com segurança, sem presumir que o índice permaneça fixo.

**Concluída quando:** resultados e limitações estiverem registrados, incluindo evidência da mesa física ou indicação explícita do que ainda não pôde ser testado. A ausência de uma capacidade deve gerar uma decisão de alternativa ou adiamento.

## Fase 1 — Voz mais responsiva

**Objetivo:** reduzir a espera mantendo um único fluxo de voz simples e reproduzível.

Procedimento para uso com microfone e modelo reais: [medição de voz](medicao-de-voz.md). Nenhuma medição real foi executada nesta rodada.

Especificação inicial: [processo de voz persistente](especificacoes/voz-persistente.md). Implementado e testado com componentes simulados; ainda requer validação de áudio real e medição de latência.

**Rodada de 16/11/2026:** worker Python persistente, cliente Node e integração pelo terminal implementados com testes simulados. A gravação permanece em cinco segundos e a avaliação física de latência fica pendente.

- [x] Implementar o processo Python e o modelo carregados entre comandos; definir protocolo local e tratamento de falha sem repetição automática. Validado com processos e modelo simulados; verificar comportamento com áudio real na fase de testes físicos.
- [ ] Medir e comparar o comportamento com o protótipo anterior.
- [ ] Avaliar captura contínua e detecção de início/fim de fala com áudio real. A primeira etapa [fim por silêncio](especificacoes/fim-de-fala.md) é opcional, experimental e foi testada somente com áudio simulado; sem escuta contínua nesta entrega.
- [ ] Comparar modelos e configurações com as mesmas frases em português, inclusive nomes, números e música ao fundo.
- [ ] Registrar tempo desde o fim da fala até transcrição e envio; registrar erros, CPU e memória.

**Concluída quando:** uma entrada consegue executar pedidos repetidos sem recarregar o modelo, os erros são reportados e há medições comparáveis. O limite aceitável de latência e acerto será definido após o teste real.

## Fase 2 — Aplicação local e conexão

**Objetivo:** disponibilizar serviço Node.js em segundo plano e configuração e consulta pelo terminal.

**Integração inicial do MVP:** canal local, confirmação de mute/fader, worker de voz e consulta de estado foram integrados e testados com serviço e mesa simulados, incluindo cancelamento, quedas e distinção entre solicitação e confirmação da mesa. Faltam áudio, Ui24R e reinício reais; o canal não é exposto à rede.

- [x] Supervisionar o worker de voz no serviço: captura manual sem pedidos simultâneos, falha visível, reinício explícito sem repetição e descarte de resultado tardio após parada. Validado com worker simulado e encerramento; teste com microfone e modelo reais continua separado.
- [x] Ampliar o diagnóstico da tarefa de login com último resultado e horários quando disponíveis, sem instalar ou alterar tarefas durante testes automatizados. Seis testes com executor simulado e ESLint direcionado passaram; validação do comportamento no reinício permanece física.
- [x] Incluir a configuração persistente de voz no backup do aplicativo, preservando compatibilidade com backups anteriores, recusando dados inválidos e testando restauração em diretórios temporários. Formato v2 inclui voz; v1 continua aceito. Modelos e credenciais não são incluídos, e caminhos e dispositivos restaurados precisam de conferência.
- [x] Expor [observação parcial de mute e fader](especificacoes/observacao-parcial-mesa.md) recebidos por conexão, com horário e invalidação ao cair; não inferir confirmação ou completude nem usar valores antigos para ajuste relativo. Testada a biblioteca real com peer simulado, dados inválidos, reconexão parcial e mensagem enviada sem eco. O comportamento da Ui24R física segue pendente.

**Rodada de 16/11/2026:** [configuração persistente e reconexão](especificacoes/conexao-configuracao.md) implementadas e testadas com servidor simulado, sem frontend. Instalação como serviço Windows e validação física são atividades distintas ainda pendentes.

**Backup local implementado:** conforme [especificação de backup](especificacoes/backup-local.md), exportar configuração e banco SQLite consistente e validar antes de restaurar apenas em diretório novo ou vazio. Exportação e restauração pelo terminal foram testadas em processos separados; os testes usam diretórios temporários e não incluem credenciais ou snapshots da mesa. O procedimento ainda precisa ser exercitado com dados reais pelo usuário.

**Serviço local integrado:** [especificação de comandos](especificacoes/comandos-servico-local.md) cobre entrada textual, captura manual, propostas e confirmações pelo terminal, com restrição local e modo inicialmente pausado. Testes usam worker simulado e a biblioteca real ligada a mesa simulada. A troca de IP bloqueia pedidos até reiniciar; edições externas concorrentes têm a limitação descrita na especificação. O resultado indica solicitação à biblioteca, sem comprovar entrega ou aplicação; sincronização completa após reconexão, microfone, mesa, instalação e reinício reais permanecem pendentes.

**Inicialização após login preparada:** [especificação](especificacoes/inicializacao-windows.md) implementa comandos explícitos para instalar, consultar e remover tarefa por usuário, recusando colisões e tarefas com identidade diferente. Cinco testes simulam o Agendador; nenhuma tarefa foi instalada, e reinício, ausência de janela e áudio real ainda exigem validação.

- [x] Criar comandos de terminal para configurar IP, consultar estado e administrar o serviço em segundo plano; cobertura em processos e conexões simuladas.
- [ ] Validar configuração, consulta e administração com o computador e a mesa reais, incluindo reinicialização.
- [ ] Permitir revisão e configuração das preferências implementadas pelo terminal; planejar interface web e acesso por outros dispositivos para etapa posterior.
- [x] Persistir o IP local e recuperá-lo em novo processo; testar valores inválidos. Os demais cadastros usam SQLite local, com esquema versionado.
- [x] Implementar reconexão enquanto o aplicativo estiver ativo e testar servidor simulado iniciar depois, cair e voltar. Validação na mesa física permanece pendente.
- [ ] Sincronizar estado após reconexão quando suportado; não executar automaticamente pedidos antigos feitos offline.
- [x] Preparar comandos de instalação, consulta e remoção da tarefa de login e apresentar falhas do worker; testes do Agendador foram simulados.
- [ ] Instalar explicitamente no ambiente escolhido e testar reinício, ausência de janela e disponibilidade do áudio no Windows real.
- [ ] Proteger a API local e definir explicitamente qualquer acesso de outros dispositivos antes de habilitá-lo.
- [ ] Definir locais de instalação, dados, configurações e modelo Whisper; preservar dados ao atualizar o aplicativo.
- [ ] Testar reconexão do áudio USB quando o dispositivo for removido, religado ou disponibilizado depois do serviço.
- [x] Implementar exportação e restauração de cadastros, IP e configuração de voz, separadas dos snapshots e shows da mesa; validação automatizada usa diretórios temporários.
- [ ] Conferir atualização e restauração de backup com dados de exemplo no ambiente real.

**Concluída quando:** reiniciar o computador, consultar o serviço pelo terminal, ligar a mesa depois e observar conexão e estado corretos, com configurações preservadas. Validar também queda e retorno de conexão; o painel web não é requisito desta fase.

## Fase 3 — Voz por múltiplas entradas e modos

**Objetivo:** operar com mais de um microfone e controlar quais origens podem enviar comandos.

**Modos integrados:** [política de modos](especificacoes/politica-modos.md) inicia pausada, restringe passagem às entradas habilitadas e culto ao master configurado; terminal autorizado altera modo e configuração persistente. Recusas, revogação de pendências e persistência foram testadas por componentes e HTTP simulado; validação física segue pendente.

**Ativação textual:** [especificação](especificacoes/ativacao-textual.md) cobre palavra inicial “mesa”, pedido imediato ou seguinte, cancelamento, expiração e isolamento por entrada com autorização explícita; testes usam entradas simuladas. O serviço processa transcrição de captura manual pelo mesmo orquestrador; não implementa escuta contínua nem detecção acústica.

**Orquestração integrada:** o serviço combina ativação, parser local, modos e propostas com confirmação e provedor Gemini opcional; isolamento de conversas e captura identificada foram testados em simulação conforme [múltiplas entradas](especificacoes/multiplas-entradas.md). Testes com provedor falso não validam serviço externo ou mesa física.

- [x] Selecionar entradas e associá-las às fontes da sessão; sem presumir identidade apenas pela entrada. Vínculo e sessão ativa foram testados com SQLite e serviço simulados; ligação física pendente.
- [x] Isolar conversas simultâneas e tratar pedidos concorrentes sobre o mesmo controle. Testado com entradas e mesa simuladas; fala simultânea real pendente.
- [ ] Implementar e testar ativação por “mesa”, fim por silêncio, esclarecimento e cancelamento.
- [x] Configurar microfone master e modos passagem, culto e escuta pausada pelo terminal inicialmente. Implementados e testados em HTTP e componentes simulados; comprovação física pendente.
- [ ] Definir autorizações de transição e comportamento após reinício; encerrar ou pausar pedidos de entradas desabilitadas.
- [ ] Medir atrasos, perda de comandos e ativações falsas com música, sobreposição e falas captadas em mais de uma entrada.

**Concluída quando:** os modos restringirem comandos conforme configurado sem mutar o áudio da mesa, e os cenários de origem, concorrência e recuperação tiverem sido testados.

## Fase 4 — Sessão, equipe e retornos

**Objetivo:** usar contexto da sessão para pedidos compreensíveis por integrantes.

**Caminhos físicos e revisão por voz:** a [especificação](especificacoes/caminhos-fisicos.md) cobre cadastro de mesa/medusa/portas/vias, ligações de entrada e retorno, revisão, consulta e transcrição restrita. A captura manual foi integrada ao serviço e testada com worker simulado; faltam validação de voz real e conferência dos caminhos físicos com o usuário. Confirmação no cadastro não comprova patch na mesa.

- [x] Modelar e migrar banco, atualizar backups, incluir revisão e consulta dos caminhos físicos de entrada e retorno por terminal. Validado em bancos temporários, incluindo persistência em outro processo; conferência física permanece pendente.
- [x] Integrar interpretação de transcrição simulada a propostas de vínculo com origem e revisão (correção, confirmação e rejeição), sem inferir canal ausente ou executar ação. A interpretação cobre formato restrito e não usa microfone ou LLM real.

- [x] Substituir limite fixo de AUX por quantidade configurável no SQLite: novos bancos aguardam configuração explícita; migração preserva valor histórico e dados, identificando-o como legado não confirmado; redução que exclua retornos existentes é rejeitada. Configuração/consulta no terminal, migração transacional, backup de versões anteriores, rollback e concorrência testados com bancos temporários. Não confirma capacidade física nem inclui instalador automático.

**Resposta individual e fallback:** [especificação](especificacoes/respostas-individuais.md). A seleção determinística e a fila existem apenas em simulação. O objetivo é priorizar retorno individual confirmado, usar PA com limite configurado apenas em ensaio/passagem quando retorno estiver indisponível e mostrar no terminal durante culto. Antes de reprodução real, validar identificação, disponibilidade, envios isolados e capacidade da mesa, privacidade de retornos compartilhados, volume e concorrência, e testar queda/mudança de contexto; não presumir que P2/RCA separado por software assegure roteamento individual.

- [x] Cadastrar AUX e propor, consultar, confirmar, rejeitar ou revogar vínculos entre pessoa e retorno na sessão; preservar compartilhamento, conflitos e histórico. Validados faixa, referências, persistência, migração e backup em bancos temporários e CLI; propostas e contagens não comprovam exclusividade física. Cadastro limitado a um AUX confirmado por pessoa e sessão; estéreo, ligação à fila e conferência física dos caminhos continuam pendentes. [Especificação](especificacoes/cadastro-retornos.md).

- [x] Implementar e testar política pura de seleção de destino, com retorno confirmado exclusivo, PA somente em ensaio/passagem com limite explícito, texto no culto e recusa quando contexto ou limite for incerto; três testes automatizados passaram sem hardware nem reprodução. Integrada ao serviço apenas para simulação.
- [x] Implementar fila limitada em memória com reprodução e roteamento exclusivamente simulados: serializar respostas na única saída, reler contexto/vínculo no início de cada uma, cancelar reprodução simulada quando uma mudança invalidar seu destino, permitir cancelamento e expor falhas. Seis testes específicos passaram; sem mesa, síntese ou áudio reais. Contrato em [respostas individuais](especificacoes/respostas-individuais.md).
- [ ] Implementar e validar síntese e roteamento seletivo após confirmar capacidade, controle de concorrência e recuperação; executar testes com usuário, áudio e mesa em ambiente controlado antes de marcar validado.

**Primeira fatia implementada:** [cadastro local e vínculos de sessão](especificacoes/cadastro-sessao.md), com SQLite local e acesso por terminal. Testes incluem reinício de processo, referências e conflitos concorrentes com dados temporários. Isso não confirma patch nem implementa todos os cadastros da fase.

- [x] Cadastrar integrantes, grupos, papéis, equipamentos, fontes e vínculos de sessão. Formação e papéis foram testados com SQLite e fluxo simulados; conferência com equipe real permanece pendente.
- [ ] Completar cadastro de tipos de fonte, equipamentos e características. Já existem modelo opcional, características independentes e caminhos declarados diretos ou por medusa; faltam detalhamento restante e conferência física.
- [ ] Validar saídas auxiliares, vias da medusa e reguladores reais e completar o tratamento de identificação por cor. Os pontos e conexões declarados já podem ser cadastrados e consultados.
- [ ] Integrar envios aos auxiliares e validar operações realmente suportadas. AUX e vínculos compartilhados já podem ser cadastrados; isso não confirma o roteamento físico nem implementa controle de envio.
- [ ] Permitir ajustes em escala de 0 a 100, distinguindo valor absoluto de alteração relativa e testando a conversão. Implementado para fader de entrada e testado em HTTP e componentes simulados; validação da curva física pendente; AUX não integrado.
- [x] Implementar passagem guiada e confirmação de vínculos, com edição manual no terminal inicialmente. Testada com bancos temporários e revisão de concorrência; a confirmação no cadastro não comprova ligações físicas.
- [ ] Integrar captura de voz real à revisão de cadastros e ampliar o escopo de interpretação; levar ao painel em fase posterior. Captura manual e análise textual restrita estão integradas ao serviço, com origem e revisão no terminal, testadas com worker e transcrições simulados; microfone e Whisper reais permanecem pendentes.
- [ ] Identificar vínculos físicos e patches não confirmados ou possivelmente desatualizados; apresentar conflitos de uso de microfone, entrada ou canal para revisão, sem substituição silenciosa.
- [ ] Disponibilizar resposta falada e testar destino de áudio e prevenção de captação da própria resposta.

**Concluída quando:** uma sessão com pelo menos duas fontes e um retorno compartilhado puder ser configurada, consultada e testada com a mesa; pedidos ambíguos devem gerar esclarecimento.

## Fase 5 — LLM, ferramentas e apresentação

**Objetivo:** interpretar pedidos mais livres e integrar programação sem prender os sistemas entre si.

**Escolha de provedor:** [contrato de provedores](especificacoes/provedores-llm.md). Gemini, OpenAI e Anthropic e operação sem LLM foram integrados com configuração persistente, limite local de tentativas e consentimento por pedido; testes usam transporte falso. Orçamento financeiro, painel e provedor real permanecem pendentes.

- [x] Criar seleção desacoplada e contrato de interpretação validado para provedores, com consentimento, isolamento, erros e comportamento sem provedor ou adaptador ausente. Testada troca entre adaptadores com transporte simulado, resposta inválida e troca durante espera; seleção é persistente.
- [ ] Implementar configuração persistente e administração segura pelo serviço/terminal, depois expô-la no painel; definir modelo, autenticação, privacidade, limites e falha sem troca automática de provedor. Serviço e terminal, limite de tentativas e três adaptadores passaram em simulação; painel, limite financeiro e validação real seguem pendentes.

**Provedor inicial implementado:** [Gemini opcional](especificacoes/gemini.md), acesso HTTP desacoplado, opt-in e consentimento explícito, credencial no ambiente e timeout, com respostas estruturadas validadas e rede simulada. Integrado ao serviço e testado em HTTP simulado conforme [contrato](especificacoes/llm-servico.md); orçamento e validação com provedor real permanecem pendentes.

**Validador determinístico integrado:** [especificação](especificacoes/validacao-ferramentas.md) limita propostas a canais, mute e fader suportados; o serviço revalida parâmetros, autorização, conexão e confirmação no envio. Testes de componentes não comprovam efeito na mesa.

- [ ] Definir provedor, autenticação, limites de custo, dados enviados e comportamento sem LLM ou internet.
- [ ] Integrar interpretação com ferramentas controladas pelo serviço, mantendo comandos básicos locais. Gemini, OpenAI e Anthropic estão integrados e testados com transporte simulado; provedores/mesa reais e demais ferramentas seguem pendentes.
- [ ] Adicionar MCP se a interoperabilidade justificar, com permissões, confirmações e resultados explícitos.
- [ ] Validar capacidades de catálogo, criação, atualização e carregamento de cues/snapshots e de grupos de mute antes de expô-las.
- [ ] Testar evento do Holyrics em modo informativo e permitir vínculos revisáveis entre música/etapa e cue.
- [ ] Validar que Holyrics e som funcionam separadamente e que falhas e ações concorrentes são visíveis.

**Concluída quando:** o fluxo escolhido tiver sido testado com resultados separados por sistema e ações somente dentro das capacidades verificadas.

## Fase 6 — Monitoramento e equalização assistida

**Objetivo:** investigar análise de áudio e sugestões antes de qualquer automação de mixagem.

- [ ] Confirmar acesso ao sinal e ao estado de processamento necessários.
- [ ] Testar medições e alertas com o técnico, sem alterar a mesa automaticamente.
- [ ] Avaliar sugestões revisáveis, limites e recuperação de estado anterior quando disponíveis.
- [ ] Definir critérios de qualidade e testes reais antes de considerar ajustes automáticos.

**Concluída quando:** as medições e sugestões escolhidas tiverem evidência de utilidade e as limitações forem conhecidas. Aplicação automática exige decisão e validação próprias.

## Detalhamento de desenvolvimento, integração e aceite

As tabelas complementam os checklists das fases: cada linha agrupa atividades relacionadas e descreve um caminho possível, sujeito aos resultados anteriores. Os testes sob **Usuário/equipamento** exigem participação do usuário, acesso à mesa, ao ambiente de culto ou decisão explícita; não devem ser dados como aprovados apenas por simulação.

### Fase inicial — Base de qualidade

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Verificadores locais | ESLint, pytest e Ruff configurados com `node:test`; comandos documentados. | [x] Lint e testes existentes executados localmente nas rodadas registradas; [ ] confirmar versões e resultados no CI remoto. | Não exige mesa; usuário pode revisar os comandos. |
| CI e simulação | Workflow GitHub Actions configurado para testes disponíveis e integrações simuladas, sem segredos ou equipamentos. | [x] Workflow definido para Windows/Linux, sem hardware ou chamadas pagas; [ ] execução remota e apresentação de falhas ainda não verificadas. | Após envio ao GitHub, conferir resultado do pipeline quando habilitado. |
| Avaliação de voz e LLM | Definir estrutura de casos, métricas e armazenamento adequado; incluir ambiguidades e ações proibidas. | [ ] Casos podem ser repetidos; [ ] ferramenta e parâmetros são verificados por regras; [ ] áudio privado não entra no repositório público. | Autorizar e gravar amostras quando houver avaliação de áudio real; aprovar critérios de experiência. |

### Fase 0 — Medição e viabilidade

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Inventário e linha de base | Levantar versões do Windows, Node, Python, firmware e driver; instrumentar o fluxo atual sem mudar seus resultados. | [ ] Ambiente e configuração registrados; [ ] tempos de carga, gravação, transcrição e envio medidos separadamente, com amostras repetíveis; [ ] erros registrados. | Disponibilizar o computador e exemplos de frases; avaliar o atraso percebido. |
| USB multicanal | Enumerar dispositivos/APIs com Python; captar fontes conhecidas em canais selecionados; testar uma e duas entradas e canal mutado. | [ ] Mapa observado e condições registrados; [ ] disponibilidade simultânea e comportamento em mute documentados; [ ] limitações do driver identificadas. | Conectar a mesa por USB, microfones e fontes; confirmar sinal, canais e teste de mute. |
| Capacidades da mesa | Inspecionar a biblioteca e documentação; registrar leitura, escrita, atualização externa e confirmação por recurso; testar apenas operações disponíveis em ambiente controlado. | [ ] Matriz de capacidades e incertezas disponível; [ ] modo simulado e comportamento real distinguidos; [ ] recursos ausentes têm alternativa ou adiamento. | Disponibilizar firmware e mesa; acompanhar testes de canais, auxiliares, mute, roteamento e cues/snapshots sem afetar apresentação. |
| Inicialização e áudio | Identificar se há sessão automática; testar execução no contexto de login ou de inicialização e acesso ao dispositivo. | [ ] Contexto de execução e acesso ao driver registrados; [ ] opção de inicialização escolhida ou questão registrada. | Reiniciar o computador e observar início e disponibilidade física da mesa/USB. |
| Identificação do dispositivo | Comparar identificadores disponíveis antes e depois de reiniciar e reconectar; não confiar apenas em índice numérico. | [ ] Comportamento observado documentado; [ ] identificação ambígua ou dispositivo ausente gera alerta, sem selecionar fonte errada. | Reiniciar e reconectar a Ui24R e conferir entradas no equipamento real. |

### Fase 1 — Voz mais responsiva

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Processo Python persistente | Node envia solicitações identificadas e recebe resultado ou erro de um processo persistente. | [x] Reutilização, falhas e associação de pedidos testadas com worker/modelo simulados; [ ] repetir com modelo e microfone reais e medir espera. | Falar comandos repetidos e comparar a espera com o protótipo anterior. |
| Captura e fim da fala | Manter captura aberta quando possível; segmentar por detecção de fala/silêncio e preservar ativação manual durante os testes. | [ ] Frase curta não espera obrigatoriamente cinco segundos; [ ] início e fim não são cortados nos cenários testados; [ ] ausência de áudio é informada. | Testar pausas naturais, ruído e música no local de uso. |
| Benchmark de modelos | Reutilizar conjunto de frases e condições para comparar `tiny`, `base` e `small` e parâmetros; medir do fim da fala ao resultado. | [ ] Tempos medianos e de pedidos lentos, erros, CPU e memória registrados; [ ] comparação e modelo escolhido justificados. | Avaliar se a latência e os erros observados são aceitáveis para a equipe. |

### Fase 2 — Aplicação local e conexão

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Serviço e terminal | Serviço separado, comunicação local autenticada e consulta administrativa implementados. | [x] Consulta e falhas testadas com processo e conexão simulados; [ ] avaliar clareza e funcionamento no computador real. | Experimentar os comandos e avaliar as mensagens. |
| Configuração persistente | IP em arquivo local; cadastros em SQLite versionado e configuração de voz em arquivo separado. | [x] Persistência entre processos e erros de entrada testados; [ ] validar após reinício real. | Informar IP correto e verificar após reinício. |
| Conexão e estado | Reconexão e observação parcial de mensagens recebidas. | [x] Queda, retorno e ausência de reenvio testados com servidor simulado; [ ] sincronização completa e comportamento físico não comprovados. | Ligar, desligar e religar a mesa e conferir na interface original. |
| Inicialização e acesso local | Tarefa Windows e canal local preparados. | [x] Agendador e estado do worker testados em simulação; [ ] início, janela, desinstalação e áudio após reinício reais pendentes. | Reiniciar o computador e validar consulta e áudio. |
| Configuração inicial | Validar IP no terminal e bloquear operações quando a configuração mudar. | [x] IP inválido é recusado, configuração persiste e o serviço bloqueia endereço antigo em simulação; [ ] testar na rede real. A troca exige reiniciar o serviço. | Informar IP e testar a alteração na rede real. |
| Dados, atualização e backup | Backup do aplicativo implementado, separado de shows/snapshots da mesa. | [x] Backup e restauração testados em diretórios temporários; [ ] atualização e recuperação com dados de exemplo no ambiente real pendentes. | Testar atualização e recuperação de cópia e verificar resultado. |
| Recuperação do áudio USB | Detectar indisponibilidade e testar reabertura com identificação do dispositivo; informar estado e evitar associar outra entrada indevidamente. | [ ] Remoção e retorno são reportados; [ ] captura é recuperada quando possível; [ ] ambiguidade exige revisão. | Desconectar/reconectar a USB ou ligar a mesa depois do serviço e verificar canais. |

### Fase 3 — Voz por múltiplas entradas e modos

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Múltiplas entradas e conversas | Identificar origem, manter conversas separadas e limitar workers; coordenar alterações sobre o mesmo controle. | [x] Origens, concorrência, limite de quatro e estado por entrada testados em simulação; [ ] fala simultânea, desempenho e identificação de dispositivos reais. A entrada não comprova identidade. | Participar com duas pessoas e duas entradas, inclusive falando ao mesmo tempo. |
| Ativação por “mesa” | Começar com alternativa medida na fase 1; segmentar a frase, preservar início e comparar detector separado se necessário. | [ ] Pedido na mesma frase é reconhecido nos testes; [ ] esclarecimento, expiração e “cancelar” funcionam; [ ] perda e ativação indevida são medidas. | Testar fala, canto, música e conversas no ambiente de culto. |
| Modos e microfone master | Persistir entradas e master; passagem, culto e pausa acessíveis pelo terminal. | [x] Bloqueio, invalidação e HTTP testados com dependências simuladas; [ ] recuperação física após reinício e decisões de permissões pessoais e retomada. Política não envia mute à mesa. | Escolher microfone master e dirigente, testar transições e decidir comportamento após reinício. |

### Fase 4 — Sessão, equipe e retornos

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Cadastros e sessão | Modelar integrantes, grupos, papéis, equipamentos, fontes e vínculos com banco e terminal; manter dados da sessão separados dos permanentes. | [ ] Uma pessoa pode ter várias fontes; [ ] vínculos podem ser confirmados e corrigidos; [ ] dados persistem após reinício. | Cadastrar uma formação real e verificar nomes, papéis, canais e equipamentos. |
| Tipos e caminhos físicos | Cadastro de equipamento, pontos e ligações declaradas com patch explícito, direto ou por medusa. | [x] Caminhos, informações ausentes e confirmação exercitados com banco temporário; [ ] conferir ligações, tipos e patch físicos. | Conferir a ligação real, identificação, tipos e patch com o técnico. |
| Retornos pela medusa | Cadastro de AUX, pessoas, pontos e ligações declaradas; retorno estéreo dedicado ainda não implementado. | [x] Caminho AUX–medusa–fone–pessoa exercitado em banco temporário; [ ] comprovar caminho físico e modelar par estéreo. Regulador físico não é controlado. | Identificar auxiliares, saídas, vias e reguladores físicos e conferir os vínculos. |
| Identificação por cor e voz | Texto transcrito em formato restrito gera proposta, com canal apenas se caminho e patch estiverem confirmados no cadastro. | [x] Frase clara, duplicidade, conflitos e patch ausente testados com dados simulados; [ ] captura real, cor de canal na mesa e integração à conversa permanecem pendentes. | Ditar o exemplo, testar duas etiquetas iguais e validar o canal na mesa. |
| Mudanças e conflitos de vínculos | Registrar origem e momento da confirmação do caminho/patch; revisar duplicidade de equipamento ou entrada e mudanças externas conhecidas. | [ ] Vínculo manual ou possivelmente desatualizado é identificado; [ ] conflito não é substituído silenciosamente; [ ] revisão é registrada. | Trocar um vínculo em ambiente de teste e confirmar a correção com o técnico. |
| Segurança de equipamentos e processamento | Registrar compatibilidade de alimentação conhecida e origem da informação; manter sugestões de processamento revisáveis. | [ ] Phantom não é acionado automaticamente pelo tipo de cápsula; [ ] cadeia desconhecida é indicada; [ ] não há EQ fixa aplicada apenas por tipo ou marca. | Técnico verifica a cadeia e as especificações dos equipamentos antes de qualquer alteração de alimentação. |
| Auxiliares e escala | Fader de entrada usa escala provisória 0–100; envios auxiliares continuam pendentes. | [x] Absoluto e relativo, limites e revisão de estado testados em componentes e HTTP simulado; [ ] curva física e controle de AUX pendentes. Envio não comprova estado aplicado. | Conferir na mesa um retorno compartilhado e avaliar a escala e o efeito dos ajustes. |
| Passagem guiada e resposta falada | Revisão e confirmação de cadastros pelo terminal; TTS e saída de áudio continuam pendentes. | [x] Fluxo corrigível e revisão de propostas testados com banco temporário; [ ] resposta falada, falhas de áudio e retorno da própria voz. | Percorrer a passagem com integrantes e avaliar a compreensão e o destino da resposta. |
| Revisão de cadastros por voz | Terminal aceita transcrição textual de formato restrito e preserva proposta, frase e origem. | [x] Correção, confirmação e rejeição testadas com texto e banco temporário; [ ] integrar captura real e ampliar tipos de cadastro, sem tratar propostas como confirmadas. | Ditar cadastros, corrigir um reconhecimento incorreto, rejeitar outro e confirmar o resultado exibido. |

### Fase 5 — LLM, ferramentas e apresentação

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Provedor de LLM | Gemini, OpenAI e Anthropic opcionais com seleção persistente e limite diário de tentativas. | [x] Contrato, cota, indisponibilidade, troca e HTTP testados com transporte falso; [ ] orçamento financeiro, painel e testes reais permanecem pendentes. | Definir modelos, acesso, limites de custo e dados que aceita enviar; fornecer credencial pelo mecanismo apropriado. |
| Ferramentas e MCP | Implementar funções de consulta e alteração com validações no serviço; expor via MCP se necessário; não confiar apenas nas instruções da LLM. | [ ] Parâmetros e permissões verificados; [ ] ambiguidades esclarecidas; [ ] operações sensíveis confirmadas conforme política; [ ] erros e resultados reais preservados. | Definir e testar permissões e confirmações para o técnico e os integrantes. |
| Cues, snapshots e grupos | Usar a matriz da fase 0 para implementar somente operações verificadas; separar criação, atualização, consulta e aplicação. | [ ] Catálogo reflete apenas capacidades conhecidas; [ ] atualização identifica o alvo e pede confirmação; [ ] resultado e limitações de recuperação são visíveis. | Acompanhar teste em mesa e avaliar efeito de cada operação em momento controlado. |
| Holyrics | Usar adaptador independente; começar com evento informativo; mapear identificadores de músicas/etapas aos cues e definir política por vínculo. | [ ] Evento e vínculo aparecem sem alterar a mesa no modo informativo; [ ] duplicidade e falhas são visíveis; [ ] cada sistema funciona sem o outro; [ ] aplicação depende de capacidade validada. | Disponibilizar Holyrics e programação de teste; confirmar momento real dos gatilhos e vínculos. |

### Fase 6 — Monitoramento e equalização assistida

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Captação e medições | Validar fontes USB, ponto de sinal e estado de processamento; calcular indicadores e publicá-los no painel. | [ ] Origem, limites e atraso das medições registrados; [ ] alertas são identificados como medições e não como diagnóstico definitivo. | Gerar sinais conhecidos e conferir leituras na mesa em ambiente controlado. |
| Sugestões e eventual aplicação | Criar recomendações revisáveis baseadas em dados disponíveis; validar leitura, limites e recuperação antes de permitir qualquer ação. | [ ] Sugestão informa origem e limitações; [ ] nenhuma alteração automática ocorre nesta etapa; [ ] valor anterior e confirmação são usados quando disponíveis. | Técnico avalia sugestões e define critérios para eventual teste de aplicação. |

## Integração entre componentes e validação ponta a ponta

| Fluxo | Contrato a verificar | Aceite integrado | Dependência do usuário |
| --- | --- | --- | --- |
| Terminal ↔ serviço ↔ armazenamento | Configurações validadas, persistência e consulta de estado. | [ ] Alterar IP, reiniciar e recuperar o mesmo valor; [ ] erro exibido de forma compreensível. | Reiniciar o computador e conferir no terminal. |
| USB → Python → Node | Origem e identificador acompanham áudio, transcrição e erro; processo permanece vivo. | [ ] Duas origens são diferenciadas; [ ] queda do processo é detectada; [ ] medições por etapa disponíveis. | Conectar mesa e falar em entradas conhecidas. |
| Node ↔ Ui24R | Comandos validados, conexão e confirmação separadas; atualização externa quando suportada. | [ ] Mudança aprovada é enviada ao alvo correto; [ ] desconexão não causa reenvio tardio; [ ] confirmação ou incerteza exibida. | Acompanhar teste na interface da mesa e confirmar comportamento audível em canal apropriado. |
| Voz → interpretação → mesa → feedback | Fluxo local primeiro; LLM opcional; resposta descreve o resultado conhecido. | [ ] Pedido claro chega ao controle correto; [ ] pedido ambíguo pergunta; [ ] falha não é apresentada como sucesso. | Executar frases representativas, avaliar entendimento e ouvir a resposta. |
| Voz → proposta → revisão no terminal → cadastro | Preservar frase, origem e estado; validar campos e autorização antes de confirmar vínculos. | [ ] Cadastro proposto pode ser corrigido, confirmado ou rejeitado; [ ] após reinício, estado confirmado é recuperado e pendências não são tomadas como confirmação. | Ditar um vínculo de integrante, microfone e retorno e verificar o cadastro com outro usuário autorizado. |
| Holyrics → evento → serviço de som | Associação de identificadores e política por vínculo; integração opcional. | [ ] Gatilho observado no momento testado; [ ] modo informativo não altera a mesa; [ ] indisponibilidade de um lado não derruba o outro. | Preparar uma música e gatilho de teste nos equipamentos. |
| Inicialização Windows → serviço → áudio/mesa | Contexto de execução e recuperação de processos explicitados. | [ ] Serviço inicia no cenário decidido; [ ] dispositivo e mesa são reencontrados após disponibilidade; [ ] terminal reporta falhas. | Reiniciar o computador e ligar a mesa depois. |

Os fluxos com serviço, comandos, conexão WebSocket simulada e transcrição textual restrita já têm testes parciais registrados; as caixas desta tabela continuam abertas para o aceite integrado com os componentes e equipamentos indicados.

### Interface web e voz pelo navegador — melhoria posterior

- [ ] Criar painel de configuração e revisão que use as mesmas regras do serviço, incluindo IP, estado e propostas ditadas; permitir corrigir, confirmar ou rejeitar cadastros.
- [ ] Definir autenticação, permissões e proteção da conexão antes de permitir acesso pela rede local a celulares e tablets; validar firewall e isolamento da rede.
- [ ] Avaliar captura de áudio no navegador com acionamento explícito e envio ao computador para transcrição; testar HTTPS/contexto seguro, permissões, identificação da conversa, concorrência e falhas de rede.

**Aceite posterior:** usuário autorizado acessa o painel e revisa uma proposta; acesso indevido é negado; caso a voz pelo navegador seja implementada, áudio de teste chega ao Whisper e erros são mostrados sem reenvio inesperado. **Depende do usuário:** testar com celulares/tablets reais, rede local e permissões definidas.

## Decisões pendentes prioritárias

| Decisão | O que precisamos saber |
| --- | --- |
| Inicialização no Windows | Entrada automática no desktop é suficiente ou precisa funcionar antes de qualquer login? O áudio funciona no contexto escolhido? |
| Áudio multicanal | Driver/API expõem os canais necessários? Qual é o mapeamento efetivo e o comportamento em mute? |
| Latência aceitável | Quanto tempo após o fim da fala é confortável em passagem e durante o culto? |
| Capacidades da mesa | O que a biblioteca e o firmware permitem ler, alterar e confirmar? |
| Modo após reinício | Restaurar o modo anterior ou aguardar escolha no painel? |
| LLM | Local, API ou plano elegível; custos, privacidade e funcionamento offline. |
| Acesso ao painel | Quais usuários precisam configurar o sistema e se usarão o computador local ou outros dispositivos na rede? |

## Retomada em outro computador

Este plano e a arquitetura ficam no repositório para que outra sessão consiga retomá-los. Antes de trocar de computador, revisar e enviar as alterações desejadas ao GitHub; na outra máquina, clonar o repositório ou atualizar a cópia existente e abrir o projeto. Consultar `AGENTS.md`, a arquitetura, este plano e o estado do Git antes de continuar. Arquivos não versionados ou alterações ainda não enviadas não aparecem automaticamente na outra máquina.

Ao concluir uma medição ou teste, registrar no histórico abaixo a data, o ambiente, o resultado, o que faltou e a referência para evidências armazenadas de forma apropriada. Evitar incluir credenciais, chaves ou informações sensíveis no repositório público. Dados locais e gravações de áudio não são sincronizados automaticamente com o Git.

## Registro de execução

| Data | Situação | Evidência ou próximo passo |
| --- | --- | --- |
| 16/11/2026 | Planejamento iniciado; protótipo de voz e comando na mesa validado pelo usuário. | Iniciar fase 0; levantar medições e capacidades no equipamento real. |
| 16/11/2026 | Base de qualidade em andamento. | ESLint e testes Node passaram; pytest e Ruff passaram com áudio/modelo simulados. Workflow de CI criado, ainda não executado no GitHub. Whisper real e mesa física não foram testados nesta alteração. |
| 16/11/2026 | Simuladores em memória e WebSocket implementados e testados localmente. | Biblioteca 7.0.3, um canal WebSocket com mute e fader, comando inválido e queda simulada; loopback exigiu execução fora do sandbox. Reconexão, CI e fidelidade com a mesa física pendentes. |
| 16/11/2026 | Terminal interativo do simulador e servidor para 24 canais implementados. | Testes Node, ESLint, pytest e Ruff passaram; aplicativo em modo texto enviou mute ao canal 3 simulado, observado no terminal. Fechar os dois processos simultaneamente gerou aviso da biblioteca na saída; encerrar primeiro o aplicativo. Nenhum teste com mesa física. |
| 16/11/2026 | Worker de voz persistente implementado. | Testes Node e Python simulados, inclusive comunicação entre processos reais Node e Python com modelo/áudio falsos; Whisper real, microfone e mesa não foram testados. `--descrever` informa tempos; medição real permanece pendente. |
| 16/11/2026 | Configuração persistente, reconexão e procedimento de medição implementados. | IP e falhas testados em arquivos temporários; biblioteca real testada com WebSocket simulado, incluindo início offline, quedas e ausência de reenvio. Medições e conexão com mesa real pendentes. Auditoria estática da biblioteca em [capacidades](capacidades-biblioteca.md). |
| 16/11/2026 | Fim por silêncio experimental implementado. | Fluxos de áudio, tempo limite e encerramento testados com fakes; o modo fixo permanece padrão. Comportamento com microfone, música e Whisper reais pendente. |
| 17/11/2026 | Cadastros, backup, serviço local e bases de voz e LLM ampliados. | 114 testes Node passaram com loopback simulado; 14 testes Python, ESLint e Ruff passaram. Cadastro e backup usam bancos temporários; Gemini e Agendador foram simulados. Nenhum teste novo com mesa, áudio, Whisper, provedor ou reinicialização reais. Serviço não opera a mesa nem captura áudio. |
| 17/11/2026 | Auditoria técnica concluída; melhorias propostas, sem correção de código. | [Relatório](analise-tecnica-2026-11-17.md): suíte Node/Python e linters aprovados; reproduções adicionais encontraram problemas no CLI, conversas, validação do backup e diagnóstico. Voz padrão falha no `.venv` atual por dependências ausentes. Validação física, provedor e reinício continuam pendentes; alterações locais anteriores preservadas. |
| 17/11/2026 | Fluxo integrado em memória, diagnóstico de voz e matriz de CI ampliada. | `npm test` 128/128 e ESLint aprovados; pytest 16/16 e Ruff check/format aprovados em Windows com Python 3.14 e dependências simuladas; `git diff --check` aprovado com avisos de CRLF. Naquela rodada o fluxo ainda não estava ligado ao serviço, e não houve testes de Python 3.12, microfone, modelo, provedor ou mesa reais. |
| 17/11/2026 | Serviço integrado a comando e voz manual, configuração e backup de voz. | Suíte `npm test` 152/152 e ESLint aprovados; mais dois testes direcionados de configuração do worker aprovados. Pytest 16/16 e Ruff aprovados em Python 3.14 com simulações; integração com biblioteca real e mesa WebSocket simulada passou fora do sandbox. Python 3.12 isolado passou em diagnóstico de importações e `pip check`. Não houve teste com modelo, áudio, mesa, provedor ou reinício reais; CI remoto não verificado. |
| 17/11/2026 | Segurança da troca de IP e encerramento concorrente. | `npm test` 159/159 e ESLint aprovados; `git diff --check` aprovado com avisos de CRLF. Testes simulados verificam IP alterado ou inválido, bloqueio antes da gravação oficial, abandono e encerramento durante leitura. Reconexão com mesa real, sincronização de estado e edições externas concorrentes continuam com limitações documentadas. |
| 17/11/2026 | Observação parcial após reconexão. | `npm test` 161/161 e ESLint aprovados; `git diff --check` aprovado com avisos de CRLF. Biblioteca real conectada a peer simulado: apenas dados recebidos na conexão atual são exibidos e a queda limpa valores antigos. Nenhum teste físico de completude, confirmação ou reconexão na Ui24R. |
| 17/11/2026 | Ambiente Python 3.12 e verificações de desenvolvimento preparados. | `.venv/voice312` usa Python 3.12.14 do runtime do Codex; dependências de áudio e desenvolvimento instaladas. Diagnóstico de importações, `pip check`, pytest 16/16 e Ruff check/format passaram. Testes continuam usando áudio/modelo simulados; o runtime do Codex não é instalação definitiva do Python e modelo/microfone reais não foram testados. |
| 17/11/2026 | Política simulada de destino da resposta falada. | Três testes Node, ESLint e `git diff --check` passaram; sem integração ao serviço, áudio ou mesa. Falta validar vínculos, limites e capacidade física antes da reprodução. |
| 17/11/2026 | Fila de respostas em simulação. | `npm test` 170/170, ESLint e `git diff --check` aprovados (avisos de CRLF); seis testes específicos cobrem ordem, mudança de modo/vínculo, falha, cancelamento, parada e limite. A fila não reproduz áudio nem controla a mesa ou se integra ao serviço; validação física permanece pendente. |
| 17/11/2026 | Cadastro de AUX e vínculos de retorno. | `npm test` 175/175, ESLint e `git diff --check` aprovados (avisos de CRLF). Testes com bancos temporários cobrem migração concorrente, conflitos, histórico, CLI e restauração de backup legado e novo. Não houve acesso à mesa; dados reais, estéreo e integração com fila de áudio seguem pendentes. |
| 17/11/2026 | Quantidade de AUX configurável e diagramas consolidados. | `npm test` 181/181 e ESLint aprovados; `git diff --check` aprovado com avisos de CRLF. Testes cobrem configuração maior que oito, migração e restauração de backups anteriores, concorrência e rollback. [Diagramas](diagramas.md) distinguem modelo persistido e conceitos futuros; hardware e capacidade real não foram testados. |
| 17/11/2026 | Cadastro de caminhos e propostas a partir de transcrição simulada. | `npm test` 199/199 e ESLint aprovados; `git diff --check` aprovado com avisos de CRLF. Caminhos de entrada/retorno, patch explícito, conflitos concorrentes, ambiguidades, revisão, persistência em outro processo e backup foram exercitados com dados temporários; mesa, patch, voz e LLM reais não foram testados. |
| 17/11/2026 | Contrato inicial de seleção de LLM. | Cinco testes específicos e `npm test` 204/204 passaram; ESLint e `git diff --check` aprovados com avisos de CRLF. Gemini foi exercitado com transporte falso; OpenAI e Anthropic apenas com adaptadores falsos. O seletor não está integrado ao serviço nem ao painel, e não houve chamadas externas. |
| 17/11/2026 | Regras de fonte de verdade e plano reconciliados. | Resumo, fases, tabelas e pendências revisados com base no código e nas evidências já registradas. `git diff --check` aprovado com avisos de CRLF. Nenhum teste automatizado, físico ou com provedor foi executado nesta revisão documental. |
| 17/11/2026 | Documentação reconciliada e leitura do backup limitada. | `npm test` 206/206 e ESLint aprovados; testes incluem recusa de arquivo grande preservando destino e peer WebSocket silencioso. Restauração, observação e reconexão testadas com dados e mesa simulados. Nenhum teste de áudio, mesa, Agendador ou provedor real nesta rodada; recuperação do serviço e integração de LLM permanecem pendentes. |
| 17/11/2026 | Critérios e verificação da documentação implementados. | `npm test` 208/208, `npm run lint` e `npm run docs:check` aprovados localmente. Workflow atualizado; execução no GitHub não verificada. Verificação cobre campos e destinos locais de links inline, não significado, âncoras ou referências HTML. Nenhum teste físico ou provedor real nesta rodada. |

## Integração de modos e permissões — validação parcial

Fase 3: integrar passagem, culto e pausa ao serviço e terminal; persistir entradas e master, iniciar pausado até decisão sobre retomada, invalidar pedidos diante de mudanças e validar com serviço e voz simulados. A configuração de origem não comprova identidade; equipamentos e reinício reais permanecem pendentes. Contrato: [política de modos](especificacoes/politica-modos.md).

- [x] Implementar configuração persistente de entradas e master, seleção de modo pelo serviço e terminal, e invalidação de pedidos ao alterar as regras. Início permanece pausado; os modos não modificam áudio na mesa. Backup v3 inclui a configuração e lê v1/v2.
- [x] Confirmar integração HTTP e terminal com o novo fluxo usando dependências simuladas. A tentativa inicial no sandbox falhou por EACCES; execução posterior fora do sandbox passou. Testes físicos de áudio, mesa e reinício seguem pendentes.

**Evidência histórica:** 24 testes Node sem loopback passaram, cobrindo política, fluxo, persistência e backup; teste separado de backup dos modos e recusa de configuração inválida também passou. Naquela entrega a captura era limitada à entrada principal; a evolução posterior suporta outras entradas identificadas.

## Múltiplas entradas e conversas — validação parcial

Fase 3: vínculo persistente entre entrada e fonte de sessão; conversas e propostas independentes por origem; bloqueio de propostas obsoletas sobre o mesmo controle e captura identificada. Critérios em [múltiplas entradas](especificacoes/multiplas-entradas.md); testes simulados não substituem equipamento real.

O serviço permite seleção explícita de sessão, revalida vínculo e bloqueia propostas após remoção/recriação; entrada não estabelece identidade do falante. Até quatro workers podem ser iniciados manualmente com dispositivos e canais configurados; alterações de configuração exigem reinício e cada worker carrega seu modelo. O status informa estado e erros por entrada sem iniciar captura. Testes de armazenamento, backup (formatos 1 a 4), fluxo concorrente, provedor falso, workers e HTTP simulados passaram. Nenhuma captura real, mesa, reinício ou desempenho com múltiplos dispositivos foi validado.

## Substituição de fonte com referências revisadas — validação automatizada

Fase 4: acrescentar variante de substituição que verifica atomicamente vínculo, entradas e referências selecionadas, preservando o comando anterior e integrando confirmação explícita no CMD. Sem migração ou alteração de backup. Corrigir a descrição divergente do menu sobre correção de propostas.

- [x] Implementar variante e integração, preservando histórico, retirada, desvinculação e proposta pendente; recusa não grava parcialmente.
- [x] Testar com bancos temporários e duas conexões alterações e remoções de referências, vínculo e entradas, sessão e revisões inválidas, rollback, cancelamento e recarga; verificar compatibilidade legada e backup, suíte compartilhada, lint e documentação.

**Evidências em 20/11/2026:** oito testes específicos passaram, incluindo restauração após substituição, corrida por outra conexão e falha após inserção revertida. A suíte Node passou 370/370; ESLint e verificação documental passaram. O teste anterior que injetava corrida pelo nome do comando legado foi ajustado para a nova variante e passou na suíte. Os testes usam bancos temporários e serviços simulados; CI remoto, mesa e passagem física não foram executados. Revisões são tokens de conteúdo, não autenticação nem prova física, e não detectam mudanças revertidas aos mesmos valores.

## Correção transacional das referências selecionadas — validação automatizada

Fase 4: adicionar variante explícita de correção de fonte e voz que exige revisão da proposta e de pessoa e equipamento selecionados, verificadas na transação SQLite; voz aceita referência desconhecida com marcador explícito. Preservar comandos anteriores, confirmação e estados; integrar ao CMD. Sem migração ou mudança de backup. Validar sucesso, alterações e remoções por outra conexão, proposta e sessão incorretas, revisões inválidas, rollback, compatibilidade, cancelamento e atualização da tela. Executar testes pertinentes, suíte compartilhada, lint e verificação documental; diferenciar simulação e equipamento físico.

- [x] Implementar variante e integrar aos dois fluxos CMD, preservando os caminhos anteriores e o estado pendente.
- [x] Validar com bancos temporários e duas conexões sucesso, desconhecidos, alteração e remoção, revisão antiga ou inválida, sessão incorreta, recusa sem gravação parcial, cancelamento e recarga da tela; compatibilidade e confirmação existentes cobertas pela suíte.

**Evidências históricas em 20/11/2026:** 12 testes específicos passaram; suíte compartilhada Node 362/362, ESLint e verificação documental passaram. Depois, 45 testes do menu passaram com novas verificações da atualização da tela. Serviços e mesa foram simulados, sem equipamento físico, áudio real ou chamadas pagas; CI remoto não foi executado. Revisões são tokens de conteúdo e não detectam alterações revertidas, autenticam ou comprovam patch físico. Naquela entrega substituição de fonte confirmada e confirmação mantinham seus limites anteriores; a substituição evoluiu na seção acima.

## Passagem guiada pelo terminal

### Captura para revisão de cadastros — implementação com simulação

Fase 4: integrar captura manual de entrada autorizada e sessão ativa à análise restrita de propostas de vínculo. A operação é separada dos comandos da mesa, preserva frase e origem, cria somente proposta revisável pelo terminal e não executa ações. Revalidar sessão, origem, modo, conexão, cancelamento e abandono após transcrição, antes de persistir. Testes simulados devem cobrir ambiguidades, dados ausentes, conflitos, correção/confirmação/rejeição, quedas e resultados tardios; captura real e patch físico permanecem pendentes. Contrato em [captura para cadastro](especificacoes/captura-cadastro.md).

Implementada a captura explícita `voz-cadastro` com sessão ativa, entrada autorizada e vínculo de origem, sem LLM nem comandos de mesa. Parser aceita variações restritas e esclarece ambiguidades; propostas são revistas pela passagem. Testes de parser 8/8 e HTTP ampliado 1/1 fora do sandbox abrangem proposta, conflito, cadastro ausente, ambiguidades, confirmação, correção e rejeição; pausa, queda e troca de sessão descartam transcrição tardia. `pytest tests/test_transcribe.py` passou 15/15 com áudio e modelo falsos, incluindo processamento até o parser; Ruff e verificação documental passaram. Validação com microfone, Whisper e mesa reais permanece pendente. A suíte consolidada deve ser registrada após execução.

Revisão adicional: a inserção revalida o vínculo de entrada na mesma transação SQLite; troca entre duas conexões foi recusada sem proposta. Abandono durante captura também foi testado pelo HTTP. Se o cliente se desconectar após o servidor concluir o envio, não há garantia de recebimento; eventual falha de limpeza do banco pode deixar uma proposta pendente, que nunca é confirmada automaticamente.

A limpeza de proposta não entregue confere a revisão original na mesma transação e preserva alterações concorrentes em proposta pendente, conforme teste com duas conexões. A revisão baseada em conteúdo não detecta edição que volte exatamente ao estado original.

**Fase 4:** apresentar os cadastros e vínculos da sessão e orientar sua revisão pelo terminal; correções globais possuem histórico e substituir vínculo confirmado retira o anterior e cria proposta pendente. Escopo, comandos e critérios em [passagem guiada](especificacoes/passagem-guiada.md). Correção, confirmação, conflitos, isolamento entre sessões e persistência foram testados com bancos temporários; a conferência e a passagem física continuam pendentes.

- [x] Exigir revisão da proposta mostrada para confirmação guiada e verificar atomicamente no banco que os dados não mudaram; teste com outra instância entre consulta e confirmação recusou a operação. Comando e documentação atualizados; 25 testes de passagem, cadastro e concorrência passaram. A revisão não cobre alterações em objetos relacionados ou patch físico.

- [x] Implementar e testar a revisão guiada, mantendo a distinção entre confirmação no cadastro e constatação física. `node --test test/soundcheck-cli.test.js test/registry-cli.test.js test/physical-registry-cli.test.js`: 9/9 testes com bancos temporários; ESLint direcionado aprovado. Sessão, correção e confirmação de propostas, isolamento, conflitos e persistência foram exercitados; nenhuma mesa ou passagem física foi testada. Vínculos simples ainda não têm rejeição; sua proposta pode ser corrigida. A confirmação no banco não comprova o patch ou o áudio.

## Recuperação de serviço e áudio — validação simulada

**Fase 2:** melhorar recuperação e observação sem replay conforme [contrato](especificacoes/recuperacao-servico.md). Após queda, estado só é conhecido por recepção na conexão atual; captura de áudio segue manual e deve recusar mudança ou ausência de descrição do dispositivo até reinício explícito. A API de áudio não fornece identidade física única; não presumir que descrições iguais garantem ser o mesmo dispositivo.

- [x] Implementar verificações de identidade disponível e recuperação explícita do worker, com testes de mudanças, ausência e respostas tardias. A comparação de metadados não estabelece identidade física única; referência reinicia com o serviço.
- [x] Validar queda/reconexão silenciosa ou parcial sem usar estado antigo nem repetir operação, em servidor e serviço simulados.
- [x] Executar verificações apropriadas e reconciliar especificações; driver, equipamento e reinício reais permanecem pendentes.

**Evidências:** 2 testes HTTP com loopback fora do sandbox e 20 testes Node direcionados passaram após reforço do aceite, incluindo alteração concorrente da candidata e recusa de revisão antiga. Pytest 21/21, Ruff e ESLint direcionado passaram com áudio/mesa/workers simulados; nenhuma captura, mesa ou teste de USB reais foi realizado.

## Escala de fader de entrada — validação parcial

**Fases:** 2 e 4. Implementar escala provisória 0–100 para fader de entrada, valores absolutos e relativos, conforme [contrato](especificacoes/escala-fader.md). Preservar a sintaxe em dB e confirmação; testar limites, curva da biblioteca, observação atual e invalidação antes da execução com mesa simulada. Curva, limite e resultado físico requerem validação com a Ui24R.

- [x] Integrar conversão, revisão e confirmação de valores absolutos e relativos, recusando estado ausente, expirado ou alterado; o fluxo usa apenas fader de entrada e a última observação, sem provar ausência de alteração externa não recebida.
- [x] Executar teste HTTP/terminal com estado simulado; execução posterior fora do sandbox passou.
- [ ] Validar fisicamente a curva, limites e aplicação na Ui24R.

**Evidência:** 30 testes direcionados de escala, orquestração, validação e observação passaram com dependências simuladas; não houve mesa física. Zero sem unidade no serviço gera esclarecimento por ambiguidade; o fluxo legado independente mantém o significado anterior em dB.


## Configuração persistente e limites da LLM — validação simulada

**Fase 5:** persistir seleção, modelo e limite diário global obrigatório sem chaves ou consentimento, com reserva atômica antes do transporte, falha fechada para relógio retrocedido e sem devolução após falhas. Incluir configuração e contagem no backup, e exigir reconhecimento explícito após restauração porque o histórico pode ter retrocedido. O limite de tentativas não é limite de gastos ou tokens. Critérios em [configuração e limites](especificacoes/llm-configuracao-limites.md); usar transporte simulado.

- [x] Implementar persistência, administração e limite de tentativas, com testes de esgotamento, concorrência, reinício e falhas.
- [x] Integrar Gemini, OpenAI e Anthropic ao contrato e terminal, mantendo consentimento e validação determinística.
- [x] Preservar backup sem segredos e compatibilidade antiga, incluindo proteção após restauração; validar com dados temporários.

**Evidências:** 42 testes Node direcionados passaram com transporte simulado, cobrindo cinco processos concorrentes, relógio retrocedido, cota consumida em falha, troca externa antes da confirmação e backup legado com bloqueio após restauração. Dez testes HTTP fora do sandbox validaram serviço/terminal, os provedores falsos, confirmação e limite persistente. ESLint direcionado e verificação documental passaram. Não foram usados provedores ou mesa reais; limite de tentativas não é orçamento financeiro.

Após auditoria de credenciais, 11 testes Node de LLM/estado passaram: para os três provedores, chave ausente ou removida bloqueia antes de reservar tentativa e não chama transporte; presença é apenas indicada por booleano sem demonstrar validade da chave.

## Integração opcional de LLM ao serviço — validação simulada

**Histórico da fase 5:** a primeira integração de Gemini usava escolha em memória e consentimento por pedido, sem persistir segredos; depois evoluiu para configuração persistente e limite de tentativas. A [especificação de integração](especificacoes/llm-servico.md) registra critérios e testes. Chamadas reais e orçamento financeiro permanecem pendentes.

- [x] Implementar seleção e interpretação no serviço e terminal, revalidar autorização e conexão no envio e testar cancelamento e falhas, incluindo HTTP com provedor falso. Chamadas reais e orçamento seguem pendentes.

## Correção revisada de cadastros e vínculos confirmados

**Fase 4:** permitir corrigir pessoas e equipamentos com histórico e revisão concorrente; substituir vínculo de fonte confirmado somente mediante retirada explícita, preservação de histórico, desvinculação de entradas e criação de proposta pendente, conforme [passagem guiada](especificacoes/passagem-guiada.md). Migrar esquema e preservar backup compatível. Testar persistência, conflito, concorrência, rollback e restauração em bancos temporários; não envolve confirmação física.

**Revisão adicional concluída:** entradas a desvincular são apresentadas com token de substituição que cobre vínculo e associações; mudança concorrente da lista é recusada na transação sem alterações. A passagem e o README advertem que correções de pessoa ou equipamento afetam cadastros globais e podem atingir outras sessões. Testes direcionados de passagem, fontes e backup: 20/20; ESLint direcionado e verificação documental passaram.

- [x] Implementar correções transacionais, revisão explícita e histórico com migração e testes. Testes direcionados com SQLite temporário cobriram revisão concorrente, erro sem alteração, retirada e desvinculação, nova confirmação, migração v5 e backup/restauração; nenhuma mesa ou passagem física foi testada.

## Adaptador OpenAI — histórico da implementação inicial

Fase 5: desenvolver adaptador da Responses API com modelo explicitamente escolhido, consentimento por pedido, credencial no ambiente, JSON estruturado, timeout e falhas fechadas, conforme [especificação](especificacoes/openai.md). Testes usarão transporte falso; integração, cotas e teste com provedor real são atividades separadas.

- [x] Implementar e testar contrato, sigilo, recusas, respostas incompletas e falhas sem chamadas externas: 5/5 testes com transporte falso; ESLint direcionado e verificação documental aprovados. Posteriormente integrado ao serviço; orçamento e validação real permanecem pendentes.

## Adaptador Anthropic — histórico da implementação inicial

Fase 5: desenvolver adaptador da API Messages com modelo escolhido explicitamente, consentimento, segredo no ambiente, saída estruturada e limites de falha conforme [especificação](especificacoes/anthropic.md). Testes usam transporte falso; integração ao serviço e teste real são entregas separadas.

- [x] Implementar e testar contrato, sigilo, recusas, truncamento e falhas sem chamadas externas. Quatro testes com transporte falso passaram, incluindo timeout e seletor; ESLint direcionado e verificação documental passaram. Posteriormente integrado ao serviço; provedor real permanece pendente.

## Equipes e formação da sessão — validação simulada

Fase 4: implementar grupos, membros, papéis habituais e formação por sessão; expor contexto no terminal, passagem e serviço sem identificar automaticamente o falante ou conceder permissões por função. Migrar SQLite e preservar backups antigos; testar conflitos, alterações concorrentes e invalidação de propostas após mudança de formação, com dependências simuladas. Ver [equipes e sessões](especificacoes/equipes-sessoes.md). Validação com equipe e equipamento reais permanece pendente.

Implementação com SQLite v7 e terminal disponível; testes direcionados de equipes, migração, restauração e revisão concorrente passaram com bancos temporários. A primeira suíte completa teve 271/273 aprovados: duas expectativas de versão anteriores foram atualizadas para v7; a repetição passou 276/276. A formação registrada não identifica o falante nem comprova presença ou ligação física.

## Fila de respostas no serviço — validação simulada

Integrar a fila e a política simuladas ao serviço local e ao terminal autenticado, conforme [respostas individuais](especificacoes/respostas-individuais.md). Exigir destinatário explícito e indicar que disponibilidade e roteamento são simulados. Cobrir ordenação, alteração de modo, desconexão, cancelamento e falhas sem tocar no áudio ou na mesa; a reprodução real continua pendente.

Implementado e testado: seis testes de fila e um teste HTTP com CLI passaram, cobrindo política de culto, serialização, falha, cancelamento e desconexão sem chamada à mesa. ESLint aprovado. A configuração dos destinos é simulada e não comprova isolamento físico nem disponibilidade dos retornos.

## Painel web local inicial — validação parcial

Implementar no serviço local um painel para consultar conexão, sessões, cadastros e propostas e revisar propostas, usando a mesma autorização e validação do terminal. A [especificação](especificacoes/painel-local.md) define a capacidade local e as restrições de acesso; sem publicação ou acesso pela rede. Validar respostas HTTP, autenticação, origem, consulta e revisão com dependências simuladas, além de interação no navegador quando disponível.

Arquivos locais, consulta e revisão implementados; testes HTTP e DOM simulado passaram. A automação de navegador não respondeu nesta sessão: apresentação visual, fluxo em navegador real e tela pequena não foram verificados. O painel não expõe controle direto da mesa nem acesso por rede.
