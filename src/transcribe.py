import argparse
import json
import queue
import sys
import time
from collections import deque

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel


def resolve_device(device):
    """Converte índices de dispositivo em inteiro e preserva nomes."""
    return int(device) if device is not None and device.isdigit() else device


class AudioDeviceChanged(RuntimeError):
    """O dispositivo não pode ser identificado com segurança nesta execução."""


def audio_device_identity(device_arg, channel):
    """Identifica a descrição disponível, sem alegar identificador físico único."""
    try:
        devices = list(sd.query_devices())
        selected = sd.default.device[0] if device_arg is None else device_arg
        if isinstance(selected, str):
            matches = [i for i, item in enumerate(devices) if item.get("name") == selected]
            if len(matches) != 1:
                raise AudioDeviceChanged("Nome de dispositivo ausente ou ambíguo.")
            selected = matches[0]
        if (
            isinstance(selected, bool)
            or not isinstance(selected, int)
            or not 0 <= selected < len(devices)
        ):
            raise AudioDeviceChanged("Dispositivo de entrada indisponível.")
        item = devices[selected]
        name, api, channels = item.get("name"), item.get("hostapi"), item.get("max_input_channels")
        if (
            not isinstance(name, str)
            or not name.strip()
            or not isinstance(api, int)
            or isinstance(api, bool)
        ):
            raise AudioDeviceChanged("Descrição do dispositivo inválida.")
        if (
            not isinstance(channels, int)
            or isinstance(channels, bool)
            or channels < channel
            or channel < 1
        ):
            raise AudioDeviceChanged("Canal do dispositivo indisponível.")
        if (
            sum(
                1
                for other in devices
                if other.get("name") == name
                and other.get("hostapi") == api
                and other.get("max_input_channels") == channels
            )
            != 1
        ):
            raise AudioDeviceChanged("Descrição do dispositivo ambígua.")
        return selected, name, api, channels
    except AudioDeviceChanged:
        raise
    except Exception as exc:
        raise AudioDeviceChanged("Não foi possível verificar o dispositivo de entrada.") from exc


def audio_rms(audio):
    """Calcula RMS de áudio capturado em qualquer formato compatível com NumPy."""
    return float(np.sqrt(np.mean(np.asarray(audio) ** 2)))


def record_until_silence(device_arg, channel, clock=time.monotonic, stream_timeout=15.0):
    """Captura fala por blocos; limiar RMS inicial experimental: 0.002."""
    if channel < 1:
        raise ValueError("O canal de áudio deve ser maior ou igual a 1.")
    sample_rate = 16000
    block_frames = sample_rate // 10
    channel_count = channel
    speech_threshold = 0.002
    no_speech_blocks = 50
    silence_blocks = 8
    max_blocks = 120
    prebuffer = deque(maxlen=3)
    blocks = queue.Queue(maxsize=200)
    audio_blocks = []
    speech_started = False
    quiet_count = 0
    seen_blocks = 0
    overflow = False
    capture_status = None
    ended_by_silence = False
    deadline = clock() + stream_timeout

    def callback(indata, frames, time_info, status):
        nonlocal overflow, capture_status
        if status:
            capture_status = str(status)
        try:
            blocks.put_nowait(indata.copy())
        except queue.Full:
            overflow = True

    stream = sd.InputStream(
        samplerate=sample_rate,
        blocksize=block_frames,
        device=device_arg,
        channels=channel_count,
        dtype="float32",
        callback=callback,
    )
    try:
        with stream:
            while seen_blocks < max_blocks:
                if overflow:
                    raise RuntimeError("A captura de áudio excedeu a fila de blocos.")
                if capture_status:
                    raise RuntimeError(f"Falha de captura de áudio: {capture_status}")
                remaining = deadline - clock()
                if remaining <= 0:
                    raise RuntimeError("Tempo limite aguardando blocos de áudio.")
                try:
                    block = blocks.get(timeout=min(0.1, remaining))
                except queue.Empty:
                    continue
                seen_blocks += 1
                channel_audio = np.asarray(block)[:, channel - 1]
                level = audio_rms(channel_audio)
                if not speech_started:
                    prebuffer.append(channel_audio.copy())
                    if level >= speech_threshold:
                        speech_started = True
                        audio_blocks.extend(prebuffer)
                        quiet_count = 0
                    elif seen_blocks >= no_speech_blocks:
                        raise RuntimeError("Nenhuma fala detectada em 5 segundos.")
                    continue
                audio_blocks.append(channel_audio.copy())
                if level < speech_threshold:
                    quiet_count += 1
                    if quiet_count >= silence_blocks:
                        ended_by_silence = True
                        break
                else:
                    quiet_count = 0
    finally:
        stream.close()
    if not speech_started:
        raise RuntimeError("Nenhuma fala detectada em 5 segundos.")
    if not ended_by_silence:
        raise RuntimeError("Gravação excedeu o limite de 12 segundos sem pausa suficiente.")
    return np.concatenate(audio_blocks)


def transcribe_once(model, device_arg, channel, describe=False, fim_por_silencio=False):
    """Grava e transcreve uma solicitação usando o modelo já carregado."""
    if describe:
        print(
            f"[Microfone]: Usando dispositivo "
            f"{'Padrão do Windows' if device_arg is None else device_arg}, "
            f"canal de áudio {channel}",
            file=sys.stderr,
            flush=True,
        )
    if fim_por_silencio:
        print("Gravando até o fim da fala...", file=sys.stderr, flush=True)
        audio = record_until_silence(device_arg, channel)
    else:
        print("Gravando agora (5 segundos)...", file=sys.stderr, flush=True)
        audio = sd.rec(
            5 * 16000, samplerate=16000, mapping=[channel], device=device_arg, dtype="float32"
        )
        sd.wait()

    if describe:
        rms = audio_rms(audio)
        status_audio = (
            "som captado com sucesso"
            if rms >= 0.002
            else "atenção: volume muito baixo ou sem sinal"
        )
        print(f"[Nível de áudio]: RMS = {rms:.4f} ({status_audio})", file=sys.stderr, flush=True)

    print("Transcrevendo...", file=sys.stderr, flush=True)
    segments, _ = model.transcribe(np.squeeze(audio), language="pt", beam_size=5, vad_filter=True)
    collected = []
    for segment in segments:
        txt = segment.text.strip()
        if txt:
            collected.append(txt)
            if describe:
                conf = float(100 * np.exp(segment.avg_logprob))
                print(
                    f"[Whisper ouviu {segment.start:.1f}s - {segment.end:.1f}s]: "
                    f'"{txt}" (confiança: {conf:.1f}%)',
                    file=sys.stderr,
                    flush=True,
                )
    final_text = " ".join(collected).strip()
    if describe and not final_text:
        print("[Whisper]: Nenhuma fala identificada no áudio.", file=sys.stderr, flush=True)
    return final_text


def emit_worker_message(message):
    print(json.dumps(message, ensure_ascii=False), flush=True)


def configure_worker_encoding():
    """Força UTF-8 nos streams reais do console, sem exigir isso de streams de teste."""
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def run_worker(args):
    """Protocolo NDJSON persistente; stdout é reservado às mensagens do protocolo."""
    configure_worker_encoding()
    device_arg = resolve_device(args.device)
    print(
        "Carregando modelo Whisper; na primeira vez pode ser necessário baixá-lo...",
        file=sys.stderr,
        flush=True,
    )
    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
    except Exception as exc:
        print(f"Falha ao carregar o modelo Whisper: {exc}", file=sys.stderr, flush=True)
        return 1

    try:
        device_identity = audio_device_identity(device_arg, args.channel)
    except AudioDeviceChanged as exc:
        print(f"Falha ao verificar dispositivo: {exc}", file=sys.stderr, flush=True)
        return 1

    emit_worker_message({"type": "ready", "version": 1, "device": device_identity})
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id") if isinstance(request, dict) else None
            if not isinstance(request, dict) or request.get("type") != "transcribe":
                raise ValueError("Pedido inválido: esperado type='transcribe'.")
            if request_id is None:
                raise ValueError("Pedido inválido: campo id obrigatório.")
            if audio_device_identity(device_arg, args.channel) != device_identity:
                raise AudioDeviceChanged("Dispositivo alterado; confira e reinicie o worker.")
            try:
                text = transcribe_once(
                    model, device_identity[0], args.channel, args.descrever, args.fim_por_silencio
                )
            except Exception as exc:
                if isinstance(exc, (OSError, getattr(sd, "PortAudioError", OSError))):
                    raise AudioDeviceChanged(
                        "Falha de captura; confira e reinicie o worker."
                    ) from exc
                raise
            if audio_device_identity(device_arg, args.channel) != device_identity:
                raise AudioDeviceChanged("Dispositivo alterado durante captura; reinicie o worker.")
            emit_worker_message({"type": "result", "id": request_id, "text": text})
        except AudioDeviceChanged as exc:
            print(f"Falha no dispositivo: {exc}", file=sys.stderr, flush=True)
            if request_id is not None:
                emit_worker_message(
                    {"type": "error", "id": request_id, "message": str(exc), "fatal": True}
                )
            return 1
        except Exception as exc:
            print(f"Falha na solicitação {request_id!r}: {exc}", file=sys.stderr, flush=True)
            if request_id is not None:
                emit_worker_message({"type": "error", "id": request_id, "message": str(exc)})
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default=None, help="Índice ou nome do dispositivo de áudio")
    parser.add_argument(
        "--channel", type=int, default=1, help="Canal do dispositivo (1 para Left / 1º canal)"
    )
    parser.add_argument(
        "--list-devices", action="store_true", help="Listar dispositivos de áudio disponíveis"
    )
    parser.add_argument(
        "--descrever",
        action="store_true",
        help="Exibir detalhes em tempo real do que o Whisper está ouvindo",
    )
    parser.add_argument("--worker", action="store_true", help="Executar worker persistente NDJSON")
    parser.add_argument(
        "--fim-por-silencio",
        action="store_true",
        help="Encerrar gravação após silêncio (experimental)",
    )
    args = parser.parse_args()

    if args.list_devices:
        host = sd.default.hostapi
        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0 and d["hostapi"] == host:
                is_def = " (Padrão do Windows)" if i == sd.default.device[0] else ""
                print(f"[{i}] {d['name']} ({d['max_input_channels']} canais){is_def}")
        return

    device_arg = resolve_device(args.device)

    if args.worker:
        return run_worker(args)

    print(
        "Carregando modelo Whisper; na primeira vez pode ser necessário baixá-lo...",
        file=sys.stderr,
        flush=True,
    )
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    print(transcribe_once(model, device_arg, args.channel, args.descrever, args.fim_por_silencio))


if __name__ == "__main__":
    sys.exit(main() or 0)
