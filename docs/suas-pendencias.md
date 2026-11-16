# Suas pendências

Lista do que depende de você, da sua decisão ou de acesso ao equipamento. O [plano de execução](plano-de-execucao.md) mantém o detalhamento técnico. Os itens abaixo são pendentes até você confirmar o resultado; não é necessário resolver tudo antes de começarmos.

## Para começar a implementação

**Nenhuma pendência sua bloqueia o início.** Podemos organizar o código, preparar o processo persistente do Whisper, medir com áudios de teste, desenvolver configuração local e testar comportamentos simulados. Cada implementação ainda deve seguir o [plano de execução](plano-de-execucao.md).

## Necessário para validar no ambiente real

- [ ] **Disponibilizar o computador e a Ui24R.** Precisaremos ligá-los por rede e, para testar o áudio multicanal, por USB. Os testes devem ocorrer fora de uma apresentação, em um canal apropriado.
- [ ] **Identificar a montagem usada no teste.** Juntos vamos registrar o firmware da mesa, o driver e ao menos um microfone com sua entrada física e canal. Não é preciso descobrir tudo antecipadamente.
- [ ] **Falar frases de teste e avaliar a espera.** Vamos medir o tempo e comparar modelos; você nos ajuda a decidir se o atraso e o reconhecimento são aceitáveis.
- [ ] **Conferir o áudio USB.** Acompanhar o teste de uma e depois duas fontes, inclusive com um canal mutado, para validar números de entrada e comportamento real.
- [ ] **Validar conexão e recuperação.** Reiniciar o computador, ligar a mesa depois e acompanhar os testes de queda e retorno da rede e da USB.
- [ ] **Conferir as funções da mesa.** Com o técnico, validar gradualmente canais, auxiliares, grupos de mute, roteamento e cues/snapshots que a integração conseguir oferecer.

Essas atividades podem ser preparadas e parcialmente testadas por simulação antes; só a validação real fica pendente até termos o equipamento e sua participação.

## Decidir quando chegarmos à etapa

- [ ] **Informar como o Windows inicia.** Ao ligar o computador, o desktop abre automaticamente? É necessário que o serviço funcione antes de o desktop aparecer? Essa resposta é necessária para escolher e validar a inicialização automática, não para começar as demais tarefas.
- [ ] **Definir o microfone master e o dirigente.** Informar as entradas que serão usadas e quem pode mudar entre passagem e culto.
- [ ] **Escolher o modo após reinício.** O aplicativo deve recuperar o último modo ou aguardar uma escolha?
- [ ] **Definir limites e permissões.** Decidir quem pode ajustar retornos, master, roteamento e configurações, e quais ações precisam de confirmação.
- [ ] **Validar os cadastros da equipe.** Conferir integrantes, fontes, microfones, medusa e retornos quando a funcionalidade estiver disponível.
- [ ] **Escolher como usar a LLM.** Avaliar modelo local ou provedor externo, autenticação, privacidade e limite de custo quando chegarmos a essa etapa.
- [ ] **Testar o Holyrics.** Disponibilizar uma programação e um gatilho de teste e confirmar se o evento acontece no momento esperado, inicialmente sem alterar a mesa.
- [ ] **Decidir sobre acesso ao painel futuro.** Informar quais pessoas e dispositivos precisarão acessá-lo pela rede; a interface inicial será pelo terminal.

## Histórico de respostas e testes

Registre aqui decisões ou resultados curtos, com data, e coloque detalhes técnicos e evidências no plano. Não inclua senhas, chaves, tokens ou outros dados sensíveis: o repositório é público.

| Data | Decisão ou resultado | Detalhes |
| --- | --- | --- |
| 16/11/2026 | Voz e execução de comandos na mesa foram validadas pelo usuário no protótipo. | A medição de latência e os testes multicanal ainda estão pendentes. |
