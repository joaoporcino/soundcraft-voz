## Situação atual

- Estado: Detecção de silêncio experimental implementada.
- Integração: Opção do fluxo de voz; não é escuta contínua.
- Validação: Áudio simulado; limites e uso real não validados.

# Gravação com fim por silêncio

## Estado e vínculo

- **Estado:** implementada e testada com áudio simulado; validação com áudio real pendente.
- **Plano:** Fase 1 — Voz mais responsiva.
- **Revisão:** 16/11/2026.

## Objetivo e escopo

Oferecer uma alternativa opcional à gravação fixa de cinco segundos, ativada manualmente por Enter, que encerre após um período de silêncio ao fim da fala. A gravação fixa continua sendo o padrão. Não se trata de escuta contínua, identificação de palavra de ativação nem captura multicanal concorrente.

## Comportamento proposto

- `--fim-por-silencio` ativa a alternativa no worker persistente; o CLI e o worker validam e transmitem a opção. O modo `--texto` continua independente de áudio.
- Capturar em blocos pequenos a 16 kHz na entrada selecionada; usar um limiar de energia inicial simples para detectar fala e silêncio, com curta margem anterior para evitar cortar o começo. O limiar é uma aproximação, não reconhecimento semântico nem mecanismo contra acionamentos indevidos por música.
- Definir limite de tempo sem fala e duração máxima total; se não houver fala, retornar erro e não executar ação. Encerrar a captura e liberar recursos inclusive em erro. Não alterar o comportamento de gravação fixa sem a opção.
- Testar estados e limites com blocos e dispositivos simulados, sem mesa ou download de modelo. Testes em ambiente real com música, volume, dispositivos e falas diferentes são obrigatórios antes de considerá-lo validado; latência, falsos inícios e cortes devem ser medidos.

## Aceite

- [x] Modo fixo anterior permanece padrão; opção é transmitida ao worker.
- [x] Fala simulada termina após silêncio e preserva margem inicial; silêncio contínuo e captura interrompida não enviam transcrição como comando.
- [x] Limites impedem gravação indefinida; dispositivo/stream é fechado em sucesso e falha.
- [x] Testes automatizados e verificações passam; validação com áudio real fica registrada separadamente.

O detector experimental usa limiar RMS 0,002, blocos de 100 ms, até 300 ms de pré-buffer e 800 ms de silêncio. Sem fala por cinco segundos, áudio truncado pelo limite de 12 segundos, falha no stream, fila cheia ou ausência prolongada de callbacks geram erro, sem transcrever parcialmente. Esses parâmetros são aproximações para testes, não promessa de desempenho no ambiente de culto.

## Limitações

Sons não verbais e música podem cruzar o limiar, e pausas naturais podem encerrar cedo. A alternativa deve ser apresentada como experimental até testes físicos. A detecção de palavra “mesa” e microfones simultâneos não estão nesta entrega.
