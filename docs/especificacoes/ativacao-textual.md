## Situação atual

- Estado: Implementada para texto.
- Integração: Usada pelo orquestrador no serviço para entradas identificadas.
- Validação: Testes determinísticos; detecção acústica e áudio real não validados.

# Ativação textual por “mesa”

## Estado e vínculo

- **Estado:** implementada e validada em testes automatizados determinísticos; integração acústica não implementada.
- **Fase ou atividade:** Fase 3 — Voz por múltiplas entradas e modos; atividade “Ativação por ‘mesa’”.
- **Revisão:** 17/11/2026.

## Problema e objetivo

Definir uma máquina de estados determinística para exercitar a regra conversacional de ativação em texto, sem depender de áudio ou de reconhecimento de fala. O módulo aceita “mesa” no início da frase, correlaciona pedido imediato ou seguinte e mantém estado por entrada; o serviço recebe origens identificadas.

## Escopo e fora de escopo

O escopo é um módulo isolado `src/voice-activation.js` com testes em `test/voice-activation.test.js`. A máquina de estados opera sobre texto já fornecido pelo chamador, com autorização injetada e padrão fail closed, relógio injetável e estado separado por identificador de entrada.

O módulo isolado não captura áudio, identifica pessoa nem opera a mesa. Hoje o serviço o usa indiretamente após transcrição manual e permite revisão de comando; não há escuta contínua nem detector acústico de wake word. A aceitação textual não comprova que alguém disse a palavra em áudio.

## Comportamento e integrações

- Normalizar texto de modo previsível e reconhecer “mesa” apenas como palavra inteira no começo da frase, admitindo pontuação imediatamente após a palavra. Ocorrências no meio da frase, dentro de outra palavra, em canto sem palavra inicial ou em texto ambíguo não ativam.
- Se houver conteúdo de pedido após o gatilho na mesma frase, produzir pedido para a conversa daquela entrada. Se houver apenas o gatilho, abrir janela temporária para o pedido seguinte nessa mesma entrada.
- “Cancelar” durante janela aberta encerra somente a conversa da entrada correspondente. A expiração é calculada pelo relógio injetado, sem temporizadores globais.
- Entradas distintas mantêm estados e prazos independentes, inclusive quando recebem eventos simultaneamente; eventos de uma entrada nunca completam ou cancelam a conversa de outra.
- A autorização é uma dependência fornecida pelo chamador. Ausência, exceção ou resposta negativa resulta em recusa sem ativação/pedido autorizado. Nenhuma identidade é inferida a partir da entrada.
- Expor resultados de transição claros e determinísticos, sem executar efeitos externos.

## Critérios de aceite

- [x] “Mesa, abaixa o violão” é aceita como ativação e pedido na mesma frase.
- [x] “Mesa” abre a janela, e o pedido seguinte é associado apenas à mesma entrada.
- [x] “cancelar” encerra a janela da entrada correta; entrada expirada volta a aguardar ativação.
- [x] Palavra no meio, dentro de outra palavra, ambiguidade textual e canto sem palavra inicial não ativam.
- [x] Duas entradas simultâneas conservam estado, pedido, cancelamento e expiração independentes.
- [x] Autorização ausente, negada ou com erro falha fechada; nenhuma identidade é inferida.
- [x] Relógio controlável nos testes permite verificar expiração sem espera real.
- [x] Nenhuma captura de áudio, Whisper, detector acústico, acesso real à mesa ou execução de comando é introduzida.

## Validação

`node --test test/voice-activation.test.js` passou (8 testes); ESLint nos dois arquivos da entrega passou. Os cenários usam relógio e autorização simulados. Nenhum teste físico ou de áudio faz parte desta entrega; o protótipo não valida wake word acústico nem operação real.

## Questões abertas e decisões

- A janela de resposta tem padrão de 8 segundos, configurável por `windowMs`; política/duração para uso operacional permanece sujeita a validação integrada.
- A integração de captura manual e modos no serviço tem testes simulados, inclusive HTTP de múltiplas entradas. Permissões por pessoa e validação com áudio e mesa reais permanecem pendentes.
