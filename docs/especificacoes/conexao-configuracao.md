## Situação atual

- Estado: Configuração e reconexão implementadas.
- Integração: Terminal e serviço; mudança de IP no serviço exige reinício.
- Validação: Conexão e reconexão simuladas; sincronização e mesa real pendentes.

# Configuração e reconexão da mesa

## Estado e vínculo

- **Estado:** implementada e testada com servidor simulado; validação física pendente.
- **Plano:** Fase 2 — Aplicação local e conexão.
- **Revisão:** 16/11/2026.

## Objetivo e escopo

Permitir configurar e consultar o endereço de conexão no terminal, persistir a configuração local e manter tentativas de conexão durante a execução sem bloquear o terminal. Apresentar estados compreensíveis e recusar pedidos quando a mesa estiver desconectada, sem colocá-los em fila. Esta entrega não instala serviço Windows, interface web, nem afirma suporte a sincronização de valores após reconexão.

## Comportamento e integração

- O comando de configuração salva explicitamente um endereço IPv4, com porta opcional para o simulador local; consulta retorna o valor salvo sem iniciar áudio ou se conectar. Validar valores antes de gravar. `--ip` em uma execução tem precedência temporária e não altera o valor salvo; `--live` sem `--ip` usa a configuração salva ou informa como configurá-la.
- Armazenar em diretório do usuário apropriado ao Windows, fora do repositório; localização pode ser injetada nos testes. Erros de leitura ou escrita e conteúdo inválido são explícitos e não substituem configurações silenciosamente.
- A conexão deve mostrar conectando, conectada, desconectada e tentando novamente. Iniciar tentativas sem bloquear o prompt; parada encerra timers e conexões mesmo sem servidor. Usar os estados observáveis da biblioteca e impedir ciclos simultâneos de conexão. Não alegar confirmação da mesa apenas por envio.
- Ao desligar ou religar o simulador, o aplicativo deve recuperar a conexão. Comandos recebidos offline falham imediatamente e nunca são reenviados. Testar também parada durante conexão.

## Critérios de aceite

- [x] IP válido sobrevive a novo processo; inválidos não sobrescrevem o arquivo; erro de arquivo é visível em teste local.
- [x] `--ip` temporário tem precedência, e simulação sem `--live` não acessa a mesa nos testes.
- [x] Aplicativo permanece disponível enquanto desconectado, reporta estados e reconecta em testes com servidor local, sem reenvio de comandos antigos.
- [x] Lint e testes Node/Python passam localmente; teste físico e inicialização no Windows ficam explicitamente pendentes.

## Medição de voz

Manter os tempos já disponíveis em `--descrever`; documentar um procedimento de linha de base, com modelo, dispositivo e ambiente, sem alegar resultados reais até a medição com microfone e Whisper. A detecção de silêncio e captura contínua pertencem à fase de voz e exigem especificação própria.
