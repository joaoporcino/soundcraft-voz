import importlib.util
import math
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace


def test_cli_transcribes_with_simulated_audio_and_model(monkeypatch, capsys):
    calls = {}

    class FakeArray(list):
        def __pow__(self, exponent):
            return FakeArray(value**exponent for value in self)

    fake_numpy = ModuleType("numpy")
    fake_numpy.asarray = FakeArray
    fake_numpy.mean = lambda values: sum(values) / len(values)
    fake_numpy.sqrt = math.sqrt
    fake_numpy.squeeze = lambda values: values
    fake_numpy.exp = math.exp

    fake_audio = ModuleType("sounddevice")
    fake_audio.default = SimpleNamespace(hostapi=0, device=(4, None))
    fake_audio.query_devices = lambda: []
    fake_audio.rec = lambda frames, **kwargs: (
        calls.update(frames=frames, recording_options=kwargs) or [0.1, -0.1]
    )
    fake_audio.wait = lambda: None

    class FakeWhisperModel:
        def __init__(self, model_name, **kwargs):
            calls["model"] = (model_name, kwargs)

        def transcribe(self, audio, **kwargs):
            calls["transcription"] = (audio, kwargs)
            return [
                SimpleNamespace(text="  teste de voz  ", start=0.0, end=1.0, avg_logprob=-0.1)
            ], None

    fake_whisper = ModuleType("faster_whisper")
    fake_whisper.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "numpy", fake_numpy)
    monkeypatch.setitem(sys.modules, "sounddevice", fake_audio)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper)
    monkeypatch.setattr(sys, "argv", ["transcribe.py", "--device", "4", "--descrever"])

    source = Path(__file__).parents[1] / "src" / "transcribe.py"
    spec = importlib.util.spec_from_file_location("transcribe_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()

    captured = capsys.readouterr()
    assert captured.out.strip() == "teste de voz"
    assert "RMS = 0.1000" in captured.err
    assert calls["model"] == ("small", {"device": "cpu", "compute_type": "int8"})
    assert calls["frames"] == 5 * 16000
    assert calls["recording_options"] == {
        "samplerate": 16000,
        "mapping": [1],
        "device": 4,
        "dtype": "float32",
    }
    assert calls["transcription"][1] == {
        "language": "pt",
        "beam_size": 5,
        "vad_filter": True,
    }
