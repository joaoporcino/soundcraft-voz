# Controle de execução

Este documento acompanha as entregas do projeto. A [arquitetura](arquitetura.md) reúne decisões e propostas técnicas; este plano registra o que falta implementar e como validar cada etapa. Não há prazos ou responsáveis definidos ainda.

Para acompanhar o que depende de você, consulte [suas pendências](suas-pendencias.md).

Última revisão: 16/11/2026.

## Estado atual

**Protótipo validado pelo usuário:** captura de voz, transcrição e execução de comandos diretamente na Ui24R. A validação relatada comprova o fluxo experimentado, mas não estabelece desempenho, cobertura ou confiabilidade em todos os cenários.

**Existente no código:** interface por terminal, modo simulado e texto, conexão por IP, mute e fader de canais de entrada no mix principal, seleção de entrada de áudio e testes do interpretador. O Python e o modelo são iniciados a cada gravação de cinco segundos.

**Ainda não implementado como produto:** serviço em segundo plano, painel web, reconexão automática contínua, múltiplas conversas, cadastro de equipes, LLM e integração com Holyrics.

**Prioridade de interface:** terminal inicialmente; painel web, acesso por celulares/tablets e captura de voz no navegador são melhorias posteriores. As referências a painel nas tabelas descrevem essa interface futura; nas fases iniciais, o terminal deve permitir configuração, consulta e revisão equivalentes às funcionalidades já implementadas. Serviço e terminal administrativo devem ter um meio de comunicação a definir, pois o serviço pode iniciar sem sessão interativa.

## Como usar este controle

- `[ ]` pendente; `[x]` concluído e validado conforme descrito. Usar **Em andamento** ou **Bloqueado**, com motivo, no registro ao final quando necessário.
- Marcar tarefas somente após registrar a evidência e, quando envolver equipamento, as condições do teste. Separar testes simulados de testes com a mesa.
- Rever prioridades e critérios ao final de cada etapa. As próximas fases são hipóteses de planejamento, não uma promessa de implementação automática.
- Registrar decisões e mudanças de desenho na [arquitetura](arquitetura.md); registrar execução e resultados aqui ou em arquivos de evidência vinculados.
- Manter [suas pendências](suas-pendencias.md) coerente com decisões e testes que dependam do usuário; concluir itens apenas após confirmação ou evidência correspondente.
- Para funcionalidades relevantes, consultar ou criar uma especificação em `docs/especificacoes/` antes da implementação; mudanças pequenas podem ter escopo e validação registrados diretamente neste plano.

## Fase inicial — Base de qualidade

**Objetivo:** permitir que mudanças futuras sejam verificadas de forma repetível antes de ampliar a arquitetura.

- [ ] Manter os testes Node existentes com `node:test` e configurar ESLint para o código do projeto.
- [ ] Configurar pytest e Ruff para o Python, com comandos documentados e dependências de desenvolvimento separadas quando apropriado.
- [ ] Criar verificações de integração e fluxo simuladas conforme os componentes forem implementados; sem exigir mesa, microfone, Holyrics ou credenciais.
- [ ] Configurar GitHub Actions para executar lint e testes disponíveis em alterações; manter testes com hardware e chamadas pagas explícitos e separados.
- [ ] Preparar formato de casos para avaliação de voz e LLM, incluindo resultados esperados e ações proibidas, preservando privacidade dos áudios.
- [ ] Depois de estabilizar os comandos locais e o CI, avaliar hook Git local opcional para verificações rápidas, com instruções de instalação e sem hardware ou chamadas pagas.

**Concluída quando:** comandos locais e pipeline executarem as verificações configuradas com resultados reproduzíveis, documentação atualizada e limitações conhecidas. A validação com a mesa continua em etapa própria.

## Fase 0 — Medição e viabilidade

**Objetivo:** conhecer o atraso atual e confirmar o acesso ao áudio e aos controles necessários antes de expandir o sistema.

- [ ] Registrar modelo do computador, Windows, firmware da mesa, driver e ligação de áudio usados nos testes.
- [ ] Medir carregamento do modelo, gravação, transcrição e tempo até envio, com frases repetíveis; separar o primeiro pedido dos seguintes.
- [ ] Listar dispositivos e APIs de áudio disponíveis e confirmar a quantidade de canais da Ui24R acessíveis pelo Python.
- [ ] Conferir o mapeamento USB com uma fonte conhecida, testar duas entradas e verificar áudio com o canal mutado.
- [ ] Levantar, por recurso da biblioteca, se é possível ler, alterar, receber mudanças externas e confirmar o resultado: canais, auxiliares, grupos de mute, roteamento, snapshots e cues.
- [ ] Verificar se o Windows entra automaticamente em uma sessão de usuário e testar acesso ao áudio no contexto de inicialização pretendido.
- [ ] Verificar se identificadores de dispositivos mudam após reinício ou reconexão e como identificar a Ui24R com segurança, sem presumir que o índice permaneça fixo.

**Concluída quando:** resultados e limitações estiverem registrados, incluindo evidência da mesa física ou indicação explícita do que ainda não pôde ser testado. A ausência de uma capacidade deve gerar uma decisão de alternativa ou adiamento.

## Fase 1 — Voz mais responsiva

**Objetivo:** reduzir a espera mantendo um único fluxo de voz simples e reproduzível.

Especificação inicial: [processo de voz persistente](especificacoes/voz-persistente.md). Seus critérios ainda estão pendentes de implementação e validação.

- [ ] Manter o processo Python e o modelo carregados entre comandos; definir mensagens locais e tratamento de falha e reinício.
- [ ] Medir e comparar o comportamento com o protótipo anterior.
- [ ] Experimentar captura contínua e detecção de início/fim de fala, mantendo alternativa de ativação manual.
- [ ] Comparar modelos e configurações com as mesmas frases em português, inclusive nomes, números e música ao fundo.
- [ ] Registrar tempo desde o fim da fala até transcrição e envio; registrar erros, CPU e memória.

**Concluída quando:** uma entrada consegue executar pedidos repetidos sem recarregar o modelo, os erros são reportados e há medições comparáveis. O limite aceitável de latência e acerto será definido após o teste real.

## Fase 2 — Aplicação local e conexão

**Objetivo:** disponibilizar serviço Node.js em segundo plano e configuração e consulta pelo terminal.

- [ ] Criar comandos de terminal para configurar IP, consultar estado e administrar o serviço em segundo plano.
- [ ] Permitir revisão e configuração das preferências implementadas pelo terminal; planejar interface web e acesso por outros dispositivos para etapa posterior.
- [ ] Persistir configurações e recuperá-las após reinício; avaliar SQLite conforme a arquitetura.
- [ ] Reconectar enquanto a aplicação estiver ativa, inclusive quando a mesa ligar depois do computador.
- [ ] Sincronizar estado após reconexão quando suportado; não executar automaticamente pedidos antigos feitos offline.
- [ ] Implementar inicialização no Windows pela opção aprovada após a fase 0, sem janela de terminal, e reportar falhas do processo de áudio.
- [ ] Proteger a API local e definir explicitamente qualquer acesso de outros dispositivos antes de habilitá-lo.
- [ ] Definir locais de instalação, dados, configurações e modelo Whisper; preservar dados ao atualizar o aplicativo.
- [ ] Testar reconexão do áudio USB quando o dispositivo for removido, religado ou disponibilizado depois do serviço.
- [ ] Implementar ou planejar exportação e restauração dos cadastros e configurações do aplicativo, separadas dos snapshots e shows da mesa.

**Concluída quando:** reiniciar o computador, consultar o serviço pelo terminal, ligar a mesa depois e observar conexão e estado corretos, com configurações preservadas. Validar também queda e retorno de conexão; o painel web não é requisito desta fase.

## Fase 3 — Voz por múltiplas entradas e modos

**Objetivo:** operar com mais de um microfone e controlar quais origens podem enviar comandos.

- [ ] Selecionar entradas e associá-las às fontes da sessão; evitar presumir identidade apenas pela entrada.
- [ ] Isolar conversas simultâneas e tratar pedidos concorrentes sobre o mesmo controle.
- [ ] Implementar e testar ativação por “mesa”, fim por silêncio, esclarecimento e cancelamento.
- [ ] Configurar microfone master e modos passagem, culto e escuta pausada pelo terminal inicialmente.
- [ ] Definir autorizações de transição e comportamento após reinício; encerrar ou pausar pedidos de entradas desabilitadas.
- [ ] Medir atrasos, perda de comandos e ativações falsas com música, sobreposição e falas captadas em mais de uma entrada.

**Concluída quando:** os modos restringirem comandos conforme configurado sem mutar o áudio da mesa, e os cenários de origem, concorrência e recuperação tiverem sido testados.

## Fase 4 — Sessão, equipe e retornos

**Objetivo:** usar contexto da sessão para pedidos compreensíveis por integrantes.

- [ ] Cadastrar integrantes, grupos, papéis, equipamentos, fontes e vínculos de sessão.
- [ ] Cadastrar tipos de fonte e equipamentos, características independentes, marca/modelo opcionais e caminhos diretos ou por medusa; distinguir entrada física de patch e canal.
- [ ] Representar saídas auxiliares, vias da medusa e reguladores de retorno individuais; tratar identificação por cor como potencialmente ambígua.
- [ ] Representar auxiliares, envios e retornos compartilhados; validar as operações realmente suportadas.
- [ ] Permitir ajustes em escala de 0 a 100, distinguindo valor absoluto de alteração relativa e testando a conversão.
- [ ] Implementar passagem guiada e confirmação de vínculos, com edição manual no terminal inicialmente.
- [ ] Mostrar propostas de cadastro por voz no terminal para revisão, correção, confirmação ou rejeição, com origem e resultado; não usar vínculos pendentes como confirmados. Levar o fluxo ao painel em fase posterior.
- [ ] Identificar vínculos físicos e patches não confirmados ou possivelmente desatualizados; apresentar conflitos de uso de microfone, entrada ou canal para revisão, sem substituição silenciosa.
- [ ] Disponibilizar resposta falada e testar destino de áudio e prevenção de captação da própria resposta.

**Concluída quando:** uma sessão com pelo menos duas fontes e um retorno compartilhado puder ser configurada, consultada e testada com a mesa; pedidos ambíguos devem gerar esclarecimento.

## Fase 5 — LLM, ferramentas e apresentação

**Objetivo:** interpretar pedidos mais livres e integrar programação sem prender os sistemas entre si.

- [ ] Definir provedor, autenticação, limites de custo, dados enviados e comportamento sem LLM ou internet.
- [ ] Integrar interpretação com ferramentas controladas pelo serviço, mantendo comandos básicos locais.
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
| Verificadores locais | Configurar ESLint, pytest e Ruff preservando `node:test`; documentar comandos. | [ ] Lint e testes existentes executam localmente; [ ] falha é reportada com código apropriado; [ ] dependências e versões estão documentadas. | Não exige mesa; usuário pode revisar os comandos. |
| CI e simulação | Adicionar GitHub Actions com testes disponíveis e integrações simuladas, sem segredos ou equipamentos. | [ ] Pipeline executa em alterações; [ ] falhas são visíveis; [ ] hardware e chamadas pagas não são executados automaticamente. | Após envio ao GitHub, conferir resultado do pipeline quando habilitado. |
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
| Processo Python persistente | Extrair o fluxo atual para um processo de longa duração; Node envia solicitações identificadas e recebe resultado ou erro; carregar o modelo uma vez. | [ ] Vários pedidos usam o mesmo processo/modelo; [ ] falhas e encerramento são tratados; [ ] transcrições permanecem associadas aos pedidos. | Falar comandos repetidos e comparar a espera com o protótipo anterior. |
| Captura e fim da fala | Manter captura aberta quando possível; segmentar por detecção de fala/silêncio e preservar ativação manual durante os testes. | [ ] Frase curta não espera obrigatoriamente cinco segundos; [ ] início e fim não são cortados nos cenários testados; [ ] ausência de áudio é informada. | Testar pausas naturais, ruído e música no local de uso. |
| Benchmark de modelos | Reutilizar conjunto de frases e condições para comparar `tiny`, `base` e `small` e parâmetros; medir do fim da fala ao resultado. | [ ] Tempos medianos e de pedidos lentos, erros, CPU e memória registrados; [ ] comparação e modelo escolhido justificados. | Avaliar se a latência e os erros observados são aceitáveis para a equipe. |

### Fase 2 — Aplicação local e conexão

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Serviço e terminal | Separar o serviço do terminal administrativo; definir comunicação local para consultar estado e configurar um serviço sem janela interativa. | [ ] Terminal consulta serviço ativo; [ ] estados de áudio e mesa são legíveis; [ ] erros não encerram silenciosamente a aplicação. | Experimentar os comandos no computador e avaliar clareza das mensagens. |
| Configuração persistente | Criar acesso a armazenamento local, validar endereço e recuperar configurações no arranque; avaliar SQLite. | [ ] IP salvo sobrevive ao reinício; [ ] dado inválido gera erro compreensível; [ ] falha de leitura é informada. | Informar IP correto e verificar após reinício. |
| Conexão e estado | Encapsular biblioteca da mesa; implementar estados e tentativas de reconexão; sincronizar valores disponíveis após retorno. | [ ] Terminal consulta serviço com mesa desligada; [ ] conexão e queda são refletidas; [ ] pedidos antigos offline não são reenviados; [ ] estado incerto é indicado. | Ligar a mesa após o computador, desligar/religar e conferir o estado na interface original. |
| Inicialização e acesso local | Implementar a opção Windows definida na fase 0; proteger canal administrativo; documentar instalação e remoção. | [ ] Inicia no cenário escolhido sem terminal visível; [ ] processo de áudio é monitorado; [ ] reinício e desinstalação verificados. | Reiniciar o computador e validar a consulta pelo terminal e o áudio no uso real. |
| Configuração inicial | Validar IP e opções disponíveis pelo terminal, com persistência e atualização da conexão. | [ ] IP válido pode ser configurado; [ ] valor inválido é recusado; [ ] configuração persiste; [ ] novo IP atualiza a conexão. | Informar IP e testar a alteração na rede real. |
| Dados, atualização e backup | Separar arquivos de instalação, dados persistentes e modelos; criar exportação e restauração dos dados do aplicativo. | [ ] Atualização preserva configuração e cadastros; [ ] backup pode ser restaurado e conferido; [ ] backup do aplicativo é distinguido dos shows/snapshots da mesa. | Testar atualização e recuperação de cópia com dados de exemplo e verificar resultado. |
| Recuperação do áudio USB | Detectar indisponibilidade e testar reabertura com identificação do dispositivo; informar estado e evitar associar outra entrada indevidamente. | [ ] Remoção e retorno são reportados; [ ] captura é recuperada quando possível; [ ] ambiguidade exige revisão. | Desconectar/reconectar a USB ou ligar a mesa depois do serviço e verificar canais. |

### Fase 3 — Voz por múltiplas entradas e modos

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Múltiplas entradas e conversas | Identificar origem dos trechos; criar contexto por interação e fila limitada; coordenar alterações sobre o mesmo controle. | [ ] Duas entradas preservam origens e perguntas; [ ] sobrecarga e ações concorrentes são tratadas; [ ] identidade não é inferida como certeza pelo microfone. | Participar com duas pessoas e duas entradas, inclusive falando ao mesmo tempo. |
| Ativação por “mesa” | Começar com alternativa medida na fase 1; segmentar a frase, preservar início e comparar detector separado se necessário. | [ ] Pedido na mesma frase é reconhecido nos testes; [ ] esclarecimento, expiração e “cancelar” funcionam; [ ] perda e ativação indevida são medidas. | Testar fala, canto, música e conversas no ambiente de culto. |
| Modos e microfone master | Persistir entradas e permissões; implementar passagem, culto e pausa e expor estado no terminal. | [ ] Entradas bloqueadas não emitem comandos; [ ] áudio da mesa não é mutado pela política; [ ] pendências são tratadas na troca; [ ] recuperação pelo terminal funciona. | Escolher microfone master e dirigente, testar transições e decidir comportamento após reinício. |

### Fase 4 — Sessão, equipe e retornos

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Cadastros e sessão | Modelar integrantes, grupos, papéis, equipamentos, fontes e vínculos com banco e terminal; manter dados da sessão separados dos permanentes. | [ ] Uma pessoa pode ter várias fontes; [ ] vínculos podem ser confirmados e corrigidos; [ ] dados persistem após reinício. | Cadastrar uma formação real e verificar nomes, papéis, canais e equipamentos. |
| Tipos e caminhos físicos | Modelar fonte, equipamento, receptor/DI, medusa, portas e patch; manter sem fio e tipo de cápsula como características separadas, com marca/modelo opcionais. | [ ] Um microfone sem fio direto à mesa e uma fonte via medusa podem ser cadastrados; [ ] entrada física e canal são distintos; [ ] dados ausentes e vínculos não confirmados são explícitos. | Conferir a ligação real, identificação, tipos e patch com o técnico. |
| Retornos pela medusa | Associar auxiliar e saída física à via, regulador e integrante; admitir retorno estéreo quando necessário. | [ ] Caminho individual pode ser consultado e corrigido; [ ] regulador físico não é apresentado como controlável; [ ] vias de um par estéreo podem ser representadas. | Identificar auxiliares, saídas, vias e reguladores físicos e conferir os vínculos. |
| Identificação por cor e voz | Registrar etiquetas e cor da mesa separadamente; resolver equipamento e canal com base nos vínculos e patch conhecidos; propor cadastro por sessão. | [ ] “Microfone amarelo sem fio está com a Ana” encontra o canal quando o caminho está confirmado; [ ] duplicidade, conflito ou patch ausente geram esclarecimento; [ ] proposta exige confirmação. | Ditar o exemplo, testar duas etiquetas iguais e validar o canal na mesa. |
| Mudanças e conflitos de vínculos | Registrar origem e momento da confirmação do caminho/patch; revisar duplicidade de equipamento ou entrada e mudanças externas conhecidas. | [ ] Vínculo manual ou possivelmente desatualizado é identificado; [ ] conflito não é substituído silenciosamente; [ ] revisão é registrada. | Trocar um vínculo em ambiente de teste e confirmar a correção com o técnico. |
| Segurança de equipamentos e processamento | Registrar compatibilidade de alimentação conhecida e origem da informação; manter sugestões de processamento revisáveis. | [ ] Phantom não é acionado automaticamente pelo tipo de cápsula; [ ] cadeia desconhecida é indicada; [ ] não há EQ fixa aplicada apenas por tipo ou marca. | Técnico verifica a cadeia e as especificações dos equipamentos antes de qualquer alteração de alimentação. |
| Auxiliares e escala | Integrar controles suportados pela mesa; separar envio de master auxiliar; converter escala 0–100 com limites testados. | [ ] Ajuste absoluto e relativo são distintos; [ ] retorno compartilhado é identificado; [ ] estado confirmado e enviado são distintos; [ ] conversão e limites documentados. | Conferir na mesa um retorno compartilhado e avaliar a escala e o efeito dos ajustes. |
| Passagem guiada e resposta falada | Construir fluxo de confirmação de fontes e retornos; integrar TTS e saída de áudio configurável. | [ ] Fluxo pode ser corrigido no terminal; [ ] resposta reflete o resultado conhecido; [ ] falha de áudio é visível; [ ] testes de retorno da própria voz documentados. | Percorrer a passagem com integrantes e avaliar a compreensão e o destino da resposta. |
| Revisão de cadastros por voz | Transcrição gera proposta com origem e campos interpretados; terminal permite corrigir, confirmar ou rejeitar; vincular resultado ao registro definitivo. | [ ] Proposta pendente aparece com frase e origem; [ ] correção, confirmação e rejeição funcionam; [ ] alterações persistem somente conforme o estado escolhido; [ ] vínculo pendente não é tratado como confirmado. | Ditar cadastros, corrigir um reconhecimento incorreto, rejeitar outro e confirmar o resultado exibido. |

### Fase 5 — LLM, ferramentas e apresentação

| Atividade | Caminho e integração | Checklist de aceite | Usuário/equipamento |
| --- | --- | --- | --- |
| Provedor de LLM | Criar interface para provedor configurável; manter credenciais no serviço e comandos locais independentes; definir limites e tempo de espera. | [ ] Pedido com contexto mínimo e resposta estruturada validados; [ ] indisponibilidade tem resposta clara; [ ] credenciais não vão ao navegador ou repositório; [ ] consumo pode ser acompanhado. | Escolher provedor, forma de acesso, limites de custo e dados que aceita enviar; fornecer credencial pelo mecanismo apropriado. |
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
