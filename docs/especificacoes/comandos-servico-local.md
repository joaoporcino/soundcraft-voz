## Situação atual

- Estado: Comandos limitados e confirmação implementados.
- Integração: Serviço local com terminal, entradas identificadas e captura manual.
- Validação: Testes com mesa e áudio simulados; aplicação física não comprovada.

# Operação de comandos pelo serviço local

## Objetivo e escopo

Fases 1, 2 e 4 do [plano](../plano-de-execucao.md): conectar texto identificado, ativação, proposta e confirmação ao serviço e terminal. Mute, unmute e fader de entrada absoluto em dB ou em pontos e relativo em pontos são suportados; a escala provisória e as restrições da observação constam em [escala de fader](escala-fader.md). Não há escuta contínua nem confirmação física nesta fatia.

## Contrato

O serviço começa pausado. O operador local autenticado configura entradas e master e escolhe passagem, culto ou pausa. A captura manual pode identificar entrada configurada, sujeita aos limites de [múltiplas entradas](multiplas-entradas.md). Um pedido textual com ativação `mesa` produz proposta identificada; o operador confirma o identificador pelo terminal. A confirmação consome a proposta e revalida modo, origem, conexão e parâmetros no instante de envio. Novo texto da mesma entrada, mudança de configuração ou modo, ou qualquer desconexão invalida propostas e interpretações pendentes; reconexão não as restaura. A conexão nunca retém comandos para executar depois. `sent` significa solicitação entregue à biblioteca sem exceção síncrona; transporte e aplicação na mesa não são comprovados (`delivery: unverified`, `confirmed: false`).

A captura é manual por `voz-iniciar` e `voz-capturar`. O serviço carrega a configuração persistente de voz na inicialização; após alterá-la, reinicie o serviço antes de iniciar o worker. Uma captura que termina após pausa, desconexão ou cancelamento do cliente é descartada. Sem microfone ou modelo real, os testes não validam transcrição.

O IP aplicado é lido na inicialização. Antes de texto, confirmação e captura e ao consultar status, o serviço relê a configuração: valor ausente, inválido ou diferente bloqueia operações e invalida propostas até reinício, mesmo se o arquivo voltar ao valor anterior. O comando oficial de configuração primeiro solicita bloqueio autenticado ao serviço ativo e só então salva o novo endereço. O status informa alvo aplicado e necessidade de reinício. Como outros processos podem editar o arquivo diretamente sem esse protocolo, existe uma janela entre a leitura e o envio em que alterações externas não são atômicas; não usar essa edição concorrente como mecanismo de reconfiguração.

O canal administrativo escuta exclusivamente em loopback e exige token do manifesto local. Novos endpoints aceitam somente JSON limitado, não expõem CORS e rejeitam requisições com Origin. A origem autorizada é construída no serviço após validação do token, nunca inferida de um campo do pedido. A capacidade é destinada ao usuário local confiável: processos que leiam o manifesto também podem controlar o serviço, e as ACLs Windows herdadas não foram verificadas como isolamento multiusuário. Não habilitar acesso pela rede.

## Critérios de aceite

- Modo pausado impede pedidos e início ativo requer ação explícita do terminal.
- Pedido local válido não altera mesa antes da confirmação; confirmação usa a proposta armazenada uma única vez, e retorna envio sem alegar confirmação física.
- Cancelamento, pausa e queda invalidam proposta e impedem reenvio após reconexão; falha de transporte é apresentada.
- Token incorreto, Origin, JSON inválido ou excessivo e argumentos de comando não permitidos não alteram mesa.
- Testes com mesa simulada exercitam processo de serviço e terminal; não acessar hardware, áudio, provedor externo ou alterar tarefas Windows.

## Limites

Os resultados simulados não validam a Ui24R física nem o reconhecimento de voz; a confirmação efetiva do equipamento e as ACLs são pendências específicas. Resultados de teste e estado serão registrados no plano após execução.
