# Procedimento de medição da voz

Procedimento reproduzível para medir o fluxo de voz persistente sem mesa física. Relaciona-se à [Fase 1 — Voz mais responsiva](plano-de-execucao.md#fase-1--voz-mais-responsiva) e à [especificação de voz persistente](especificacoes/voz-persistente.md). Não é necessário hardware da mesa para preparar o procedimento ou desenvolver o fluxo. Para medir áudio real, é necessário um microfone; sem ele, a execução pode ser adiada sem bloquear o desenvolvimento e nenhum resultado real deve ser declarado.

## O que esta medição cobre

O procedimento mede a inicialização do worker/modelo e o tempo de cada gravação de cinco segundos mais transcrição. A gravação fixa **não detecta o fim da fala**: o tempo informado por pedido é o tempo total da janela de gravação e transcrição, não o tempo entre o fim da fala e a transcrição. Não interprete esse valor como latência pós-fala nem como evidência de detecção de silêncio.

O modo simulado é selecionado omitindo `--live`. Assim, a voz ainda usa o microfone e o Whisper configurados, mas nenhum comando é enviado à mesa. `--descrever` mostra tempos, dispositivo, nível captado, segmentos reconhecidos e a transcrição completa; trate as frases exibidas como dados sensíveis.

## Preparação

Os exemplos abaixo usam `.venv`. Nesta máquina foi preparado `.venv/voice312`; para usá-lo, substitua `.venv\Scripts\python.exe` por `.venv\voice312\Scripts\python.exe` em todos os comandos, inclusive na opção `--python` da listagem de dispositivos. Esse ambiente depende do runtime do Codex e não substitui uma instalação definitiva do Python; confirme versão e dependências antes de cada teste.

1. Use uma cópia local do projeto, Windows, Node.js 22.13 ou superior e Python **3.12**. Crie ou utilize um ambiente virtual com essa versão e instale as dependências: `.venv\Scripts\python.exe -m pip install -r requirements.txt`. Confirme a versão com `.venv\Scripts\python.exe --version`; deve informar Python 3.12.x. Se o ambiente existente usar outra versão, crie outro ambiente com Python 3.12 em vez de presumir que atualizará o interpretador existente.
2. Execute `.venv\Scripts\python.exe scripts\diagnostico_voz.py`. O diagnóstico verifica importações sem abrir microfone ou carregar modelo; consulte a [especificação](especificacoes/diagnostico-voz.md). Se falhar, corrija as dependências no interpretador exibido. Um resultado positivo não valida o áudio nem o Whisper real. Instale as dependências Node do projeto se ainda não estiverem instaladas (`npm install`).
3. Escolha um cômodo silencioso e use o mesmo microfone, posição, ganho, canal e distância em todas as repetições. Feche programas que possam disputar o microfone. Não conecte nem controle a mesa para este procedimento.
4. Opcionalmente liste dispositivos com `npm start -- --listar-dispositivos --python .venv\Scripts\python.exe`, substituindo o caminho pelo interpretador escolhido. Registre o identificador e escolha explicitamente o mesmo dispositivo e canal para todas as rodadas. O canal padrão é 1.
5. Defina antecipadamente ao menos cinco frases curtas em português, representativas dos comandos que se pretende reconhecer. Repita cada frase literalmente em todas as rodadas, no mesmo ritmo e volume. Inclua nomes/números relevantes se isso fizer parte do uso esperado. Não use fala de terceiros sem consentimento.
6. Registre o ambiente: data, computador/processador, memória, versão do Windows, versão de Node e Python, modelo Whisper, dispositivo/canal, condições do cômodo e se o modelo já estava baixado. Registre também se o processo começou frio (modelo não carregado nesta execução) ou se a rodada mede pedidos consecutivos no mesmo processo.

Na primeira execução, o faster-whisper pode baixar o modelo escolhido. Esse download e a inicialização subsequente podem afetar o tempo inicial. Registre essa condição; não compare uma inicialização com download a outra sem download como se fossem equivalentes.

## Execução

1. No terminal, inicie em modo simulado e descritivo, sem `--live`:

   ```powershell
   npm start -- --descrever --modelo small --python .venv\Scripts\python.exe
   ```

   Para um dispositivo específico, acrescente `--dispositivo ID --canal-audio N`, usando o identificador e canal registrados. Mantenha exatamente os mesmos argumentos durante uma comparação.

2. Espere aparecer `Reconhecimento de voz pronto.` Anote o valor `Inicialização da voz` exibido como tempo de inicialização. Ele mede a espera do cliente até o worker ficar pronto, incluindo o carregamento do modelo nessa execução.
3. Para cada frase planejada, pressione Enter e diga a frase uma vez durante a gravação de cinco segundos. Aguarde o resultado antes de iniciar a próxima. Faça no mínimo cinco pedidos por configuração e mantenha-os no mesmo processo para observar o primeiro e os seguintes.
4. Para cada pedido, anote `Gravação e transcrição`, a frase esperada, a transcrição completa, se foi reconhecida corretamente e observações de falha/áudio baixo. A saída detalhada do Whisper é evidência auxiliar; seu percentual de confiança por segmento não é uma taxa de acerto calibrada.
5. Ao terminar, digite `sair`. Não interrompa o processo entre os pedidos consecutivos da mesma rodada.
6. Repita a rodada em condições comparáveis para cada modelo ou configuração que queira comparar. Uma comparação de configuração deve manter frases, microfone, canal, ambiente e procedimento iguais; registre qualquer diferença.

## Registro por pedido

Copie uma tabela por rodada/configuração. Não preencha resultados presumidos: use os tempos que o terminal realmente mostrar. Acrescente linhas para todas as repetições, com pelo menos cinco.

| Rodada | Pedido | Frase esperada (ID ou texto consentido) | Tempo gravação + transcrição (s) | Transcrição correta? | Erro/observação |
| --- | ---: | --- | ---: | --- | --- |
|  | 1 |  |  |  |  |
|  | 2 |  |  |  |  |
|  | 3 |  |  |  |  |
|  | 4 |  |  |  |  |
|  | 5 |  |  |  |  |

| Configuração | Data/ambiente | Python | Modelo | Dispositivo/canal | Inicialização (s) | N pedidos | Mediana (s) | Maior (s) | Acertos / total (%) | Falsos reconhecimentos |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
|  |  | 3.12.x |  |  |  |  |  |  |  |  |

Calcule a mediana e o maior tempo a partir dos pedidos registrados. Calcule o percentual como `acertos ÷ total × 100`; classifique como correto somente quando a transcrição preserva o conteúdo necessário ao comando, incluindo alvo, ação e valor quando aplicáveis. Conte separadamente transcrição vazia, erro de captura/transcrição e conteúdo incorreto. Registre falsos reconhecimentos (fala captada como frase/comando quando não era a frase esperada), incluindo qualquer fala durante intervalos sem enunciação. Não infira falsos reconhecimentos se não observou uma condição adequada para medi-los: escreva “não medido”.

## Comparação e interpretação

- Compare primeiro o processo persistente ao baseline do protótipo anterior somente se houver dados anteriores com frases, modelo, equipamento, canal e condições suficientemente comparáveis. Registre a fonte desses valores. Se não houver baseline, escreva “baseline anterior indisponível”; não fabrique nem estime números.
- Para avaliar a reutilização, identifique separadamente a inicialização única do processo e os pedidos 1…N do mesmo processo. Não some a inicialização a cada pedido consecutivo. Se medir reinicializações, faça outra rodada e identifique-a como tal.
- Compare modelos somente em rodadas que usem as mesmas frases e condições. Apresente todos os resultados observados, inclusive erros e rodadas incompletas; não escolha apenas a melhor execução.
- Não conclua sobre detecção de fim de fala, latência após fim da fala, desempenho em música ou múltiplos microfones com este procedimento. Esses cenários não são medidos aqui.
- A execução usa microfone e modelo reais, porém permanece em modo simulado quanto à mesa. Portanto, não valida interface física com mesa, USB multicanal, envio de comando ou comportamento em culto.

## Privacidade e armazenamento

Prefira guardar somente tempos, resultados agregados, identificadores de frases e erros. Se transcrições ou gravações forem necessárias para análise, obtenha consentimento, remova nomes e dados identificáveis, restrinja o acesso e defina quando apagar os arquivos. Não inclua áudio, transcrições pessoais, credenciais nem identificadores sensíveis no Git. Ao publicar resultados, anonimize o operador e o ambiente sem perder os dados técnicos necessários à comparação.
