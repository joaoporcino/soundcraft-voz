# Diagnóstico de dependências de voz

## Situação atual

- Estado: Diagnóstico de dependências implementado.
- Integração: Comando Python independente; não abre dispositivos.
- Validação: Importações e testes simulados; não comprova áudio ou modelo real.

Relaciona-se à preparação do ambiente de voz da auditoria e às fases 0 e 1 do [plano](../plano-de-execucao.md). Antes de testar o worker real, um comando independente verifica o interpretador e tenta importar NumPy, sounddevice e faster-whisper, informando falhas inclusive de bibliotecas nativas. O diagnóstico usa apenas a biblioteca padrão para iniciar, não grava áudio, não lista dispositivos, não carrega ou baixa modelo e não se conecta à mesa. Python 3.12 é a versão indicada no procedimento; versões diferentes recebem aviso, não uma declaração de incompatibilidade.

## Aceite

- O comando apresenta executável, versão e resultado de cada importação; retorna código não zero se qualquer importação falhar.
- Erros de dependência ausente ou falha de biblioteca nativa são apresentados sem interromper a verificação das demais.
- Testes automatizados usam importações simuladas e não requerem áudio, modelo ou rede.
- A aprovação do diagnóstico não valida reconhecimento, dispositivo, modelo ou operação real. Esses testes continuam pendentes e explícitos.
