## Situação atual

- Estado: Comandos de tarefa de login implementados.
- Integração: Agendador é alterado apenas por ação explícita.
- Validação: Executor simulado; instalação, reinício e áudio reais pendentes.

# Inicialização do serviço no Windows

## Estado e vínculo

- Estado: comandos implementados e testados com executor simulado; comportamento real após login ainda não validado.
- Fase ou atividade no plano: Fase 2 — Aplicação local e conexão, item “Implementar inicialização no Windows pela opção aprovada após a fase 0, sem janela de terminal”. Depende da decisão de iniciar após login, já indicada na arquitetura; teste de áudio no contexto de inicialização e reinício real continuam pendentes.
- Data da última revisão: 17/11/2026.

## Problema e objetivo

O serviço local oferece `start`, `status` e `stop` em `src/local-service-cli.js`. Os comandos da tarefa de login permitem configurar a inicialização por usuário e consultar/remover somente a configuração identificada como pertencente ao Soundcraft; a instalação e o reinício reais ainda não foram testados.

## Escopo e fora de escopo

- Scripts em `scripts/windows/` para instalar, consultar e remover a inicialização no Agendador de Tarefas, mais testes em `test/windows-startup.test.js`.
- Tarefa disparada no logon do usuário atual, com nível limitado e execução oculta, chamando o Node.js e `src/local-service-cli.js start` por caminhos absolutos.
- Operações de sistema encapsuladas em executor injetável para que testes usem simulação e não chamem o Agendador.
- Instalação deve recusar colisão com tarefa existente que não possa ser comprovadamente identificada como gerenciada pelo Soundcraft. Remoção deve ser idempotente e jamais apagar tarefa alheia; não usar opção de sobrescrita forçada.
- Não iniciar antes do login, instalar como serviço Windows, modificar o desktop/registro, iniciar ou remover tarefa automaticamente, nem operar equipamento físico.
- Se não for possível garantir identificação e remoção segura da tarefa, limitar a entrega à geração/consulta de configuração e documentar a instalação manual pendente.

## Comportamento e integrações

Os comandos explícitos serão `install`, `status` e `uninstall` (ou nomes equivalentes documentados). A tarefa recebe nome e descrição identificáveis por este aplicativo, gatilho no logon do usuário, ação com `node.exe` e caminho absoluto do CLI, diretório de trabalho explícito quando aplicável, execução limitada e sem janela. Todos os argumentos/caminhos devem preservar espaços sem concatenação ambígua.

O diagnóstico `status` informa, para tarefa reconhecida, o estado, os horários da última e próxima execução, o código bruto da última execução e o número de execuções perdidas retornados pelo Agendador. A ausência de informações é representada por `null`. Esses campos dizem respeito ao processo de inicialização agendado, que inicia um serviço destacado: não comprovam que o serviço continua ativo, que o áudio está disponível ou que a mesa está conectada. O operador consulta também `node src/local-service-cli.js status`. A consulta não instala nem executa a tarefa.

O adaptador invocará APIs nativas do Windows por meio de um executor isolado; os scripts não devem depender de diretório corrente implícito. O modo status reportará ausente, instalada e compatível, ou conflito/estado não reconhecido. Erros devem ser apresentados sem apagar ou substituir configuração existente. Os testes injetarão executor falso e verificarão nome, gatilho, ação, quoting, privilégio limitado, idempotência, colisão, e que remoção só ocorre após validar a identidade gerenciada.

## Critérios de aceite

- [x] Instalar, consultar e remover são comandos explícitos e documentados; nenhuma operação ocorre ao importar ou executar outro comando.
- [ ] A configuração usa logon do usuário, não requer admin, executa oculta e passa caminhos com espaços sem ambiguidade.
- [x] A lógica de colisão e remoção de tarefa não reconhecida foi testada por inspeção do script gerado com executor simulado; ainda não foi exercitada no Agendador real.
- [x] Testes automatizados usam executor simulado e nenhuma chamada real ao Agendador foi feita.
- [x] Diagnóstico prepara resultado, horários e execuções perdidas e identifica a necessidade de consultar o serviço separadamente; contrato testado com executor simulado. Resultado e ausência de informações ainda não foram verificados no Agendador real.
- [x] Nenhuma alegação de inicialização/áudio após reinício real é feita sem teste explícito no Windows do usuário.

## Validação

Automatizada: seis testes `node --test test/windows-startup.test.js`, com executor falso. Nenhuma tarefa real foi registrada, consultada ou removida. Teste após reinício, ausência de janela, disponibilidade do áudio/driver e recuperação da mesa permanecem validações manuais futuras, dependentes do usuário/equipamento. A propriedade `Hidden` oculta a tarefa na lista do Agendador; isso, por si só, não comprova ausência de janela do processo.

## Questões abertas e decisões

- O escopo e critérios foram incluídos no plano antes da implementação.
- A decisão arquitetural existente prioriza início após entrada automática no desktop; ainda falta validar acesso ao áudio no contexto efetivo.
