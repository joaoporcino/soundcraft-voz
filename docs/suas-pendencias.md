# Suas pendências

Lista do que depende de você, da sua decisão ou de acesso ao equipamento. O [plano de execução](plano-de-execucao.md) mantém o detalhamento técnico. Os itens abaixo são pendentes até você confirmar o resultado; não é necessário resolver tudo antes de começarmos.

## Para continuar a implementação

**Nenhuma pendência sua bloqueia o desenvolvimento e os testes simulados.** Serviço, worker persistente, cadastros e simuladores já têm implementações parciais; podemos continuar integrando os componentes disponíveis. Medições com voz e validações físicas permanecem separadas. Cada implementação deve seguir o [plano de execução](plano-de-execucao.md).

## Necessário para validar no ambiente real

A [auditoria de 17/11/2026](analise-tecnica-2026-11-17.md) aprovou testes simulados daquela rodada, mas não validou equipamento real. Na auditoria, o `.venv` padrão usava Python 3.14.7 sem dependências de áudio e o modo de voz falhou antes de gravar. Posteriormente foi preparado um ambiente separado, descrito abaixo; nenhum item físico foi concluído por essa preparação.

As correções A1–A7 foram implementadas e testadas em simulação após a auditoria; isso não conclui os testes reais abaixo. A seleção e a validação do dispositivo de áudio ainda são necessárias.

Um ambiente isolado `.venv/voice312` foi preparado com Python 3.12 e dependências de voz; o diagnóstico e `pip check` passaram. O ambiente padrão anterior continua sem essas dependências; o serviço precisa ser configurado para usar o executável desejado. Importações aprovadas não validam o microfone nem o modelo reais. O serviço integra captura manual e confirmação de comandos, com testes simulados; isso não substitui os testes reais.

- [ ] **Disponibilizar o computador e a Ui24R.** Precisaremos ligá-los por rede e, para testar o áudio multicanal, por USB. Os testes devem ocorrer fora de uma apresentação, em um canal apropriado.
- [ ] **Identificar a montagem usada no teste.** Juntos vamos registrar o firmware da mesa, o driver e ao menos um microfone com sua entrada física e canal. Não é preciso descobrir tudo antecipadamente.
- [ ] **Conferir os caminhos cadastrados com o técnico.** A implementação permite registrar mesa, medusa, pontos, conexões e patch declarado; ainda será preciso conferir ligações, direção, entradas, saídas e retornos na montagem real antes de confiar nos registros.
- [ ] **Falar frases de teste e avaliar a espera.** Vamos medir o tempo e comparar modelos; você nos ajuda a decidir se o atraso e o reconhecimento são aceitáveis.
- [ ] **Conferir o áudio USB.** Acompanhar o teste de uma e depois duas fontes, inclusive com um canal mutado, para validar números de entrada e comportamento real.
- [ ] **Validar conexão e recuperação.** Reiniciar o computador, ligar a mesa depois e acompanhar os testes de queda e retorno da rede e da USB.
- [ ] **Experimentar inicialização após o login.** A instalação no Agendador foi preparada e testada apenas por simulação; será necessário instalá-la explicitamente, reiniciar e verificar processo, eventual janela e disponibilidade do áudio.
- [ ] **Conferir cadastro e recuperação.** Com dados de exemplo, conferir os vínculos e restaurar um backup para pasta separada antes de depender deles no uso real.
- [ ] **Experimentar o menu no computador da igreja.** As telas de cadastro, relações e operação já têm cobertura parcial; percorrer os fluxos disponíveis com dados de exemplo e avaliar nomes, mensagens, navegação e cancelamento. Isso valida usabilidade no ambiente, não a ligação física ou os comandos na mesa. A expansão do catálogo e outras ações seguem no plano.
- [ ] **Conferir as funções da mesa.** Com o técnico, validar gradualmente canais, auxiliares, grupos de mute, roteamento e cues/snapshots que a integração conseguir oferecer.
- [ ] **Avaliar a escala de fader.** Em canal apropriado, conferir com o técnico a conversão provisória de 0 a 100, o limite de −60 a 0 dB e os ajustes absolutos e relativos; os testes atuais são simulados.
- [ ] **Validar os caminhos de resposta falada.** Identificar o canal digital mapeado ao RCA do computador, conferir cada AUX e quem o compartilha, e testar o isolamento dos retornos e das caixas principais com o técnico.
- [ ] **Conferir a quantidade de AUX da instalação.** A quantidade agora é configurada no SQLite pelo terminal; sua montagem foi informada como oito saídas de retorno. Verificar com o técnico a capacidade e o mapeamento efetivos antes de confirmar a configuração para uso real.
- [ ] **Definir e medir limite de volume do PA.** Escolher com o técnico um limite seguro para os testes em ensaio/passagem; o comportamento audível depende de toda a cadeia, e um número isolado não comprova volume seguro.

Essas atividades podem ser preparadas e parcialmente testadas por simulação antes; só a validação real fica pendente até termos o equipamento e sua participação.

## Decidir quando chegarmos à etapa

- [x] **Informar como o Windows inicia.** O usuário confirmou que o desktop abre automaticamente. A instalação e o teste de reinício e acesso ao áudio ainda estão pendentes.
- [ ] **Definir o microfone master e o dirigente.** Informar as entradas que serão usadas e quem pode mudar entre passagem e culto.
- [ ] **Escolher o modo após reinício.** O aplicativo deve recuperar o último modo ou aguardar uma escolha?
- [ ] **Definir limites e permissões.** Decidir quem pode ajustar retornos, master, roteamento e configurações, e quais ações precisam de confirmação.
- [ ] **Validar os cadastros da equipe.** Conferir integrantes, fontes, microfones, medusa e retornos quando a funcionalidade estiver disponível.
- [ ] **Concluir configuração da LLM real.** Gemini, OpenAI e Anthropic foram integrados com transporte simulado; seleção persistente e limite diário local de tentativas não estabelecem limite financeiro. Ainda é necessário definir modelos, autenticação, privacidade, limites de custo no provedor e credenciais para testes reais; o painel segue pendente. Não enviar chave pelo chat nem incluí-la no repositório.
- [ ] **Testar o Holyrics.** Disponibilizar uma programação e um gatilho de teste e confirmar se o evento acontece no momento esperado, inicialmente sem alterar a mesa.
- [ ] **Decidir sobre acesso do painel pela rede.** O painel inicial é restrito ao computador local; informar quais pessoas e dispositivos precisariam acessá-lo antes de definir autenticação, permissões e proteção da conexão. A apresentação em navegador real ainda precisa ser conferida.

## Histórico de respostas e testes

Registre aqui decisões ou resultados curtos, com data, e coloque detalhes técnicos e evidências no plano. Não inclua senhas, chaves, tokens ou outros dados sensíveis: o repositório é público.

| Data | Decisão ou resultado | Detalhes |
| --- | --- | --- |
| 16/11/2026 | Voz e execução de comandos na mesa foram validadas pelo usuário no protótipo. | A medição de latência e os testes multicanal ainda estão pendentes. |
| 17/11/2026 | Auditoria local executada, sem novo teste físico. | Testes automatizados aprovados não substituem a validação de mesa, voz, USB e reinício. O modo de voz não iniciou no ambiente virtual atual por ausência de dependências; preparação e correções técnicas estão no plano. |
| 17/11/2026 | Resposta falada individual desejada; alternativa no PA automática e limitada em ensaio/passagem. | No culto, se o retorno individual não estiver disponível, mostrar a resposta no terminal. Implementação e validação física pendentes. |
