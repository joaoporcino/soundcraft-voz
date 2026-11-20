## Situação atual

- Estado: Implementado para consulta e revisão local.
- Integração: Serviço local, cadastro e confirmação por capacidade local.
- Validação: Testes HTTP e DOM simulado; inspeção visual no navegador indisponível, sem equipamento real.

# Painel web local

O serviço servirá arquivos estáticos próprios em `127.0.0.1` e o terminal apresentará um link com o token no fragmento. O navegador removerá o fragmento da URL e guardará a capacidade apenas em memória. A API do painel exige o token do serviço, origem local exata em operações de alteração, e não habilita CORS ou acesso de rede. Esse mecanismo protege contra chamadas sem capacidade, mas não separa usuários locais capazes de ler o manifesto; URL e token não devem ser compartilhados. Não colocar credenciais de provedores no navegador.

O painel consulta conexão e sessões e permite visualizar cadastros e propostas da passagem, corrigir propostas de voz e de vínculo, rejeitar propostas de voz, retorno e ligação e confirmar itens revisados com o token de revisão já usado pelo terminal. Correção e rejeição pelo painel também verificam revisão na transação; para corrigir retorno ou ligação, rejeitar e cadastrar outra proposta pelo terminal. Vínculos simples não têm rejeição no modelo atual. A confirmação revalida os dados no SQLite e não comprova patch físico. O painel não envia comandos à mesa. Campos não identificados permanecem desconhecidos; dados recebidos são exibidos como texto, nunca inseridos como HTML. Erros e concorrência são visíveis.

Testes HTTP com serviço simulado verificaram token, host e origem, leituras, revisão desatualizada, correção, confirmação e rejeição. Teste de DOM simulado exercitou seleção, correção, confirmação, rejeição e exibição literal de texto suspeito. A automação de navegador não respondeu e a apresentação visual e o fluxo em navegador real, inclusive tela pequena, permanecem pendentes. Nenhum serviço de hospedagem, mesa física, microfone ou provedor pago foi usado.

O futuro reuso do catálogo e de operações comuns com o CMD é planejado em [evolução da interface](evolucao-interface-cadastros.md). Não existe paridade completa de funções nem API genérica de edição; qualquer ampliação exige implementação e validação de autenticação, origem e regras no servidor.
