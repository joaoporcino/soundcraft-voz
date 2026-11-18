# Mesa simulada em memória e por WebSocket

## Situação atual

- Estado: Simuladores em memória e WebSocket implementados.
- Integração: Usados em testes e terminal; não produzem áudio.
- Validação: Testes locais; fidelidade ao firmware físico não comprovada.

## Estado e vínculo

- **Estado:** implementado e validado em testes locais simulados; não validado na mesa física.
- **Plano:** [Fase inicial — Base de qualidade](../plano-de-execucao.md#fase-inicial--base-de-qualidade).
- **Última revisão:** 16/11/2026.

## Problema e objetivo

Permitir testes automáticos das regras e da comunicação com a biblioteca JavaScript sem mesa física. Separar um modelo em memória de um servidor WebSocket para exercitar a conexão real da biblioteca. O simulador não é emulador integral da Ui24R e não produz áudio.

## Escopo

- Estado em memória de canais de entrada para mute e fader, com validação de números e valores e isolamento entre instâncias.
- Servidor de teste WebSocket local, em interface de loopback e porta efêmera, suportando a inicialização e os comandos de mute e fader necessários à biblioteca instalada.
- Interface interativa no CMD/PowerShell para listar canais, consultar e alterar mute e fader de -60 a 0 dB e visualizar alterações; servir o mesmo estado virtual por WebSocket em loopback para o aplicativo poder se conectar. Mostrar endereço local, ajuda, erros e saída limpa; nunca conectar à mesa física.
- Testes que distingam estado simulado de teste com a mesa; incluir falha ou desconexão controlada e limpeza dos recursos.
- Documentar como executar os testes e os comportamentos explicitamente suportados. Expandir protocolo apenas após investigação e teste.

## Fora de escopo

Áudio, USB, equalização, cues, todos os estados da Ui24R, controle de equipamento real e compatibilidade com firmware não testado. Nenhuma conexão real deve ocorrer no CI.

## Critérios de aceite

- [x] Testes em memória cobrem estado inicial, alteração, leituras independentes, entradas inválidas e isolamento.
- [x] A biblioteca real conecta ao servidor simulado e envia comandos de mute e fader que alteram o estado esperado; a numeração e escala são verificadas no protocolo implementado.
- [x] O simulador registra mensagens não suportadas e a queda de conexão é observável.
- [x] Testes usam loopback e porta efêmera, encerram conexões e não precisam de equipamento, modelo de IA ou rede externa. Neste ambiente o loopback precisou de execução fora do sandbox.
- [x] Lint e testes aplicáveis passam; resultados e limites são registrados no plano.
- [x] O comando interativo apresenta os 24 canais e permite consultar e alterar canais válidos, informa erros e encerra servidor e terminal ao sair.
- [x] O aplicativo conectado pela biblioteca real pode alterar canal e estado exibido no terminal, e mudanças locais são notificadas aos clientes; o endereço usa somente loopback.

## Validação e questões abertas

Em 16/11/2026 os testes passaram localmente com `soundcraft-ui-connection` 7.0.3; CI no GitHub e fidelidade com a mesa física ainda não foram verificados. O servidor interativo suporta `SETD` de mute e fader dos 24 canais e `ALIVE`, com retorno simulado; demais mensagens são registradas como rejeitadas. A faixa modelada de fader é -60 a 0 dB, limite do protótipo, e não representa toda a faixa física da mesa. Os testes automatizados injetam `ws` como cliente da biblioteca; também foi testado manualmente o aplicativo atual no modo texto contra o servidor local. A detecção de queda foi testada; reconexão e comportamento físico continuam pendentes. Ao testar manualmente, encerrar o aplicativo antes do simulador: interromper simultaneamente os dois provocou um aviso na finalização da biblioteca.
