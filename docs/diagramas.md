# Entidades e casos de uso

Visão consolidada do que está registrado no código e na [arquitetura](arquitetura.md), revisada em 17/11/2026. Os diagramas separam **implementado**, **simulado/isolado** e **planejado**. O [plano](plano-de-execucao.md) e as especificações detalham critérios e evidências. Um vínculo cadastrado não comprova a ligação física, e um teste simulado não equivale a teste com a mesa.

## Entidades persistidas no SQLite

As onze tabelas abaixo compõem o cadastro no esquema v4. `assignments` registra pessoa, equipamento, sessão e canal declarado; `monitor_assignments` associa pessoa a retorno em uma sessão. Dispositivos, pontos e ligações físicas registram caminhos informados, enquanto `voice_proposals` guarda propostas a partir de transcrições simuladas. A configuração global `monitor_config` não possui chave estrangeira para as tabelas de sessão. Os rótulos nas relações são nomes de domínio, não nomes extras de tabelas.

```mermaid
erDiagram
    people ||--o{ assignments : participa
    equipment ||--o{ assignments : usado_em
    sessions ||--o{ assignments : contem
    sessions ||--o{ monitor_returns : define
    sessions ||--o{ monitor_assignments : contem
    people ||--o{ monitor_assignments : utiliza
    monitor_returns ||--o{ monitor_assignments : associado_a
    physical_devices o|--o{ signal_points : possui
    equipment o|--o{ signal_points : representa
    people o|--o{ signal_points : representa
    monitor_returns o|--o{ signal_points : representa
    sessions ||--o{ signal_links : contem
    signal_points ||--o{ signal_links : origem
    signal_points o|--o{ signal_links : destino
    sessions ||--o{ voice_proposals : contem
    people o|--o{ voice_proposals : pessoa
    equipment o|--o{ voice_proposals : equipamento
    assignments o|--o{ voice_proposals : gera

    people {
        integer id PK
        text name
    }
    equipment {
        integer id PK
        text name
        text kind
        text color
        integer wireless
        text capsule
        text model
    }
    sessions {
        integer id PK
        text name
    }
    assignments {
        integer id PK
        integer session_id FK
        integer person_id FK
        integer equipment_id FK
        integer channel
        text status
    }
    monitor_returns {
        integer id PK
        integer session_id FK
        integer aux
    }
    monitor_assignments {
        integer id PK
        integer session_id FK
        integer person_id FK
        integer return_id FK
        text status
    }
    monitor_config {
        integer id PK
        integer aux_count
        text source
    }
    physical_devices {
        integer id PK
        text name
        text type
    }
    signal_points {
        integer id PK
        text type
        text label
        text direction
        integer device_id FK
        integer equipment_id FK
        integer person_id FK
        integer monitor_return_id FK
        integer channel
    }
    signal_links {
        integer id PK
        integer session_id FK
        integer from_point_id FK
        integer to_point_id FK
        text kind
        text status
        text confirmation_origin
        text confirmed_at
    }
    voice_proposals {
        integer id PK
        integer session_id FK
        text phrase
        text origin
        integer person_id FK
        integer equipment_id FK
        integer channel
        text status
        integer assignment_id FK
    }
```

Um AUX pode ser compartilhado, mas há no máximo um vínculo de retorno confirmado por pessoa e sessão na implementação atual. A contagem de confirmados não comprova exclusividade ou disponibilidade física. O canal de entrada é um número declarado, não uma chave estrangeira para o patch real. Os estados de vínculo de equipamento são `proposto` e `confirmado`; os de retorno incluem também `rejeitado` e `revogado`.

`monitor_config` armazena a quantidade configurável de AUX: um banco legado preserva o valor histórico de oito como não confirmado; um banco novo aguarda configuração explícita. A quantidade informada não detecta a capacidade da mesa. A escolha é feita no terminal; ainda não há instalador que colete essa configuração automaticamente.

IP e configuração do worker de voz ficam em arquivos locais separados; o backup é um arquivo exportado. Estado da conexão, propostas de comando e fila simulada são estruturas em memória: não são tabelas SQLite do diagrama.

## Entidades de domínio planejadas

Os diagramas a seguir são **conceituais**, derivados da arquitetura, e não definem um banco pronto. São complementares às entidades já existentes: por exemplo, uma futura `FONTE_SESSAO` poderá aproveitar informações do vínculo atual, mas isso ainda não é uma migração definida.

### Mesa e fluxo de sinal

```mermaid
erDiagram
    MESA ||--o{ PORTA_FISICA : possui
    MESA ||--o{ CANAL : possui
    MESA ||--o{ BARRAMENTO : possui
    MESA ||--o{ ROTEAMENTO : possui
    FONTE_SINAL ||--o{ ROTEAMENTO : origina
    ROTEAMENTO }o--|| DESTINO_SINAL : alimenta
    CANAL ||--o{ PROCESSAMENTO : possui
    CANAL ||--o{ ENVIO : origina
    BARRAMENTO ||--o{ ENVIO : recebe
    BARRAMENTO ||--o{ PROCESSAMENTO : possui
```

Portas físicas, patch, canal, envio e master auxiliar representam elementos distintos. P2/RCA, USB, medusa, regulador e fone são partes do caminho físico a mapear; seus números não são presumidos iguais aos canais da mesa. O processamento pode incluir filtros, EQ e dinâmica, conforme capacidades reais.

### Caminhos pela medusa e características dos equipamentos

**Cadastro implementado; conferência física pendente:** os diagramas abaixo descrevem caminhos que já podem ser registrados como pontos e ligações por sessão. Eles não indicam leitura automática nem controle real desses trechos.

```mermaid
flowchart LR
    F["Voz ou instrumento"] --> E["Microfone, DI ou outra captação"]
    E --> OPCAO{"Caminho informado"}
    OPCAO -->|"Direto, inclusive receptor sem fio"| IN["Entrada física da mesa"]
    OPCAO -->|"Pela medusa"| M["Entrada e via da medusa"]
    M --> IN
    IN --> P["Patch confirmado ou observado"]
    P --> C["Canal de processamento"]
```

```mermaid
flowchart LR
    C["Canal ou fonte"] --> ENV["Envio ao AUX"]
    ENV --> AUX["Mistura AUX"]
    AUX --> OUT["Saída física da mesa"]
    OUT --> VIA["Via de retorno da medusa, se usada"]
    VIA --> REG["Regulador físico, se houver"]
    REG --> FONE["Fone"]
    FONE --> PESSOA["Integrante"]
```

Cor ou etiqueta do equipamento, cor do canal na mesa e identificação da via são dados distintos; nenhuma cor é identificador único. O equipamento possui tipo, cor, opção sem fio, cápsula e modelo; o caminho entre equipamentos, medusa, porta física, patch e canal pode ser cadastrado e consultado, mas é declarado pelo operador. Dinâmico/condensador e com fio/sem fio são características independentes. A posição de um regulador físico não é conhecida pelo serviço.

### Pessoas, sessão e retornos

```mermaid
erDiagram
    MESA ||--o{ SESSAO : utilizada_em
    SESSAO ||--o{ PARTICIPACAO : inclui
    INTEGRANTE ||--o{ PARTICIPACAO : participa
    SESSAO ||--o{ FONTE_SESSAO : configura
    INTEGRANTE o|--o{ FONTE_SESSAO : apresenta
    INSTRUMENTO o|--o{ FONTE_SESSAO : usado_em
    EQUIPAMENTO o|--o{ FONTE_SESSAO : capta
    PORTA_FISICA o|--o{ FONTE_SESSAO : recebe
    CANAL o|--o{ FONTE_SESSAO : processa
    SESSAO ||--o{ USO_RETORNO : configura
    INTEGRANTE ||--o{ USO_RETORNO : utiliza
    BARRAMENTO ||--o{ USO_RETORNO : fornece
    EQUIPAMENTO o|--o{ USO_RETORNO : reproduz
```

O caminho pela medusa pode ser registrado como pontos e ligações; sua correção física, o retorno estéreo e a identificação da pessoa pela conversa ainda precisam ser validados ou detalhados. Uma pessoa pode ter várias fontes e um retorno pode ser compartilhado.

### Equipes, programação e coral

```mermaid
erDiagram
    GRUPO ||--o{ MEMBRO_GRUPO : possui
    INTEGRANTE ||--o{ MEMBRO_GRUPO : integra
    SESSAO ||--o{ PARTICIPACAO : inclui
    INTEGRANTE ||--o{ PARTICIPACAO : participa
    PAPEL ||--o{ PARTICIPACAO : atribuido
    SESSAO ||--o| PROGRAMACAO : possui
    PROGRAMACAO ||--o{ ETAPA : organiza
    ETAPA ||--o{ PARTICIPACAO_ETAPA : envolve
    PARTICIPACAO ||--o{ PARTICIPACAO_ETAPA : atua
    ETAPA ||--o{ FONTE_ETAPA : preve
    FONTE_SESSAO ||--o{ FONTE_ETAPA : utilizada
    SESSAO ||--o{ SETOR_CORAL : organiza
    GRUPO ||--o{ NAIPE : divide
    SETOR_CORAL ||--o{ OCUPACAO_SETOR : possui
    NAIPE ||--o{ OCUPACAO_SETOR : ocupa
    SETOR_CORAL ||--o{ COBERTURA_MICROFONE : coberto
    FONTE_SESSAO ||--o{ COBERTURA_MICROFONE : capta
```

### Outros conceitos previstos

Conversas por entrada, propostas de cadastro e revisão, usuários/perfis/permissões, canais/patch observados, histórico de comandos, medições, alertas e sugestões, além de show, snapshot, cue, música, evento Holyrics e vínculo entre sistemas são conceitos da visão do produto. Suas estruturas persistentes e relações concretas não estão todas definidas; não devem ser tomadas como tabelas já criadas. A fila de respostas existe apenas como simulação em memória.

## Casos de uso disponíveis ou implementados de forma parcial

```mermaid
flowchart LR
    OP["Operador no terminal"]
    OP --> IP["Configurar e consultar IP"]
    OP --> VOZCFG["Configurar Python, modelo, dispositivo e canal"]
    OP --> CAD["Cadastrar e consultar pessoas, equipamentos e sessões"]
    OP --> VINC["Propor e confirmar fonte; propor, confirmar, rejeitar ou revogar retorno"]
    OP --> AUXCFG["Consultar e configurar quantidade de AUX"]
    OP --> PATH["Cadastrar e revisar pontos, ligações e patch declarado"]
    OP --> PROP["Revisar proposta de transcrição simulada"]
    OP --> BAK["Exportar e restaurar backup em destino vazio"]
    OP --> SVC["Iniciar, consultar e encerrar serviço local"]
    OP --> MODO["Alternar pausa e passagem no serviço"]
    OP --> CMD["Solicitar e confirmar mute, unmute ou fader absoluto"]
    OP --> CAP["Iniciar worker e solicitar captura manual"]
    OP --> WIN["Administrar tarefa de início após login"]
    OP --> SIM["Operar e inspecionar mesa simulada"]
    CMD --> MESA["Mesa por biblioteca ou simulador"]
    CAP --> WHISPER["Worker Python / Whisper"]
```

O fluxo do serviço exige confirmação antes de pedir mute/fader à biblioteca e indica que a entrega não está confirmada. O protótipo anterior em terminal possui um caminho `--live` direto, distinto do serviço. A transcrição com modelo e microfone reais, a Ui24R física e a tarefa de login real não foram validadas nesta rodada. Iniciar/instalar a tarefa são ações distintas; os testes do Agendador foram simulados.

Há módulos testados isoladamente para política de modos, palavra de ativação textual, provedor Gemini opcional, validação de propostas, destino de resposta e fila de reprodução simulada. Sua existência não comprova a integração de todas essas peças ao produto; em particular a fila não toca áudio nem opera AUX. No serviço atual, a seleção de modos é pausa/passagem; o modo culto descrito no domínio ainda precisa ser integrado.

## Casos de uso planejados

```mermaid
flowchart LR
    TEC["Técnico / operador"]
    INTEG["Integrante"]
    DIR["Dirigente"]
    HOL["Holyrics"]

    TEC --> P1["Configurar mesa, entradas, patch, retornos e limites"]
    TEC --> P2["Revisar e confirmar cadastros e permissões"]
    TEC --> P3["Consultar estado, alertas e sugestões de som"]
    TEC --> P4["Criar, revisar ou aplicar cues e snapshots"]
    INTEG --> P5["Identificar-se e solicitar ajuste ou esclarecimento por voz"]
    INTEG --> P6["Receber resposta no próprio retorno"]
    DIR --> P7["Mudar modo e acompanhar programação conforme permissão"]
    TEC --> P8["Revisar propostas, iniciar passagem e controlar fallback"]
    HOL --> P9["Informar eventos de música ou etapa"]
    P9 --> P10["Resolver vínculo e política do cue"]
    P6 --> P11["Enfileirar áudio e selecionar retorno, PA ou terminal"]
    P5 --> P12["Interpretar e validar destino, parâmetros e autorização"]
```

- Configurar equipes, papéis, coral, equipamentos e programação; identificar fontes e vínculos por conversa, sem inferir identidade só pelo microfone.
- Escutar múltiplas entradas, isolar conversas, ativar por “mesa”, pedir esclarecimento, cancelar e aplicar os modos e permissões definidos.
- Interpretar pedidos localmente ou por provedor opcional; validar deterministicamente alvo, parâmetros e permissão antes de qualquer operação.
- Registrar propostas faladas, revisá-las no terminal e, futuramente, no painel web; receber respostas sintetizadas e roteá-las ao retorno individual. PA automático e limitado é permitido apenas em ensaio/passagem; no culto, falha de retorno resulta em texto ao operador.
- Ajustar envios aos AUX, lidar com retornos compartilhados, grupos de mute, roteamento, cues e snapshots somente conforme capacidades e permissões verificadas; não confundir envio com confirmação física.
- Integrar Holyrics inicialmente em modo informativo; depois resolver vínculos revisáveis e políticas autorizadas, preservando funcionamento independente.
- Monitorar áudio e gerar alertas e recomendações revisáveis. Equalização automática e processamento exigem decisões e validação específicas.
- Oferecer painel web e eventual acesso por rede ou captura via celular apenas após definir autenticação, autorização, proteção da conexão e testes adequados.

As relações, casos e permissões completos continuam sujeitos às decisões e aos testes descritos na arquitetura. O usuário informou que sua montagem utiliza master esquerdo/direito, oito saídas de retorno e saídas de controle, mas o cadastro configurável não deve fixar essa quantidade para todas as instalações.
