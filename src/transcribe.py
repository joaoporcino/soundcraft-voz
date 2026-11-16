import argparse
import sys

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel


def resolve_device(device):
    """Converte índices de dispositivo em inteiro e preserva nomes."""
    return int(device) if device is not None and device.isdigit() else device


def audio_rms(audio):
    """Calcula RMS de áudio capturado em qualquer formato compatível com NumPy."""
    return float(np.sqrt(np.mean(np.asarray(audio) ** 2)))


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
    args = parser.parse_args()

    if args.list_devices:
        host = sd.default.hostapi
        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0 and d["hostapi"] == host:
                is_def = " (Padrão do Windows)" if i == sd.default.device[0] else ""
                print(f"[{i}] {d['name']} ({d['max_input_channels']} canais){is_def}")
        return

    device_arg = resolve_device(args.device)

    if args.descrever:
        dev_name = "Padrão do Windows" if device_arg is None else str(device_arg)
        print(
            f"[Microfone]: Usando dispositivo {dev_name}, canal de áudio {args.channel}",
            file=sys.stderr,
            flush=True,
        )

    print(
        "Carregando modelo Whisper; na primeira vez pode ser necessário baixá-lo...",
        file=sys.stderr,
        flush=True,
    )
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    print("Gravando agora (5 segundos)...", file=sys.stderr, flush=True)
    audio = sd.rec(
        5 * 16000, samplerate=16000, mapping=[args.channel], device=device_arg, dtype="float32"
    )
    sd.wait()

    if args.descrever:
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
            if args.descrever:
                conf = float(100 * np.exp(segment.avg_logprob))
                print(
                    f"[Whisper ouviu {segment.start:.1f}s - {segment.end:.1f}s]: "
                    f'"{txt}" (confiança: {conf:.1f}%)',
                    file=sys.stderr,
                    flush=True,
                )

    final_text = " ".join(collected).strip()
    if args.descrever and not final_text:
        print("[Whisper]: Nenhuma fala identificada no áudio.", file=sys.stderr, flush=True)

    print(final_text)


if __name__ == "__main__":
    main()
