# Regras do projeto

- Antes de qualquer implementação, consulte [docs/arquitetura.md](docs/arquitetura.md) e [docs/plano-de-execucao.md](docs/plano-de-execucao.md). Siga as decisões de arquitetura aplicáveis e identifique a fase, as tarefas, as dependências e os critérios de validação relacionados ao trabalho.
- Toda implementação deve passar pelo plano de execução: se o trabalho ainda não estiver contemplado ou exigir mudança de escopo, registre ou atualize no plano as tarefas e os critérios pertinentes antes de implementar. Não é necessário pedir aprovação apenas para manter o plano atualizado.
- Se uma solicitação exigir mudança de arquitetura, registre a decisão e suas implicações em `docs/arquitetura.md` e ajuste o plano antes de implementar. Instruções explícitas do usuário prevalecem sobre estas regras.
- Ao concluir o trabalho, atualize o plano com o estado e as evidências relevantes. Marque uma tarefa como concluída somente quando os critérios aplicáveis tiverem sido validados; diferencie testes simulados, automatizados e com a mesa física, e registre o que não pôde ser verificado.
- Mantenha `docs/suas-pendencias.md` atualizado quando houver decisões, ações ou testes que dependam do usuário. Marque esses itens como concluídos somente com confirmação ou evidência correspondente, mantendo-os coerentes com o plano de execução.
- Mantenha claras as distinções entre funcionalidades implementadas, decisões adotadas e possibilidades ainda não validadas.

## Especificações e automações

- Para funcionalidades relevantes, integrações ou mudanças de comportamento com impacto, crie ou atualize uma especificação em `docs/especificacoes/` antes de implementar, usando o modelo como guia. Relacione-a ao plano e mantenha seus critérios e estado coerentes com os resultados. Para alterações pequenas e de baixo impacto, registre objetivo e validação no plano sem exigir documento próprio.
- Use o CI como referência para verificações compartilhadas; hooks locais são opcionais e não substituem o CI. Crie skills apenas para procedimentos recorrentes que precisem de instruções próprias, sem duplicar as regras ou a arquitetura.

## Qualidade e validação

- Siga a estratégia de testes e avaliação de IA em `docs/arquitetura.md`. Implemente e execute verificações proporcionais ao comportamento e ao risco da mudança; priorize testes significativos sobre metas arbitrárias de cobertura.
- Use o padrão previsto: `node:test` e ESLint para Node.js; pytest e Ruff para Python; GitHub Actions para verificações automatizadas. Playwright fica para a futura interface web. Ferramentas ainda não configuradas devem ser adicionadas conforme o plano, sem presumir que já existem.
- Teste regras e fluxos com integrações simuladas; distinga esses resultados de testes com mesa, áudio, Holyrics e provedores reais. Testes que atuem em equipamento físico ou gerem custo devem ter execução explícita, não no pipeline padrão.
- Avalie voz e LLM com cenários repetíveis, incluindo ambiguidades, permissões, falhas e ações indevidas. Verifique deterministicamente ferramenta, alvo, parâmetros e regras de execução; não use uma LLM como única validação de operações.
- Antes de concluir, execute os testes e verificações aplicáveis disponíveis e registre resultados e limitações no plano. Nunca indique como validado um teste não executado.
