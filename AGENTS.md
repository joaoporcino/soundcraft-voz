# Regras do projeto

## Fonte de verdade

- [docs/plano-de-execucao.md](docs/plano-de-execucao.md) é a fonte principal para acompanhar o estado das entregas, tarefas, evidências e validações pendentes. [docs/arquitetura.md](docs/arquitetura.md) registra as decisões e o comportamento pretendido; `docs/suas-pendencias.md` acompanha ações e decisões que dependem do usuário.
- O código, a configuração efetiva e os resultados observados dos testes são evidências do comportamento existente. Se divergirem do plano, não presumir que a documentação comprove implementação ou validação: investigar e atualizar o plano conforme as evidências, preservando limitações e histórico; avaliar e registrar também eventuais divergências em relação à arquitetura.
- Ao atualizar uma entrega, reconciliar o resumo de estado, as tarefas, os critérios e as tabelas relacionados no plano, além das especificações e pendências pertinentes. Distinguir implementação parcial, teste automatizado ou simulado e validação em equipamento ou serviço real; registros históricos descrevem a situação da data em que foram feitos.

## Planejamento e execução

- Antes de qualquer implementação, consulte [docs/arquitetura.md](docs/arquitetura.md) e [docs/plano-de-execucao.md](docs/plano-de-execucao.md). Siga as decisões de arquitetura aplicáveis e identifique a fase, as tarefas, as dependências e os critérios de validação relacionados ao trabalho.
- Antes de cada implementação, analise também as especificações e os demais documentos relacionados para identificar possíveis conflitos com o comportamento solicitado, decisões existentes ou evidências. Se encontrar conflito, avise o usuário, explique os impactos e registre a resolução nos documentos pertinentes; peça esclarecimento apenas quando a decisão necessária não puder ser tomada com as instruções e o contexto disponíveis.
- Ao final de cada implementação, mesmo quando não houver conflito, revise e atualize sempre a documentação afetada, incluindo o plano e as especificações aplicáveis, para refletir o comportamento entregue, as evidências e as limitações. Quando algum documento revisado não precisar de alteração, não faça uma edição artificial apenas para cumprir a regra.
- Toda implementação deve passar pelo plano de execução: se o trabalho ainda não estiver contemplado ou exigir mudança de escopo, registre ou atualize no plano as tarefas e os critérios pertinentes antes de implementar. Não é necessário pedir aprovação apenas para manter o plano atualizado.
- Se uma solicitação exigir mudança de arquitetura, registre a decisão e suas implicações em `docs/arquitetura.md` e ajuste o plano antes de implementar. Instruções explícitas do usuário prevalecem sobre estas regras.
- Ao concluir o trabalho, atualize o plano com o estado e as evidências relevantes. Marque uma tarefa como concluída somente quando os critérios aplicáveis tiverem sido validados; diferencie testes simulados, automatizados e com a mesa física, e registre o que não pôde ser verificado.
- Mantenha `docs/suas-pendencias.md` atualizado quando houver decisões, ações ou testes que dependam do usuário. Marque esses itens como concluídos somente com confirmação ou evidência correspondente, mantendo-os coerentes com o plano de execução.
- Mantenha claras as distinções entre funcionalidades implementadas, decisões adotadas e possibilidades ainda não validadas.

## Especificações e automações

- Para funcionalidades relevantes, integrações ou mudanças de comportamento com impacto, crie ou atualize uma especificação em `docs/especificacoes/` antes de implementar, usando o modelo como guia. Relacione-a ao plano e mantenha seus critérios e estado coerentes com os resultados. Para alterações pequenas e de baixo impacto, registre objetivo e validação no plano sem exigir documento próprio.
- Cada especificação, exceto o próprio modelo, começa com `## Situação atual` e campos `Estado`, `Integração` e `Validação`, mantendo entregas anteriores identificadas como histórico. Na revisão da entrega, confira o texto contra código e evidências; verificações automáticas estruturais não substituem essa conferência.
- Use o CI como referência para verificações compartilhadas; hooks locais são opcionais e não substituem o CI. Crie skills apenas para procedimentos recorrentes que precisem de instruções próprias, sem duplicar as regras ou a arquitetura.

## Qualidade e validação

- Siga a estratégia de testes e avaliação de IA em `docs/arquitetura.md`. Implemente e execute verificações proporcionais ao comportamento e ao risco da mudança; priorize testes significativos sobre metas arbitrárias de cobertura.
- Use o padrão previsto: `node:test` e ESLint para Node.js; pytest e Ruff para Python; GitHub Actions para verificações automatizadas. Playwright fica para a futura interface web. Ferramentas ainda não configuradas devem ser adicionadas conforme o plano, sem presumir que já existem.
- Teste regras e fluxos com integrações simuladas; distinga esses resultados de testes com mesa, áudio, Holyrics e provedores reais. Testes que atuem em equipamento físico ou gerem custo devem ter execução explícita, não no pipeline padrão.
- Avalie voz e LLM com cenários repetíveis, incluindo ambiguidades, permissões, falhas e ações indevidas. Verifique deterministicamente ferramenta, alvo, parâmetros e regras de execução; não use uma LLM como única validação de operações.
- Antes de concluir, execute os testes e verificações aplicáveis disponíveis e registre resultados e limitações no plano. Nunca indique como validado um teste não executado.
