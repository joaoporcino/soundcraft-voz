## Situação atual

Rodada de 20/11/2026: variantes transacionais de revisão integram os fluxos de equipe, formação, retorno, ponto referenciado e ligação, mantendo confirmação explícita, cancelamento e recarga. Os comandos legados preservam seus contratos. Suíte compartilhada 400/400 com simulação.

- Estado: Implementado com telas de comandos, consulta e criação parcial de registros.
- Integração: Menu opcional para operações existentes do serviço local e consulta dos cadastros, usando a entrada principal nos comandos.
- Validação: Navegação, confirmação e recusa testadas com serviço simulado; consultas e criação de pessoa e equipamento exercitadas com SQLite temporário. Aparência em CMD real, áudio e mesa físicos pendentes.

# Menu interativo no terminal

**Entrega em 20/11/2026:** substituição usa variante que verifica as novas referências na mesma transação; revisão e confirmação explícita preservadas. Testes com banco temporário cobrem cancelamento, concorrência, atualização da tela e restauração; suíte Node 370/370, ESLint e verificação documental passaram. Sem validação física.

## Escopo e critérios

O menu numerado funciona no CMD e PowerShell, em tela de terminal com moldura e limpeza quando há terminal interativo, e mantém os comandos existentes. A apresentação é módulo independente, usando as operações existentes como adaptador, sem incorporar regras de negócio e sem dependência da futura interface HTML. Permite consultar e configurar IP, iniciar, consultar e parar o serviço, selecionar modo e solicitar texto ou captura manual. Encaminha operações ao serviço existente, apresenta a proposta e exige confirmação explícita antes do envio; recusa ou encerramento não confirmam. Informa que envio não comprova aplicação na mesa. Erros e indisponibilidade devem ser visíveis e permitir retorno ao menu. Testes simulados devem cobrir navegação, proposta, confirmação, recusa e encerramento sem equipamento real. Áudio, mesa, reinício e usabilidade no computador da igreja continuam pendentes.

O painel usa a biblioteca padrão do Node e sequências de terminal para limpar a tela interativa; não instala biblioteca adicional. Usa os comandos locais existentes, não executa operações de mesa diretamente. Não cobre todos os cadastros, entradas, configurações ou revisões avançadas. Rejeitar no menu significa não enviar a confirmação; não há operação de exclusão da proposta pelo menu.

## Telas de registros

Na entrega inicial de consultas (histórico), uma barra lateral de texto separou Início, Comandos e Cadastros; a escolha é feita por números no menu principal. A área de cadastros tem telas separadas para pessoas, equipamentos, sessões, grupos, papéis, dispositivos e pontos físicos e configuração de AUX. A seleção de uma sessão oferece também consultas separadas para formação, vínculos, entradas, retornos, ligações físicas e propostas de voz; a seleção de grupo permite consultar integrantes. Listas são paginadas e permitem abrir o detalhe de cada registro. As consultas chamam o adaptador de cadastro existente; não modificam registros de domínio nem controlam a mesa. A primeira consulta pode criar ou migrar o banco local conforme comportamento existente. Dados declarados e status são exibidos sem classificá-los como fisicamente verificados. Naquela entrega a edição permanecia nos comandos; as ações posteriores estão descritas abaixo.

As listas de cadastro permitem `U` para atualizar explicitamente; também recarregam ao retornar e após operações. Não há atualização contínua entre processos. Para os seis cadastros do catálogo, a tela verifica operação e formato contra contrato explícito e esquema canônico em memória antes de operar; isso não audita integralmente o banco real.

## Criação guiada

Na entrega inicial de criação (histórico), as listas de pessoas, equipamentos, sessões, grupos, papéis e dispositivos físicos passaram a oferecer formulário, permitindo cancelar antes de salvar e revisando os valores. O cadastro existente valida e persiste os dados; sucesso atualiza a lista, enquanto erro permanece visível sem afirmar que houve gravação. Naquela entrega pontos físicos, relações, edição e confirmação ainda dependiam dos comandos; as ações posteriores estão descritas abaixo. Testes usaram SQLite temporário para pessoa e equipamento e falhas simuladas, sem acessar equipamento físico.

## Evolução planejada

O menu de operação oferece escolha de sessão ativa, configuração de entradas de passagem e master e diagnóstico detalhado de voz, chamando o CLI autenticado existente. Mostra ausência de serviço e erros e informa que mudanças invalidam propostas e que reinício pode ser necessário. Consultar estado não controla a mesa nem inicia captura. Testes simulados cobrem cancelamento, encaminhamento e diagnóstico; recuperação de dispositivo e demais opções ainda têm tarefas próprias.

O menu consulta e altera um parâmetro por vez da configuração principal de voz pelo CLI próprio (`show`/`set`), com confirmação e aviso de reinício. Salvar não inicia worker nem valida dispositivo físico. Testes cobrem cancelamento, falha com adaptador simulado e persistência parcial em diretório temporário.

O menu permite texto e captura manual para entrada identificada, captura de cadastro e aceite explícito de dispositivo candidato. Mostra dados de dispositivo anterior e candidato e usa a revisão atual devolvida pelo serviço; não captura automaticamente ao aceitar. Pedido de comando mantém confirmação do serviço; captura de cadastro produz apenas proposta revisável. Testes com serviço simulado cobrem encaminhamento, cancelamento, ausência de candidato e resposta de revisão antiga.

O menu consulta e define ou remove configuração de entrada de voz adicional pelo CLI existente, com confirmação e aviso de reinício. O arquivo não tem revisão transacional entre processos e salvar não valida dispositivo físico. Testes cobrem cancelamento e encaminhamento com adaptador simulado e persistência em diretório temporário, sem iniciar worker.

A [evolução da interface](evolucao-interface-cadastros.md) define seletores e fronteiras de integração. O catálogo versão 2 fornece lista, campos de criação e rótulos de detalhe para pessoa, equipamento, sessão, grupo, papel e dispositivo físico. O menu sugere uma sequência de cadastros sem obrigar essa ordem. Na lista de vínculos da sessão, `V` abre proposta com seletores por nome, ID e contexto; `N` em um seletor abre o cadastro necessário. A proposta exige `SIM` e não confirma o vínculo. Na lista de integrantes do grupo, `I` permite adicionar pessoa; no detalhe, `R` remove integrante e `F` ou `D` adiciona ou remove função habitual, mediante confirmação. O menu usa operações existentes, sem conceder acesso genérico ao banco.

No detalhe de pessoa ou equipamento, `E` corrige o cadastro global por uma sessão de passagem, com aviso de alcance, revisão dos valores e histórico. A operação verifica a revisão anterior transacionalmente.

Na formação da sessão, `G` associa um grupo selecionado; `R` no detalhe do grupo desassocia quando não houver participações dependentes. Nenhuma dessas ações escala ou remove pessoas automaticamente.

No detalhe do grupo da formação, `I` inclui e `D` remove participantes mediante seleção e confirmação. A inclusão lista integrantes do grupo; papéis efetivos impedem remoção até serem tratados explicitamente.

Nesse detalhe, `P` atribui e `E` remove papel efetivo de um participante mediante seleção e confirmação. Funções habituais e permissões não são alteradas.

Na tela de configuração de AUX, `C` permite informar e confirmar a quantidade. O valor é declarado e não detecta a capacidade física; reduções incompatíveis são recusadas pelo cadastro.

Na lista de retornos da sessão, `N` cria um retorno após confirmação e validação do cadastro. Isso não configura roteamento ou saída física.

Na lista de pontos físicos, `N` cria ponto de canal, porta, via de medusa, equipamento, pessoa, mix, retorno ou outro. Opções avançadas seguem nos comandos; a tela não comprova ligação física e a reconsulta de referências não é transacional.

Na lista de ligações físicas da sessão, `V` propõe uma ligação com seleção de pontos e possibilidade de destino desconhecido. No detalhe, `C` confirma com revisão e origem declarada, `R` rejeita proposta e `V` revoga ligação confirmada. As três ações usam revisão transacional do vínculo, não dos dados relacionados; nenhuma comprova ligação física.

No detalhe de proposta de voz, `C` confirma com revisão, `R` rejeita e `E` corrige campos, inclusive desconhecidos. A correção verifica transacionalmente a proposta e as referências selecionadas; confirmação e rejeição revisam a proposta. A tela mostra frase e origem, não inicia captura e não comprova patch físico.

Na lista de vínculos de retorno, `V` propõe associação entre pessoa e retorno da sessão, com busca e confirmação da proposta. No detalhe, `C` confirma proposta de fonte ou retorno; em retorno, `R` rejeita proposta e `V` revoga vínculo confirmado. As ações usam revisão transacional do vínculo, não dos dados relacionados.

No detalhe de fonte proposta, `E` permite corrigir pessoa, equipamento e canal; a correção mantém a proposta pendente e verifica transacionalmente sua revisão e as referências selecionadas.

No detalhe de fonte confirmada, `S` revisa a substituição e mostra as entradas que serão desvinculadas. A operação verifica transacionalmente vínculo, entradas e referências selecionadas e cria nova proposta pendente. Tokens não autenticam, não comprovam estado físico e não detectam mudanças revertidas.

Na lista de entradas associadas da sessão, `V` associa uma entrada identificada a fonte confirmada após revisão; `R` no detalhe remove a associação mediante confirmação e verificação atômica de sua identidade. A associação não identifica o falante nem comprova ligação física.
