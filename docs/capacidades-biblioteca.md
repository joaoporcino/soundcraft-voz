# Capacidades declaradas da biblioteca Soundcraft

Auditoria dos artefatos instalados localmente, sem consultar versões upstream mais novas.

- Pacote: `soundcraft-ui-connection` **7.0.3**, conforme `node_modules/soundcraft-ui-connection/package.json`.
- Escopo: `README.md`, `index.d.ts` e declarações em `lib/` da instalação local.
- Fase relacionada: fase 0 — medição e viabilidade, especialmente levantamento de leitura, escrita, mudanças externas e confirmação por recurso.

“Tipado” significa que a fachada pública declara métodos ou observáveis específicos. “Estado interno” significa que os tipos do modelo incluem campos, sem oferecer por isso uma API pública de controle para aquele recurso. A existência de métodos declarados não prova que a mesa física os aceite ou confirme.

## Matriz da API local

| Recurso | Leitura / observação declarada | Escrita tipada declarada | Limite conhecido nesta auditoria |
| --- | --- | --- | --- |
| Canais: nome, mute, fader | `Channel.name$`, `mute$`, `faderLevel$`, `faderLevelDB$` (`lib/facade/channel.d.ts`). | `setName`, `setMute`, `mute`, `unmute`, `toggleMute`, `setFaderLevel`, `setFaderLevelDB`, `changeFaderLevel`, `changeFaderLevelDB` (`channel.d.ts`). | Fachada disponível para leitura/alteração; não validada fisicamente. |
| Cor de canal | Campo interno `I.color` (`lib/state/mixer-state.models.d.ts`); possível inspeção do estado bruto. | Nenhum método de cor encontrado na fachada. | Campo no modelo interno não comprova suporte de controle. |
| Envio AUX/FX por canal | `SendChannel.post$`; propriedades herdadas de `Channel` para nome, mute e fader (`lib/facade/send-channel.d.ts`, `channel.d.ts`). | Métodos herdados de `Channel`; `setPost`, `post`, `pre`, `togglePost` (`send-channel.d.ts`). | API declara controle de envio e PRE/POST; não confirma resposta da Ui24R. |
| Envio AUX: pan e pós-processamento | `AuxChannel.pan$`, `postProc$` (`lib/facade/aux-channel.d.ts`). | `setPan`, `changePan`, `setPostProc`, `postProc`, `preProc` (`aux-channel.d.ts`). | Pan documentado apenas para AUX estéreo vinculado; não validado na mesa. |
| Master AUX / saída | `master.aux(n)` retorna canal master com observáveis herdados, incluindo nome, mute e fader; canal atrasável expõe `delay$` (`lib/facade/master-bus.d.ts`, `master-channel.d.ts`, `delayable-master-channel.d.ts`). | Métodos herdados de canal; `setDelay` e `changeDelay` no canal atrasável (`delayable-master-channel.d.ts`). | É distinto do nível de cada envio individual `aux(n).input(canal)`. |
| Grupos de mute | `MuteGroup.state$` (`lib/facade/mute-group.d.ts`). `SoundcraftUI.muteGroup()` aceita `1..6`, `'all'` e `'fx'` (`lib/soundcraft-ui.d.ts`). | `mute`, `unmute`, `toggle`; `SoundcraftUI.clearMuteGroups()` (`mute-group.d.ts`, `soundcraft-ui.d.ts`). | Não há fachada declarada para listar/editar membros do grupo. Estado e efeito físico pendentes. |
| Shows, snapshots e cues | `ShowController.shows$`, `currentShow$`, `currentSnapshot$`, `currentCue$` (`lib/facade/show-controller.d.ts`). | `refreshShows`, `loadShow`, `loadSnapshot`, `loadCue`, `saveSnapshot`, `saveCue`, `updateCurrentSnapshot`, `updateCurrentCue` (`show-controller.d.ts`). | `saveSnapshot`/`saveCue` documentam sobrescrita. Não foram encontrados métodos de excluir nem confirmação/ack explícito. Listagem, disponibilidade conforme firmware e efeitos não validados. |
| Patch / roteamento físico | `hw(n)` identifica canal de hardware; o estado interno contém, entre outros, `I.src`, `I.scsrc` e `Hwoutaux.src` (`lib/soundcraft-ui.d.ts`, `lib/state/mixer-state.models.d.ts`). | Nenhum método tipado de patch encontrado. | `hw(n)` não equivale a um controlador de patch. Campos internos não demonstram API de roteamento. |
| EQ | Modelo interno contém estruturas `FEq`, `AEq`, `MEq` associadas a tipos de estado (`lib/state/mixer-state.models.d.ts`). | Nenhum método tipado de EQ encontrado. | Estado bruto pode conter dados; não há controlador de EQ identificado nesta fachada. |
| Gate | Modelo interno declara `Gate` e campos em estruturas de canais (`lib/state/mixer-state.models.d.ts`). | Nenhum método tipado de gate encontrado. | Campo de estado não comprova escrita nem observação dedicada. |
| Compressor / dinâmica | Modelo interno declara `dyn` / `LClass` com parâmetros de dinâmica (`lib/state/mixer-state.models.d.ts`). | Nenhum método tipado de compressor/dinâmica encontrado. | Campo de estado não comprova controlador público. |
| Phantom e ganho de hardware | `HwChannel.phantom$`, `gain$`, `gainDB$` (`lib/facade/hw-channel.d.ts`). | `setPhantom`, `phantomOn`, `phantomOff`, `togglePhantom`, `setGain`, `setGainDB`, `changeGain`, `changeGainDB` (`hw-channel.d.ts`). | Controle tipado declarado; compatibilidade da fonte e comportamento físico não foram testados. |

## Protocolo genérico e confirmação

`MixerStore.state$` é declarado como o estado completo do mixer num objeto plano mutável e `messages$` como fluxo de mensagens SETD/SETS (`lib/state/mixer-store.d.ts`). A conexão também declara `inbound$`, `outbound$` e `allMessages$`, além de `sendMessage`, `setd`, `setdBool` e `sets` (`lib/mixer-connection.d.ts`). Esses caminhos permitem observar estado/mensagens ou emitir comandos genéricos, mas não são métodos tipados específicos de patch, cor, EQ, gate ou compressor.

O estado observado pode agregar valores recebidos e valores enviados pelo cliente; portanto, a presença de um valor em `state$` **não é confirmação de que a mesa aplicou o comando**. A API examinada não documenta um resultado de confirmação por operação para os recursos da tabela. A implementação deverá manter “comando enviado” separado de “estado recebido/observado” e não inferir sucesso apenas pelo envio ou pelo estado local.

## Dependências e validação pendente

- Dependência desta auditoria: pacote local fixado em `7.0.3` no `package.json` do projeto e presente em `node_modules`.
- Dependências de validação física: Soundcraft Ui24R, firmware instalado (registrar versão, especialmente para cues), rede e oportunidade de teste em ambiente controlado sem afetar uma apresentação.
- Nenhum teste físico foi executado nesta auditoria. Também não foram validados mudanças externas, roteamento/patch, confirmação de comandos, disponibilidade de cues conforme firmware, nem efeitos de mute groups ou processamento.
- Antes de disponibilizar operações na aplicação, validar por recurso: leitura inicial, alteração aprovada, mudança externa, estado recebido após a alteração, reconexão e comportamento de falha. Operações amplas como carregar snapshot/cue e phantom devem ser testadas isoladamente e em momento controlado.
- Até essa validação, tratar a matriz como capacidades declaradas no pacote; os recursos sem método tipado permanecem ausentes da API de fachada, ainda que existam campos internos ou envio genérico de protocolo.
