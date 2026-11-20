## Situação atual

- Estado: Observação parcial de mute e fader implementada.
- Integração: Serviço reporta apenas valores recebidos na conexão atual.
- Validação: Testes com biblioteca e servidor simulados; sincronização física pendente.

# Observação parcial do estado da mesa

## Objetivo e vínculo

Fases 0 e 2 do [plano](../plano-de-execucao.md): apresentar os valores de mute e fader que chegaram pela conexão atual, sem presumir confirmação, atualização completa ou capacidade do firmware físico.

## Contrato

Assinar `inbound$` da conexão antes de iniciar cada socket. Aceitar apenas `SETD` de `i.0` a `i.23`, propriedade `mute` com valor 0 ou 1 e `mix` com número finito entre 0 e 1. Não usar o estado combinado da biblioteca, que inclui valores de saída. Cada campo conhecido registra valor e horário de recepção. Expor cópia independente em status com canais parciais; fader usa valor linear recebido, sem declarar percepção de volume.

Cada abertura, queda ou substituição da conexão invalida valores anteriores. A ausência de mensagem é expressa pela ausência de campo, sem valores presumidos. `connected` não significa que os campos foram recebidos. Qualquer mensagem recebida, inclusive eco, é observação da conexão, não confirmação de execução física. O ajuste relativo limitado utiliza somente observação recente da conexão, revalida revisão e idade na confirmação e invalida o valor antes de enviar, conforme [escala de fader](escala-fader.md); alterações externas que não foram recebidas continuam desconhecidas. Fora do escopo: sincronização completa, confirmação de comandos, controles adicionais e validação no equipamento físico.

## Critérios de aceite

- Inicialmente, valores são desconhecidos; estado parcial e horários refletem apenas mensagens de entrada válidas da conexão vigente.
- Valores próprios enviados sem eco não aparecem como observados; alterações externas e eco recebido são marcados somente como recebidos.
- Mensagens inválidas, de outros controles ou fora de faixa são ignoradas; retorno é cópia independente.
- Queda limpa valores e reconexão não recupera dados anteriores; subscrições antigas são encerradas.
- Teste com biblioteca real e servidor WebSocket simulado cobre estado inicial, mudanças, ausência de eco, dados inválidos e reconexão parcial; não prova comportamento do firmware físico.
