import importlib.util
import io
import json
import math
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


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
    monkeypatch.setattr(sys, "argv", ["transcribe.py", "--device", "0", "--descrever"])

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
    assert captured.err.count("[Microfone]: Usando dispositivo 0") == 1
    assert calls["recording_options"] == {
        "samplerate": 16000,
        "mapping": [1],
        "device": 0,
        "dtype": "float32",
    }
    assert calls["transcription"][1] == {
        "language": "pt",
        "beam_size": 5,
        "vad_filter": True,
    }


def test_worker_reuses_model_and_returns_error_then_accepts_next_request(monkeypatch, capsys):
    calls = {"models": 0, "recordings": 0, "transcriptions": 0}

    class FakeArray(list):
        pass

    fake_numpy = ModuleType("numpy")
    fake_numpy.asarray = FakeArray
    fake_numpy.mean = lambda values: sum(values) / len(values)
    fake_numpy.sqrt = math.sqrt
    fake_numpy.squeeze = lambda values: values
    fake_numpy.exp = math.exp

    fake_audio = ModuleType("sounddevice")
    fake_audio.default = SimpleNamespace(hostapi=0, device=(0, None))
    fake_audio.query_devices = lambda: [
        {"name": "Microfone", "hostapi": 0, "max_input_channels": 2}
    ]
    fake_audio.rec = lambda *args, **kwargs: (
        calls.update(recordings=calls["recordings"] + 1, recording_options=kwargs) or [0.1, -0.1]
    )
    fake_audio.wait = lambda: None

    class FakeWhisperModel:
        def __init__(self, model_name, **kwargs):
            calls["models"] += 1
            calls["model_options"] = (model_name, kwargs)

        def transcribe(self, audio, **kwargs):
            calls["transcriptions"] += 1
            if calls["transcriptions"] == 1:
                raise RuntimeError("dispositivo ocupado")
            return [SimpleNamespace(text=" retorno válido ")], None

    fake_whisper = ModuleType("faster_whisper")
    fake_whisper.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "numpy", fake_numpy)
    monkeypatch.setitem(sys.modules, "sounddevice", fake_audio)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper)
    monkeypatch.setattr(
        sys,
        "argv",
        ["transcribe.py", "--worker", "--model", "base", "--channel", "2"],
    )
    monkeypatch.setattr(
        sys,
        "stdin",
        io.StringIO('{"type":"transcribe","id":"a"}\n{"type":"transcribe","id":"b"}\n'),
    )

    source = Path(__file__).parents[1] / "src" / "transcribe.py"
    spec = importlib.util.spec_from_file_location("transcribe_worker_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()

    captured = capsys.readouterr()
    messages = [json.loads(line) for line in captured.out.splitlines()]
    assert messages == [
        {"type": "ready", "version": 1, "device": [0, "Microfone", 0, 2]},
        {"type": "error", "id": "a", "message": "dispositivo ocupado"},
        {"type": "result", "id": "b", "text": "retorno válido"},
    ]
    assert calls == {
        "models": 1,
        "recordings": 2,
        "transcriptions": 2,
        "model_options": ("base", {"device": "cpu", "compute_type": "int8"}),
        "recording_options": {
            "samplerate": 16000,
            "mapping": [2],
            "device": 0,
            "dtype": "float32",
        },
    }
    assert "dispositivo ocupado" in captured.err


def test_worker_handles_eof_without_extra_stdout(monkeypatch, capsys):
    fake_numpy = ModuleType("numpy")
    fake_audio = ModuleType("sounddevice")
    fake_audio.default = SimpleNamespace(device=(0, None))
    fake_audio.query_devices = lambda: [
        {"name": "Microfone", "hostapi": 0, "max_input_channels": 2}
    ]
    fake_whisper = ModuleType("faster_whisper")
    fake_whisper.WhisperModel = lambda *args, **kwargs: object()
    monkeypatch.setitem(sys.modules, "numpy", fake_numpy)
    monkeypatch.setitem(sys.modules, "sounddevice", fake_audio)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper)
    monkeypatch.setattr(sys, "argv", ["transcribe.py", "--worker"])
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))

    source = Path(__file__).parents[1] / "src" / "transcribe.py"
    spec = importlib.util.spec_from_file_location("transcribe_eof_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()

    captured = capsys.readouterr()
    assert json.loads(captured.out) == {
        "type": "ready",
        "version": 1,
        "device": [0, "Microfone", 0, 2],
    }


def test_worker_rejects_changed_device_and_does_not_transcribe_again(monkeypatch, capsys):
    fake_numpy = ModuleType("numpy")
    fake_audio = ModuleType("sounddevice")
    fake_audio.default = SimpleNamespace(device=(0, None))
    first = {"name": "Mic original", "hostapi": 0, "max_input_channels": 2}
    second = {"name": "Outro mic", "hostapi": 0, "max_input_channels": 2}
    readings = iter([[first], [first], [second]])
    fake_audio.query_devices = lambda: next(readings)
    fake_whisper = ModuleType("faster_whisper")
    fake_whisper.WhisperModel = lambda *args, **kwargs: object()
    monkeypatch.setitem(sys.modules, "numpy", fake_numpy)
    monkeypatch.setitem(sys.modules, "sounddevice", fake_audio)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper)
    source = Path(__file__).parents[1] / "src" / "transcribe.py"
    spec = importlib.util.spec_from_file_location("transcribe_changed_device", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    captures = []
    monkeypatch.setattr(
        module, "transcribe_once", lambda *args: captures.append(1) or "texto antigo"
    )
    monkeypatch.setattr(
        sys, "stdin", io.StringIO('{"type":"transcribe","id":1}\n{"type":"transcribe","id":2}\n')
    )
    assert (
        module.run_worker(
            SimpleNamespace(
                device=None, model="small", channel=1, descrever=False, fim_por_silencio=False
            )
        )
        == 1
    )
    output = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert output[0] == {"type": "ready", "version": 1, "device": [0, "Mic original", 0, 2]}
    assert output[1]["type"] == "error" and output[1]["fatal"] is True
    assert captures == [1]
    assert len(output) == 2


def test_worker_rejects_default_device_changed_before_capture(monkeypatch, capsys):
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, [])
    first = {"name": "Mic A", "hostapi": 0, "max_input_channels": 2}
    second = {"name": "Mic B", "hostapi": 0, "max_input_channels": 2}
    fake_audio.query_devices = lambda: [first, second]
    module.WhisperModel = lambda *args, **kwargs: object()

    def switched_model(*args, **kwargs):
        fake_audio.default.device = (1, None)
        return "não deve capturar"

    # Alterar padrão após a primeira consulta, antes do pedido.
    original_identity = module.audio_device_identity
    count = []

    def identity(*args):
        if count:
            fake_audio.default.device = (1, None)
        count.append(1)
        return original_identity(*args)

    monkeypatch.setattr(module, "audio_device_identity", identity)
    monkeypatch.setattr(module, "transcribe_once", switched_model)
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"type":"transcribe","id":1}\n'))
    assert (
        module.run_worker(
            SimpleNamespace(
                device=None, model="small", channel=1, descrever=False, fim_por_silencio=False
            )
        )
        == 1
    )
    output = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert output[1]["fatal"] is True
    assert len(count) == 2


def test_worker_device_error_requires_new_start_without_repeating(monkeypatch, capsys):
    module, _ = _load_module_with_audio_fakes(monkeypatch, [])
    module.WhisperModel = lambda *args, **kwargs: object()
    captures = []

    def unavailable(*args):
        captures.append(1)
        raise OSError("USB removido")

    monkeypatch.setattr(module, "transcribe_once", unavailable)
    monkeypatch.setattr(
        sys, "stdin", io.StringIO('{"type":"transcribe","id":1}\n{"type":"transcribe","id":2}\n')
    )
    args = SimpleNamespace(
        device=None, model="small", channel=1, descrever=False, fim_por_silencio=False
    )
    assert module.run_worker(args) == 1
    output = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert output[1]["fatal"] is True
    assert len(output) == 2
    assert captures == [1]


def test_device_identity_refuses_missing_ambiguous_and_short_channel(monkeypatch):
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, [])
    first = {"name": "Mic", "hostapi": 0, "max_input_channels": 2}
    fake_audio.query_devices = lambda: [first, dict(first)]
    with pytest.raises(module.AudioDeviceChanged, match="ambígua"):
        module.audio_device_identity(0, 1)
    with pytest.raises(module.AudioDeviceChanged, match="ambíguo"):
        module.audio_device_identity("Mic", 1)
    fake_audio.query_devices = lambda: [first]
    with pytest.raises(module.AudioDeviceChanged, match="Canal"):
        module.audio_device_identity(0, 3)
    fake_audio.default.device = (5, None)
    with pytest.raises(module.AudioDeviceChanged, match="indisponível"):
        module.audio_device_identity(None, 1)
    fake_audio.query_devices = lambda: (_ for _ in ()).throw(OSError("driver"))
    with pytest.raises(module.AudioDeviceChanged, match="verificar"):
        module.audio_device_identity(0, 1)


def simulated_runtime():
    return textwrap.dedent(
        """
        import runpy, sys, types
        np = types.ModuleType('numpy')
        np.squeeze = lambda audio: audio
        sys.modules['numpy'] = np
        sd = types.ModuleType('sounddevice')
        sd.default = types.SimpleNamespace(device=(0, None))
        sd.query_devices = lambda: [{'name': 'Microfone', 'hostapi': 0, 'max_input_channels': 2}]
        sd.rec = lambda *args, **kwargs: [0.1]
        sd.wait = lambda: None
        sys.modules['sounddevice'] = sd
        fw = types.ModuleType('faster_whisper')
        class Model:
            def __init__(self, *args, **kwargs):
                print('MODELO CARREGADO', file=sys.stderr)
            def transcribe(self, *args, **kwargs):
                return [types.SimpleNamespace(text='canal três')], None
        fw.WhisperModel = Model
        sys.modules['faster_whisper'] = fw
        path = sys.argv[1]
        sys.argv = [path, '--worker']
        runpy.run_path(path, run_name='__main__')
        """
    )


def test_worker_protocol_in_real_python_subprocess():
    script = Path(__file__).parents[1] / "src" / "transcribe.py"
    result = subprocess.run(
        [sys.executable, "-c", simulated_runtime(), str(script)],
        input='{"type":"transcribe","id":1}\n{"type":"transcribe","id":2}\n',
        capture_output=True,
        encoding="utf-8",
        timeout=10,
        check=True,
    )
    messages = [json.loads(line) for line in result.stdout.splitlines()]
    assert messages == [
        {"type": "ready", "version": 1, "device": [0, "Microfone", 0, 2]},
        {"type": "result", "id": 1, "text": "canal três"},
        {"type": "result", "id": 2, "text": "canal três"},
    ]
    assert result.stderr.count("MODELO CARREGADO") == 1


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js não disponível")
def test_node_voice_worker_talks_to_python_worker():
    root = Path(__file__).parents[1]
    script = root / "src" / "transcribe.py"
    node_program = textwrap.dedent(
        """
        import { VoiceWorker } from './src/voice-worker.js';
        const worker = new VoiceWorker({
          python: process.argv[1],
          args: ['-c', process.argv[2], process.argv[3]],
          onStderr: () => {},
          startupTimeoutMs: 5000,
          requestTimeoutMs: 5000,
        });
        try {
          await worker.start();
          console.log(JSON.stringify([await worker.transcribe(), await worker.transcribe()]));
        } finally {
          await worker.close();
        }
        """
    )
    result = subprocess.run(
        [
            shutil.which("node"),
            "--input-type=module",
            "-e",
            node_program,
            sys.executable,
            simulated_runtime(),
            str(script),
        ],
        cwd=root,
        capture_output=True,
        encoding="utf-8",
        timeout=20,
        check=True,
    )
    assert json.loads(result.stdout) == ["canal três", "canal três"]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js não disponível")
def test_simulated_audio_reaches_assignment_interpreter():
    root = Path(__file__).parents[1]
    script = root / "src" / "transcribe.py"
    runtime = simulated_runtime().replace("text='canal três'", "text='microfone amarelo para Ana'")
    node_program = textwrap.dedent(
        """
        import { VoiceWorker } from './src/voice-worker.js';
        import { analyzeVoiceAssignment } from './src/voice-assignment-parser.js';
        const worker = new VoiceWorker({ python: process.argv[1],
          args: ['-c', process.argv[2], process.argv[3]], onStderr: () => {},
          startupTimeoutMs: 5000, requestTimeoutMs: 5000 });
        try {
          await worker.start();
          const phrase = await worker.transcribe();
          console.log(JSON.stringify(analyzeVoiceAssignment({ authorized: true, sessionId: 1,
            origin: 'principal', phrase, sessions: [{id: 1}], people: [{id: 2, name: 'Ana'}],
            equipment: [{id: 3, kind: 'microfone', color: 'amarelo'}],
            points: [{id: 10, type: 'equipment', equipmentId: 3},
              {id: 11, type: 'channel', channel: 7}],
            links: [{sessionId: 1, fromPointId: 10, toPointId: 11,
              kind: 'patch', status: 'confirmado'}], assignments: [] })));
        } finally { await worker.close(); }
        """
    )
    result = subprocess.run(
        [
            shutil.which("node"),
            "--input-type=module",
            "-e",
            node_program,
            sys.executable,
            runtime,
            str(script),
        ],
        cwd=root,
        capture_output=True,
        encoding="utf-8",
        timeout=20,
        check=True,
    )
    proposal = json.loads(result.stdout)
    assert proposal["status"] == "proposal"
    assert proposal["proposal"]["phrase"] == "microfone amarelo para Ana"
    assert proposal["proposal"]["channel"] == 7
    assert proposal["proposal"]["origin"] == "principal"


def test_worker_reconfigures_real_streams_to_utf8_but_accepts_stringio(monkeypatch):
    fake_numpy = ModuleType("numpy")
    fake_audio = ModuleType("sounddevice")
    fake_whisper = ModuleType("faster_whisper")
    fake_whisper.WhisperModel = lambda *args, **kwargs: object()
    monkeypatch.setitem(sys.modules, "numpy", fake_numpy)
    monkeypatch.setitem(sys.modules, "sounddevice", fake_audio)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper)

    source = Path(__file__).parents[1] / "src" / "transcribe.py"
    spec = importlib.util.spec_from_file_location("transcribe_encoding_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    class ReconfigurableStream:
        def __init__(self):
            self.options = None

        def reconfigure(self, **options):
            self.options = options

    stdin = ReconfigurableStream()
    stdout = ReconfigurableStream()
    stderr = ReconfigurableStream()
    monkeypatch.setattr(sys, "stdin", stdin)
    monkeypatch.setattr(sys, "stdout", stdout)
    monkeypatch.setattr(sys, "stderr", stderr)
    module.configure_worker_encoding()
    assert stdin.options == {"encoding": "utf-8", "errors": "replace"}
    assert stdout.options == {"encoding": "utf-8", "errors": "replace"}
    assert stderr.options == {"encoding": "utf-8", "errors": "replace"}

    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    monkeypatch.setattr(sys, "stdout", io.StringIO())
    monkeypatch.setattr(sys, "stderr", io.StringIO())
    module.configure_worker_encoding()


def _load_module_with_audio_fakes(monkeypatch, blocks):
    class Vector(list):
        def copy(self):
            return Vector(self)

        def __pow__(self, power):
            return Vector(value**power for value in self)

    class Matrix(list):
        def __getitem__(self, key):
            if isinstance(key, tuple):
                rows, column = key
                return Vector(row[column] for row in self[rows])
            return super().__getitem__(key)

        def copy(self):
            return Matrix(Vector(row) for row in self)

    fake_numpy = ModuleType("numpy")
    fake_numpy.asarray = lambda values: (
        Matrix(values) if values and isinstance(values[0], (list, tuple)) else Vector(values)
    )
    fake_numpy.mean = lambda values: sum(values) / len(values)
    fake_numpy.sqrt = math.sqrt
    fake_numpy.squeeze = lambda values: values
    fake_numpy.concatenate = lambda arrays: Vector(item for array in arrays for item in array)
    fake_numpy.exp = math.exp

    class FakeInputStream:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def __enter__(self):
            for block in blocks:
                self.kwargs["callback"](Matrix(block), len(block), None, None)
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    fake_audio = ModuleType("sounddevice")
    fake_audio.InputStream = FakeInputStream
    fake_audio.default = SimpleNamespace(device=(0, None))
    fake_audio.query_devices = lambda: [
        {"name": "Microfone", "hostapi": 0, "max_input_channels": 2}
    ]
    fake_audio.last_stream = None
    original_init = FakeInputStream.__init__

    def track_stream(self, **kwargs):
        original_init(self, **kwargs)
        fake_audio.last_stream = self
        self.closed = False

    def close_stream(self, exc_type, exc, traceback):
        self.closed = True
        return False

    def close(self):
        self.closed = True

    FakeInputStream.__init__ = track_stream
    FakeInputStream.__exit__ = close_stream
    FakeInputStream.close = close
    fake_whisper = ModuleType("faster_whisper")
    fake_whisper.WhisperModel = lambda *args, **kwargs: object()
    monkeypatch.setitem(sys.modules, "numpy", fake_numpy)
    monkeypatch.setitem(sys.modules, "sounddevice", fake_audio)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_whisper)
    source = Path(__file__).parents[1] / "src" / "transcribe.py"
    spec = importlib.util.spec_from_file_location("transcribe_silence_under_test", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, fake_audio


def _stereo_blocks(levels):
    return [[[0.0, level] for _ in range(1600)] for level in levels]


def test_silence_capture_detects_speech_preserves_prebuffer_and_selected_channel(monkeypatch):
    levels = [0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, _stereo_blocks(levels))
    audio = module.record_until_silence("mic", 2)
    assert len(audio) == 11 * 1600
    assert audio[:1600] == [0.0] * 1600
    assert fake_audio.InputStream


def test_silence_capture_no_speech_and_stream_closes(monkeypatch):
    blocks = _stereo_blocks([0.0] * 50)
    module, _ = _load_module_with_audio_fakes(monkeypatch, blocks)
    with pytest.raises(RuntimeError, match="Nenhuma fala"):
        module.record_until_silence(None, 2)
    assert module.sd.last_stream.closed


def test_silence_capture_enforces_twelve_second_block_limit(monkeypatch):
    module, _ = _load_module_with_audio_fakes(monkeypatch, _stereo_blocks([0.1] * 120))
    with pytest.raises(RuntimeError, match="limite de 12 segundos"):
        module.record_until_silence(None, 2)
    assert module.sd.last_stream.closed


def test_silence_capture_closes_stream_when_callback_or_context_fails(monkeypatch):
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, _stereo_blocks([0.1]))
    original_stream = fake_audio.InputStream

    class BrokenStream(original_stream):
        def __enter__(self):
            raise OSError("falha de captura")

    fake_audio.InputStream = BrokenStream
    with pytest.raises(OSError, match="falha de captura"):
        module.record_until_silence(None, 1)
    assert fake_audio.last_stream.closed


def test_silence_capture_rejects_input_overflow(monkeypatch):
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, [])
    original_stream = fake_audio.InputStream

    class OverflowStream(original_stream):
        def __enter__(self):
            self.kwargs["callback"]([[0.1]], 1, None, "input overflow")
            return self

    fake_audio.InputStream = OverflowStream
    with pytest.raises(RuntimeError, match="input overflow"):
        module.record_until_silence(None, 1)
    assert fake_audio.last_stream.closed


def test_silence_capture_times_out_if_device_stops_delivering_blocks(monkeypatch):
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, [])
    clock_values = iter([0.0, 16.0])
    with pytest.raises(RuntimeError, match="Tempo limite"):
        module.record_until_silence(None, 1, clock=lambda: next(clock_values), stream_timeout=15)
    assert fake_audio.last_stream.closed


def test_silence_capture_rejects_invalid_channel(monkeypatch):
    module, _ = _load_module_with_audio_fakes(monkeypatch, [])
    with pytest.raises(ValueError, match="canal"):
        module.record_until_silence(None, 0)


def test_worker_cli_flag_uses_selected_channel_and_keeps_ndjson(monkeypatch, capsys):
    blocks = _stereo_blocks([0.0, 0.1] + [0.0] * 8)
    module, fake_audio = _load_module_with_audio_fakes(monkeypatch, blocks)

    class Model:
        def transcribe(self, audio, **kwargs):
            return [SimpleNamespace(text="fala captada")], None

    module.WhisperModel = lambda *args, **kwargs: Model()
    monkeypatch.setattr(
        sys, "argv", ["transcribe.py", "--worker", "--fim-por-silencio", "--channel", "2"]
    )
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"type":"transcribe","id":7}\n'))
    module.main()
    output = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert output == [
        {"type": "ready", "version": 1, "device": [0, "Microfone", 0, 2]},
        {"type": "result", "id": 7, "text": "fala captada"},
    ]
    assert fake_audio.last_stream.kwargs["channels"] == 2
