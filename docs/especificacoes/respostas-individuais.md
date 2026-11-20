## Situação atual

- Estado: Política e fila de respostas simuladas implementadas.
- Integração: Serviço local e terminal; síntese e roteamento real não implementados.
- Validação: Testes em memória e HTTP com serviço simulado; isolamento, volume e saída física pendentes.

# Respostas individuais e alternativa no PA

## Estado e objetivo

Em desenvolvimento, fase 4 do [plano](../plano-de-execucao.md). Priorizar a fala no retorno individual da pessoa e, se não disponível, usar automaticamente o PA apenas em ensaio ou passagem, com limite configurado. No culto, apresentar texto ao operador em vez de usar o PA. A síntese e o roteamento de áudio continuam pendentes.

## Política simulada

Uma função recebe contexto da sessão (`ensaio`, `passagem` ou `culto`), vínculo explícito de retorno e disponibilidade conhecida. Só escolhe retorno quando o vínculo está confirmado, exclusivo e disponível. Retornos compartilhados, identidade ou disponibilidade desconhecidas não comprovam audição individual. Para a alternativa ao PA, exigir contexto ensaio/passagem e limite numérico finito em dB menor ou igual a zero; na ausência de limite retornar texto, sem inventar valor. Esse parâmetro é apenas um contrato de decisão: não é aplicado ao áudio nem comprova nível seguro na cadeia. Contexto ausente ou desconhecido sempre retorna texto. No culto nunca selecionar PA. Não inferir identidade apenas da entrada de microfone. A política só devolve uma decisão e motivo, não envia comandos, abre dispositivos ou reproduz som.

## Dependências para a implementação real

Associar conversa, pessoa e retorno por vínculos confirmados; determinar e validar a disponibilidade do caminho, inclusive falhas não detectáveis de fone e regulador; validar com a mesa como isolar envios por AUX e impedir vazamento ao PA ou a outros retornos. Uma única saída P2/RCA do computador pode conter sons de outros aplicativos e não garante destinos individuais. Definir limite efetivo com técnico, gerenciar reprodução concorrente, mudança de modo e estado do canal, falhas e recuperação sem restaurar estado externo indevidamente; evitar recaptura da própria fala. A capacidade real de leitura/alteração e o patch do usuário ainda não foram validados. Na dúvida, não habilitar roteamento físico automático.

## Fila simulada de respostas

### Integração ao serviço

O serviço local autenticado disponibiliza uma fila exclusivamente simulada, com comandos explícitos `resposta-simulada configurar JSON`, `enfileirar DESTINATARIO TEXTO`, `listar`, `concluir ID`, `falhar ID` e `cancelar ID`. Contexto de passagem/culto vem do modo do serviço; alteração de modo ou sessão, desconexão e encerramento cancelam itens ativos e pendentes. O destinatário é informado explicitamente, sem inferir identidade de uma entrada. Limites e disponibilidades declarados são dados de teste, não evidência de roteamento físico; nenhuma operação de áudio ou mesa é chamada. A fila reinicia vazia e não repete itens antigos. Testes HTTP autenticados e em memória cobrem ordenação, modo, cancelamento e falhas; não há reprodução real.

Uma fila FIFO limitada mantém no máximo uma resposta simulada ativa; cada item identifica destinatário e texto. No instante em que passa a ativo, a política consulta o contexto e o vínculo mais recentes, e decide retorno, PA ou terminal. Destino terminal não ativa reprodução. Atualizar o contexto ou vínculo reavalia o item ativo e cancela sua reprodução simulada se o destino ou limite mudar; itens aguardando são decididos somente quando começam. Uma conclusão, falha ou cancelamento remove o item antes de iniciar o próximo, sem repetir automaticamente. Parar cancela a fila e impede novos itens. Limite de fila e entradas inválidas são informados ao chamador. A simulação gera eventos para início, término, falha, cancelamento e texto no terminal; não abre dispositivo, muda envios ou liga-se ao serviço.

O cancelamento aqui é determinístico porque não existe saída real. Uma futura integração precisará interromper o áudio, confirmar o isolamento das rotas, coordenar alterações externas e revalidar em cada fronteira assíncrona antes de reproduzir. A fila simulada não comprova que um sinal físico já iniciado possa ser interrompido a tempo.

## Aceite

- [x] Testes determinísticos cobrem retorno exclusivo confirmado, ausente, compartilhado e disponibilidade desconhecida.
- [x] Em ensaio/passagem, fallback PA exige limite explícito válido; culto e contexto desconhecido nunca selecionam PA.
- [x] Testes não acessam mesa, áudio, rede ou provedor; respostas não alegam reprodução ou confirmação física.
- [ ] Quando a reprodução real existir, testar isolamento, volume, concorrência, mudança de modo, falhas e recaptura com a equipe e equipamento, registrando resultados separados dos testes simulados.
- [x] Fila simulada preserva ordem e um único destino ativo; mudanças de contexto ou vínculo impedem a continuação simulada em destino antigo e são reaplicadas à próxima resposta. Isolamento de áudio real não foi validado.
- [x] Cancelamento, falha, limite e parada têm resultado visível, sem executar hardware ou reenviar item.

**Validação histórica:** três testes automatizados da política passaram. Não há reprodução de áudio ou alteração de roteamento nesta entrega.

**Fila simulada:** seis testes específicos e um teste de serviço HTTP com CLI passaram em 18/11/2026; ESLint passou. A integração simula a saída, portanto isolamento físico e interrupção de áudio continuam pendentes.
