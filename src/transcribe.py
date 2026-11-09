import argparse
import sys
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

parser = argparse.ArgumentParser()
parser.add_argument('--model', default='small')
args = parser.parse_args()
print('Carregando modelo Whisper; na primeira vez pode ser necessário baixá-lo...', file=sys.stderr)
model = WhisperModel(args.model, device='cpu', compute_type='int8')
print('Gravando agora (5 segundos)...', file=sys.stderr)
audio = sd.rec(5 * 16000, samplerate=16000, channels=1, dtype='float32')
sd.wait()
print('Transcrevendo...', file=sys.stderr)
segments, _ = model.transcribe(np.squeeze(audio), language='pt', beam_size=5, vad_filter=True)
print(' '.join(segment.text.strip() for segment in segments).strip())
