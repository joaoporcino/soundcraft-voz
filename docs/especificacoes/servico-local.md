# Serviço local e terminal administrativo

## Situação atual

- Estado: Serviço e terminal administrativo implementados.
- Integração: Entradas identificadas, comandos confirmados, captura manual e LLM opcional integrados.
- Validação: Testes simulados; reinício, voz e mesa reais pendentes.

## Estado e vínculo

- **Estado:** serviço e terminal separados implementados; comandos com confirmação e voz manual integrados e testados em simulação. Tarefa de login implementada com executor simulado; instalação e integração física pendentes.
- **Fase ou atividade:** Fase 2 — Aplicação local e conexão; comandos administrativos e inicialização Windows após login.
- **Revisão:** 17/11/2026.

## Problema e objetivo

O programa atual combina operação interativa e conexão com a mesa no mesmo terminal. O serviço e um terminal de administração precisam poder existir em processos separados, para que o estado administrativo continue consultável sem uma janela interativa do operador. A opção inicial de início automático será após o login do usuário, portanto áudio e drivers continuam dependendo da sessão interativa.

## Escopo e fora de escopo

Os parágrafos desta seção e os critérios originais registram a entrega inicial. O comportamento atual inclui comandos e captura manual descritos em [comandos do serviço](comandos-servico-local.md); não há confirmação física nem prova de inicialização após reinício.

Esta fatia implementa um processo local mínimo com ciclo de vida explícito (iniciar, consultar e solicitar parada), endpoint administrativo vinculado exclusivamente a `127.0.0.1`, erros legíveis e encerramento gracioso. O terminal administrativo é independente do serviço. Se existir IP salvo, o daemon mantém `MixerConnection` e reporta estado/conexão; não expõe comandos de controle da mesa. A política escolhida para futura inicialização automática é após login do usuário. Para não criar tarefa no computador, sua instalação fica para uma ação posterior e explícita; esta entrega não registra tarefa, serviço, atalho nem altera o Windows.

O processo ainda não integra nem supervisiona `src/index.js`, captura de áudio ou Whisper: o ponto de entrada existente é interativo e não oferece ciclo de vida importável. Embora possa manter a tentativa de conexão da Ui24R e reportar o estado observado pela biblioteca, não executa ações de áudio/mesa. A API não é acessível pela LAN nem pelo navegador.

## Comportamento e integrações da entrega inicial

- O terminal inicia uma instância Node em background, aguarda prontidão com timeout e informa falha se não conseguir iniciar; consulta status e pede parada por HTTP local.
- O serviço escuta somente em loopback IPv4, com porta configurável/injetável nos testes e padrão definido pela implementação. Não usar `0.0.0.0`, descoberta de rede, CORS ou execução de comandos recebidos.
- Respostas administrativas são limitadas a saúde/estado e encerramento. Erros de bind, conflito de instância, inicialização e shutdown são reportados. Sinais de término iniciam fechamento do servidor e recursos locais.
- A política de início é por sessão de usuário do Windows, após login. A execução antes do login não é suportada nem pretendida nesta etapa; acesso a dispositivos de áudio não é afirmado.
- O canal usa token aleatório guardado no manifesto local em diretório de configuração do usuário e compara o token em tempo constante. `mode: 0600` é solicitado ao sistema de arquivos, mas ACLs do Windows não são explicitamente configuradas nem verificadas; herda as permissões do diretório. Não constitui autenticação multiusuário robusta e processos que possam ler esse diretório podem obter o token. Mantenha o serviço somente local e diagnóstico.

## Critérios de aceite

- [x] CLI inicia o processo separado, detecta prontidão e reporta indisponibilidade/timeout sem afirmar sucesso falso; timeout tenta encerrar somente o filho criado pela própria chamada.
- [x] CLI consulta status e solicita encerramento; serviço encerra listener e conexão monitorada.
- [x] Listener aceita conexão somente via loopback; bind em endereço não loopback é rejeitado.
- [x] Chamadas inesperadas, serviço ausente e falha de criação do processo são reportadas; porta ocupada não substitui instância ativa silenciosamente.
- [x] Testes simulados cobrem ciclo em subprocesso, estado da conexão simulado, falhas, encerramento e isolamento de rede sem criar tarefas no Windows, abrir dispositivos, iniciar Whisper ou conectar à mesa.
- [x] Limites de token/ACL, integração com áudio e mesa e necessidade de validar contexto após login ficam registrados.

## Validação

**Automatizada/simulada:** `node --test test/local-service.test.js` passou com subprocesso real do Node, manifesto em diretório temporário, porta loopback efêmera e conexão de mesa simulada. ESLint dos arquivos alterados passou. Uma validação posterior deve comprovar inicialização após login, recuperação após reinício, disponibilidade de dispositivos e conexão/reconexão da mesa no computador alvo. Não foram executadas instalação, tarefa agendada, captura de áudio ou teste em mesa física.

## Evolução da operação

A decisão posterior em [arquitetura](../arquitetura.md) amplia este canal local para operações com proposta e confirmação conforme [comandos do serviço](comandos-servico-local.md). As declarações acima sobre ausência de comandos descrevem a entrega inicial e não o contrato dessa evolução. Token e ACLs mantêm os limites ali descritos; o novo uso exige conta local confiável e permanece restrito a loopback.

## Questões abertas e decisões

- O serviço possui fluxo próprio de comandos e voz manual; o CLI legado `src/index.js` permanece independente e seus comportamentos diferem.
- Há comandos para tarefa de login; sua instalação efetiva e validação após reinício permanecem pendentes.
- A proteção entre usuários locais depende de ACLs Windows ainda não verificadas; o token não constitui isolamento multiusuário.
- O início automático após login foi escolhido, mas ainda não instalado; exige teste de sessão Windows e acesso real aos dispositivos antes de ser marcado validado.
- ACLs específicas de Windows e isolamento entre usuários locais ainda não foram implementados; token mais loopback não resolve acesso por outro processo com leitura do diretório.
