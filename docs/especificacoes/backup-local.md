# Backup e restauração local

## Situação atual

- Estado: Backup e restauração implementados.
- Integração: CLI e cadastro SQLite; restauração exige serviço encerrado.
- Validação: Testes com diretórios temporários; recuperação no ambiente real pendente.

## Limite de leitura na restauração

Na restauração, abrir o arquivo e ler no máximo o limite permitido mais um byte, recusando entradas maiores antes de analisar ou criar o destino. A leitura deve continuar limitada mesmo se o arquivo crescer durante a operação; fechar o arquivo também em caso de erro. Testar arquivo grande, preservação do destino e restauração regular com dados temporários. Esta proteção não autentica a origem do backup.

## Estado e vínculo

- **Estado:** implementada em módulo local; correção A7 testada com bancos temporários. Restauração exige serviço encerrado; teste com mesa física não aplicável.
- **Fase ou atividade no plano:** Fase 2 — Aplicação local e conexão; atividade “Dados, atualização e backup”.
- **Data da última revisão:** 17/11/2026.

## Problema e objetivo

Permitir exportar e recuperar os dados locais do Soundcraft Voz, preservando cadastros e configurações sem confundi-los com shows, snapshots ou estado da mesa Soundcraft Ui24R.

## Escopo e fora de escopo

- Implementar módulo local em `src/backup.js` e comandos de terminal para exportar e restaurar um arquivo de backup validado.
- Abranger o banco SQLite de cadastros e a configuração local do endereço IP que hoje fica em `config.json`; inventariar formalmente o conteúdo incluído no formato.
- Incluir voz, modos e entradas de voz e, quando existir, o estado SQLite de provedor e contagem de LLM. Formato versão 5 contém seis entradas explícitas (ausentes como `null`); restauração aceita versões 1 a 4 anteriores. Backup vazio significa ausência de todas as entradas. Toda restauração, inclusive legada, bloqueia chamadas de LLM até reconhecimento explícito, pois o histórico pode ter retrocedido; não incluir chaves, transcrições ou consentimentos.
- Restaurar somente em diretório novo ou totalmente vazio, para impedir sobrescrita de cadastros, configuração ou banco em uso; rejeitar arquivos inválidos ou incompatíveis sem alterar dados existentes.
- Não realizar chamadas à mesa, alterar estado de shows/snapshots nela, importar configurações para a mesa, nem iniciar conexões ou comandos durante backup/restauração.
- Não incluir credenciais, tokens, variáveis de ambiente, gravações/modelos de áudio ou dados externos ao escopo declarado. A configuração IP não é credencial.
- Não adicionar interface gráfica nem manipular dados reais do usuário durante o desenvolvimento. Testes usam diretórios e bancos temporários. O backup reconhece schemas SQLite canônicos v1 a v6 independentemente da versão do arquivo e valida invariantes de cadastros, caminhos, vínculos de entrada e histórico de correções.

## Comportamento, formato e segurança

Correção A7: comparar o esquema com o esquema canônico do cadastro e validar invariantes de dados e conflitos antes de instalar a restauração. Cópias adulteradas com checksum válido são recusadas antes de criar o destino.

- O arquivo deve ter versão de formato, identificação do aplicativo, data de criação e conteúdo declarado; validar estrutura, versão, tipos e integridade antes de iniciar restauração. Não confiar em nomes de caminho ou conteúdo arbitrário fornecido pelo arquivo.
- Criar o snapshot SQLite de maneira consistente enquanto o banco estiver em uso usando `VACUUM INTO`, que inclui páginas confirmadas em WAL e produz um arquivo autônomo; não copiar o arquivo principal isoladamente.
- Preservar e validar a configuração separada do banco. Erros de leitura, validação, escrita, integridade ou incompatibilidade devem ser explícitos e não podem deixar restauração parcial silenciosa.
- Montar os arquivos em uma pasta temporária ao lado do destino e instalar a pasta inteira por rename. Diretório alvo não vazio é recusado, sem opção de sobrescrita. Assim, uma instalação não mistura arquivos novos e antigos; recuperação de encerramento abrupto depende de renames atômicos no mesmo volume.
- Como o destino deve estar vazio, não pode conter banco SQLite ativo ou sidecars `-wal`/`-shm`; a restauração nunca troca arquivos de um banco em uso. A restauração in-place no diretório de dados atual fica fora desta fatia.
- Não imprimir nem serializar credenciais. Os caminhos absolutos de Python ou modelo escolhidos pelo usuário são preservados como dados, mas podem não existir após restauração em outro computador; não são executados nem validados quanto à existência pelo backup e devem ser revistos antes do uso. Os índices de dispositivo também podem mudar. O arquivo de backup é portável entre diretórios e versões compatíveis; versões anteriores do aplicativo não necessariamente leem o formato 2.
- Backup do aplicativo é apenas uma cópia dos dados declarados neste contrato; não é backup dos shows ou snapshots da mesa, e sua restauração não interage com a mesa.

## Critérios de aceite

- [x] Exportar e restaurar banco v3 com quantidade configurada ou ausente; preservar backups v1/v2 e rejeitar dados inconsistentes ou schema adulterado, em diretórios temporários.

- [x] Exportar e restaurar configuração de voz válida inclusive quando for o único dado; recusar campos extras ou conteúdo inválido mesmo com checksum recalculado; restaurar versão 1 sem criar configuração de voz fictícia. Testado em diretórios temporários, inclusive backup legado vazio.
- [x] Backup gerado contém os cadastros/configuração declarados, é legível em outro diretório e passa por validação de estrutura e integridade; teste pelo terminal usa processos separados.
- [x] Banco em uso pode ser exportado de forma consistente, inclusive com SQLite/WAL, sem truncar ou omitir transações confirmadas.
- [x] Restauração válida recupera os dados declarados em ambiente temporário; qualquer destino não vazio é recusado, sem opção de sobrescrita.
- [x] Arquivo truncado, malformado, adulterado, de versão incompatível ou com SQLite inválido é recusado e deixa o estado existente intacto.
- [x] Recusar backup com checksum válido e esquema alterado que omita restrições ou contenha dados inválidos; também recusar conflitos confirmados em esquema canônico, em testes temporários.
- [x] Arquivos SQLite/WAL/SHM no destino bloqueiam restauração por a pasta não estar vazia.
- [x] A restauração instala o conjunto em uma pasta staged e renomeia a pasta; não faz substituição de arquivos individuais.
- [x] Testes confirmam ausência de interação com a mesa e de inclusão de credenciais; testes usam somente dados temporários.

## Validação

Testes automatizados `node:test` em bancos e diretórios temporários: ciclo exportar/restaurar; banco com operação confirmada em WAL e conexão aberta durante a exportação; checksum/configuração inválidos; diretório não vazio (incluindo arquivo WAL) recusado; e configuração com campo extra (credencial) recusada. ESLint foi executado nos arquivos alterados. A suíte completa também foi tentada; testes de rede local falharam por `EACCES`/timeouts no sandbox, sem relação com backup. Nenhum teste com mesa física ou dados reais foi executado.

O terminal também foi testado em processos separados; recusa backup existente e restauração sobre dados já existentes.

**Auditoria de 17/11/2026:** a suíte então existente passou nesta máquina, incluindo os testes de backup. Uma reprodução adicional, com SQLite e diretórios temporários, mostrou que esquema versão 1 com tabelas/colunas/índice esperados, porém sem restrições, foi restaurado contendo vínculo confirmado para canal 999 e referências inexistentes. O checksum foi calculado corretamente para essa cópia; não há autenticação de origem por checksum. Evidência histórica: [A7 da análise técnica](../analise-tecnica-2026-11-17.md#a7--p2-restauração-aceita-esquema-alterado-com-vínculos-inválidos). Nenhum dado real foi alterado.

**Correção posterior:** os dois cenários de esquema alterado e conflitos em esquema canônico passaram a ser recusados nos testes automatizados, que também preservam destino inexistente. O checksum continua sem autenticar origem; recuperação com dados reais permanece pendente.

**Configuração de voz:** 18 testes Node de backup, terminal e configuração aprovados; ESLint direcionado aprovado. Versão 2 inclui `voice-config.json` validado; versão 1 continua legível, inclusive rejeitando backup antigo vazio. Testes usam arquivos temporários, sem equipamentos e dados reais.

**Cadastro de retornos:** testes em diretórios temporários exportaram e restauraram banco SQLite v2 com vínculo compartilhado e também backup de formato v1 contendo schema SQLite v1. Ao abrir o banco legado restaurado, a migração para v2 preservou os cadastros. Arquivos e schemas continuam versionados separadamente.

**Configuração AUX:** testes direcionados de banco e backup aprovaram restauração de schemas v1/v2 anteriores, v3 sem configuração e v3 com quantidade explícita, além de recusar quantidade inconsistente com retorno cadastrado mesmo com checksum recalculado. A migração registra o limite legado sem afirmar validação física.

## Questões abertas e decisões

- `VACUUM INTO` foi validado localmente na versão Node.js instalada (24.21.0); a compatibilidade efetiva com o mínimo Node.js 22.13 ainda precisa ser confirmada no CI.
- Restauração não tem opção de sobrescrita nesta fatia: o destino precisa ser novo ou vazio; para recuperar o diretório atualmente usado, o serviço deve ser interrompido e o operador precisa preparar um caminho vazio separado.
- Credenciais que venham a ser introduzidas futuramente exigem decisão específica de exportação/proteção; esta especificação não autoriza exportá-las.
- Não foi simulada queda abrupta durante o rename de diretório. A restauração com mesa conectada não será exercitada: módulo não depende de nem acessa conexão com a mesa.
