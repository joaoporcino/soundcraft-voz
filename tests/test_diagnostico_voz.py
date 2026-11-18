import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location(
    "diagnostico_voz", Path(__file__).resolve().parents[1] / "scripts" / "diagnostico_voz.py"
)
diagnostico = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostico)


def test_diagnostico_sucesso_sem_inicializar_audio():
    chamadas = []
    output = io.StringIO()

    def importar(nome):
        chamadas.append(nome)
        return SimpleNamespace(__version__="teste")

    assert diagnostico.diagnosticar(importar, output) == 0
    assert chamadas == ["numpy", "sounddevice", "faster_whisper"]
    assert "microfone e modelo ainda não foram testados" in output.getvalue()


def test_diagnostico_continua_apos_erros_de_importacao_e_nativos():
    output = io.StringIO()

    def importar(nome):
        if nome == "numpy":
            raise ModuleNotFoundError("numpy ausente")
        if nome == "sounddevice":
            raise OSError("biblioteca nativa ausente")
        return SimpleNamespace()

    assert diagnostico.diagnosticar(importar, output) == 1
    texto = output.getvalue()
    assert "ModuleNotFoundError: numpy ausente" in texto
    assert "OSError: biblioteca nativa ausente" in texto
    assert "OK: faster_whisper" in texto
    assert "requirements.txt" in texto
