# Verificação documental

## Situação atual

- Estado: implementada para a base de qualidade do [plano](../plano-de-execucao.md).
- Integração: comando local `npm run docs:check` e etapa configurada no GitHub Actions.
- Validação: comando, testes positivos e negativos e ESLint passaram localmente; execução remota do CI não verificada.

## Objetivo e escopo

Detectar erros objetivos na documentação do repositório sem depender de rede: exigir resumo estruturado nas especificações e verificar existência de destinos locais dos links Markdown inline em README, AGENTS e arquivos Markdown de docs. Excluir exemplos em blocos de código; URLs e âncoras internas não verificam conteúdo remoto ou nomes de seção. Links por referência ou HTML não são analisados; o modelo está isento dos campos obrigatórios.

## Critérios de aceite

- [x] Falhar com nome do arquivo quando faltar campo obrigatório ou destino local inline não existir; aceitar arquivos existentes, links externos e exemplos em bloco de código.
- [x] A suíte inclui casos positivos e negativos isolados em diretórios temporários.
- [x] `npm run docs:check` está configurado no CI e documentado; execução remota pendente.
- [x] Plano registra evidência local e distingue validação remota do CI.

## Limites

O verificador reconhece links inline simples; caminhos com espaços devem usar `<...>`, e caminhos com parênteses devem ser codificados como `%28` e `%29`. Não compreende significado, validade de âncoras, integração, atualização de evidências ou fidelidade com equipamentos. Revisão de comportamento continua obrigatória na entrega.
