# Configuração local de voz do serviço

## Situação atual

- Estado: Configuração persistente de voz implementada.
- Integração: CLI e serviço; alterações exigem reinício do serviço.
- Validação: Testes simulados; microfone e modelo reais pendentes.

## Objetivo e vínculo

Fases 1 e 2 do [plano](../plano-de-execucao.md): configurar pelo terminal o Python, o modelo, o dispositivo e o canal usados pelo worker do serviço. Os valores ficam em arquivo próprio, independente do IP; o serviço já os lê ao iniciar.

## Contrato

`node src/voice-config-cli.js show` mostra a configuração efetiva; `set` aceita `--python`, `--modelo`, `--dispositivo` e `--canal` e preserva os demais valores. `--dispositivo padrao` seleciona o dispositivo padrão. Python aceita um nome de executável simples ou caminho absoluto, evitando dependência do diretório de trabalho após login. Modelo aceita identificador ou caminho absoluto; dispositivo é nome/índice textual ou padrão, e canal é inteiro positivo entre 1 e 256. Não é feita validação física dos dispositivos nem carregamento do modelo ao salvar. O índice pode mudar após reconexão e deve ser confirmado no ambiente real. O arquivo ausente usa `python`, `small`, dispositivo padrão e canal 1; não escolher automaticamente nenhum ambiente virtual do computador. Arquivo inválido gera erro, sem substituição silenciosa.

Alterações são persistidas em `voice-config.json` com arquivo temporário e renomeação, sem gravar credenciais. O serviço lê as configurações ao iniciar e deve ser reiniciado após alterações. O backup versão 2 inclui esse arquivo, e a restauração também aceita versão 1 anterior sem configuração de voz. Após restaurar em outra máquina, conferir caminhos e dispositivo antes do uso.

## Critérios e validação

- Leitura e gravação recuperam valores em processos distintos; alteração parcial preserva valores restantes.
- Entradas inválidas e arquivo malformado geram erro e não sobrescrevem configuração válida.
- API retorna objeto compatível com opções `python`, `model`, `device`, `channel` de `VoiceWorker`.
- Testes em diretórios temporários não iniciam áudio, modelo, mesa ou rede. Equipamento, caminhos e disponibilidade reais continuam pendentes.

**Resultado:** testes Node incluem leitura em outro processo e preservação de dados em erros. O serviço usa a configuração ao iniciar; disponibilidade de dispositivo e uso real continuam pendentes. A aplicação de alterações depende da reinicialização do serviço.
