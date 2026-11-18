# Controle do worker de voz no serviço

## Situação atual

- Estado: Controlador de voz manual implementado.
- Integração: Serviço encaminha transcrições de entradas identificadas ao fluxo de comandos.
- Validação: Worker simulado; microfone e modelo reais pendentes.

## Objetivo e vínculo

Nas fases 1 e 2 do [plano](../plano-de-execucao.md), um controlador encapsula o worker persistente para que o serviço apresente seu estado, solicite gravação manual e libere recursos. A evolução de [múltiplas entradas](multiplas-entradas.md) permite controlar até quatro workers associados a entradas identificadas; cada controlador isolado não executa comandos nem oferece escuta contínua.

## Contrato

- Inicialização e captura são explícitas; iniciar novamente reutiliza o worker pronto. Uma captura por vez, sem fila nem reenvio automático.
- `getStatus()` apresenta estado de inicialização, disponibilidade, captura, falha e encerramento, sem incluir transcrições. Erro é reportado ao chamador e o serviço continua administrável.
- Erro de captura recuperável permite uma nova tentativa manual; falha fatal exige nova inicialização explícita com novo processo. Nenhuma transcrição é repetida automaticamente.
- Descrição de dispositivo é conferida ao iniciar e antes/depois da captura; após falha, mudança da descrição entre workers exige revisão e aceite pelo terminal conforme [recuperação](recuperacao-servico.md). A referência vale somente durante a vida do serviço e não prova identidade física única.
- Encerramento durante inicialização ou captura invalida resultados tardios e fecha o worker. O controlador não reabre após encerramento definitivo.
- O controlador aceita fábrica injetável para testes; o padrão usa `VoiceWorker` e não inicia o processo até uma chamada explícita. O código não altera configurações de dispositivo nem presume que um índice permanece estável após reconexão USB.

## Aceite e limites

- Testes automatizados com worker falso verificam reutilização, exclusão de captura concorrente, erro recuperável, falha fatal, recuperação explícita sem replay e descarte de resposta após encerramento.
- Integração ao serviço foi testada separadamente com worker simulado; isso não comprova captura real ou aplicação de comandos na mesa.
- Não há validação de Python compatível, microfone, dispositivo USB, modelo Whisper, latência ou mesa física nesta fatia. Esses testes permanecem pendentes.

**Resultado:** controlador e testes implementados; os casos exercitam também processo Node real que simula o protocolo do worker. Áudio e modelo reais não são usados.
