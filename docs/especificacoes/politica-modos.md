## Situação atual

- Estado: Modos, configuração de entradas e master implementados.
- Integração: Serviço e terminal; configurações persistentes e início pausado, com captura manual por entrada identificada.
- Validação: Política, persistência, revogação, backup e HTTP testados sem equipamento; validação física pendente.

# Política segura de modos e microfone master

## Estado e vínculo

- **Estado:** integrada ao serviço e terminal; ver limitações de captura e validação.
- **Plano:** Fase 3 — Voz por múltiplas entradas e modos, atividade “Modos e microfone master”.
- **Revisão:** 16/11/2026.

## Problema e objetivo

### Integração atual

O serviço recebe configuração autenticada pelo terminal, persiste entradas de passagem e master e permite selecionar os três modos. Após reinício inicia pausado, pois a recuperação automática do modo ainda depende de decisão do usuário. Toda alteração de configuração ou modo invalida pedidos pendentes e transcrições tardias. Alterações são serializadas; durante gravação, pedidos são bloqueados e pendências invalidadas antecipadamente, inclusive em caso de falha. A configuração só entra em vigor depois de gravada; configuração inválida no disco impede inicialização em vez de habilitar entradas por engano. O backup versão 3 inclui a configuração, mantendo leitura das versões 1 e 2. Nenhum teste com equipamento real foi realizado.

Definir regras determinísticas e testáveis para passagem, culto e pausa, sem inferir a identidade da pessoa pela entrada de áudio e sem comandar a mesa. O início deve ser seguro: escuta pausada.

## Escopo e fora de escopo

O módulo puro mantém estado em memória, valida configuração do microfone master, decide quais entradas estão autorizadas para comandos segundo o modo e aplica transições somente quando a origem explicitamente declarada for um terminal autorizado. O serviço autentica o canal local e fornece essa origem ao módulo.

O modo culto exige microfone master configurado. A captura manual usa entrada identificada e está sujeita à política; o módulo não altera áudio nem opera a mesa. A entrada é identificador opaco, não identidade de pessoa. Testes HTTP simulados passaram; dispositivos reais permanecem pendentes.

## Comportamento e integrações

- Modos válidos: `paused`, `passage` e `worship`; estado inicial `paused`.
- Entradas habilitadas são fornecidas explicitamente pela configuração da chamada, com IDs não vazios e sem duplicatas. O master configurado precisa corresponder a uma entrada habilitada para culto.
- Em `paused`, nenhuma origem é aceita. Em `passage`, apenas entradas habilitadas para passagem são aceitas. Em `worship`, apenas o microfone master é aceito por esta primeira fatia; não há dirigente nem identidade presumida.
- Transições `setMode` exigem `origin.type === "terminal"` e autorização explícita (`authorized: true`). Origens de voz ou ausência de origem são rejeitadas.
- Tentativa de culto sem master válido é rejeitada sem alterar o modo atual. Falhas de validação também não alteram o estado.
- O módulo responde com decisão/estado e não executa, agenda nem muta operações na mesa; política de áudio não altera o áudio de nenhuma entrada.
- Mudanças retornam entradas removidas e invalidam propostas, contexto e resultados tardios do fluxo integrado.

## Critérios de aceite

- [x] Estado inicial pausado e nenhuma entrada aceita.
- [x] Configuração inválida, origem ausente/não terminal ou terminal não autorizado não alteram modo nem configuração.
- [x] Passagem aceita somente IDs configurados; culto exige master configurado e aceita somente esse ID; IDs nunca indicam identidade.
- [x] Entradas removidas são identificadas na transição; nenhuma integração com mesa ou mutação de áudio ocorre.
- [x] Testes automatizados exercitam transições válidas, rejeições, configuração inválida e entradas bloqueadas.

## Validação

Testes Node.js focados passaram para política, persistência, revogação de proposta e backup em diretórios temporários. O teste do terminal e serviço, inicialmente recusado no sandbox por loopback, passou posteriormente fora do sandbox com dependências simuladas. Não houve validação física de voz ou mesa.

## Questões abertas e decisões

- Permanecem: múltiplas entradas de captura, permissões por pessoa, dirigente e decisão sobre retomada de modo após reinício. O serviço inicia pausado.
- A escolha de quais entradas usar e qual entrada master declarar cabe ao operador; nenhum dispositivo será selecionado automaticamente.
