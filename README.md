# Soundcraft por voz

Protótipo local de controle da Soundcraft Ui24R por voz em português. O microfone grava um comando de cinco segundos, o faster-whisper transcreve e o programa apresenta a ação para confirmação. A biblioteca comunitária [soundcraft-ui-connection](https://github.com/fmalcher/soundcraft-ui) controla a mesa; não é uma biblioteca oficial da Soundcraft.

Esta primeira versão controla **mute e fader dos canais de entrada 1 a 24 no mix principal**. Não altera ganho, phantom power, equalização, auxiliares ou master. Para reduzir mudanças inesperadas, o ajuste absoluto do fader está limitado a -60 até 0 dB. Confirme sempre a transcrição e teste inicialmente em um canal sem sinal.

## Requisitos

- Windows, Node.js 22 ou superior, Python 3.10 a 3.12, microfone e rede conectada à mesa. Python 3.14 pode não ter pacotes compatíveis; instale Python 3.12 se necessário.
- Internet para instalar dependências e baixar o modelo Whisper na primeira execução. Depois do download, a transcrição e a comunicação com a mesa são locais.

No PowerShell, na pasta do projeto:

```powershell
npm install
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Experimentar

```powershell
npm start
```

Por padrão o programa simula os comandos e não acessa a mesa. Aperte Enter, fale após aparecer “Gravando agora” e confirme com `sim`. Use `sair` para terminar. Para experimentar sem microfone nem modelo:

```powershell
npm start -- --texto
```

Exemplos de frases exatas:

- `mute o canal três`
- `desmutar canal 3`
- `ajustar canal 3 para menos 6 dB`
- `ajustar canal vinte e quatro para zero dB`

São aceitos números em algarismos ou por extenso de zero a vinte e quatro. Para outros níveis, use algarismos. O parser rejeita frases fora desses padrões, inclusive comandos múltiplos; corrija manualmente ou tente novamente se a transcrição vier diferente.

## Conectar à mesa

Conecte o computador à mesma rede da mesa, descubra o IP na configuração de rede da Ui24R e substitua o endereço abaixo:

```powershell
npm start -- --live --ip 192.168.1.100
```

É possível acrescentar `--texto` para testar a conexão sem voz ou `--modelo base` para escolher outro modelo do faster-whisper. Comandos só são enviados após a confirmação digitada; o envio não garante que a mesa tenha aplicado a alteração, portanto confira na interface oficial. O processamento de voz acontece somente após apertar Enter, sem escuta contínua. O carregamento do modelo ocorre a cada gravação e pode demorar; a latência depende do computador.

## Testes

```powershell
npm test
```

O teste automatizado cobre a interpretação dos comandos; o uso com microfone e mesa física precisa ser validado no ambiente real. Referências: [operações de canal](https://fmalcher.github.io/soundcraft-ui/buses/channel) e [faster-whisper](https://github.com/SYSTRAN/faster-whisper).
