"""Verifica importações de voz sem inicializar áudio ou carregar modelos."""

import importlib
import sys

DEPENDENCIAS = ("numpy", "sounddevice", "faster_whisper")


def diagnosticar(importar=importlib.import_module, output=None):
    output = output if output is not None else sys.stdout
    print(f"Python: {sys.version.split()[0]}", file=output)
    print(f"Executável: {sys.executable}", file=output)
    if sys.version_info[:2] != (3, 12):
        print("Aviso: o procedimento de voz recomenda Python 3.12.", file=output)

    falhas = 0
    for nome in DEPENDENCIAS:
        try:
            modulo = importar(nome)
            versao = getattr(modulo, "__version__", "versão não informada")
            print(f"OK: {nome} ({versao})", file=output)
        except Exception as erro:
            falhas += 1
            print(f"FALHA: {nome}: {type(erro).__name__}: {erro}", file=output)

    if falhas:
        print(
            "Revise o ambiente virtual e instale requirements.txt neste interpretador.", file=output
        )
        return 1
    print("Importações disponíveis; microfone e modelo ainda não foram testados.", file=output)
    return 0


if __name__ == "__main__":
    sys.exit(diagnosticar())
