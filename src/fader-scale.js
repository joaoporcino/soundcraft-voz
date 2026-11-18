import { faderValueToDB } from 'soundcraft-ui-connection';

const MAX_AGE_MS = 5000;
export class AmbiguousFaderScaleError extends Error {}
const WORDS = Object.freeze({ zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 });

function number(text) {
  if (/^\d+$/.test(text)) return Number(text);
  if (Object.hasOwn(WORDS, text)) return WORDS[text];
  const parts = text.split(' e ');
  if (parts.length === 2 && WORDS[parts[0]] >= 20 && WORDS[parts[0]] <= 90 && WORDS[parts[1]] >= 1 && WORDS[parts[1]] <= 9) {
    return WORDS[parts[0]] + WORDS[parts[1]];
  }
  return NaN;
}

function validPoint(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100; }

/** Unqualified positive values previously rejected by the dB parser denote points. */
export function parseFaderPoints(text) {
  if (typeof text !== 'string') throw new TypeError('Texto obrigatório.');
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const numeric = '(?:\\d+|(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa) e (?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)|[a-z]+)';
  const absolute = new RegExp(`^(?:(?:coloca|coloque|colocar|ajusta|ajuste|ajustar|deixa|deixe|deixar) )?(?:o )?canal (${numeric}) (?:em|para|no) (${numeric})( pontos?)?$`).exec(normalized);
  const relative = new RegExp(`^(abaixa|abaixe|baixar|diminui|diminua|sobe|suba|aumenta|aumente|aumentar) (?:o )?canal (${numeric}) (?:em |por )?(${numeric})(?: pontos?)?$`).exec(normalized);
  if (!absolute && !relative) return null;
  const channel = number(absolute ? absolute[1] : relative[2]);
  const magnitude = number(absolute ? absolute[2] : relative[3]);
  // Both scales admit zero, with different meanings; require an explicit unit.
  if (absolute && !absolute[3] && magnitude === 0) throw new AmbiguousFaderScaleError('Informe pontos ou dB para zero.');
  if (!Number.isInteger(channel) || channel < 1 || channel > 24 || !validPoint(magnitude) || (relative && magnitude === 0)) {
    throw new RangeError('Canal ou valor em pontos inválido.');
  }
  if (absolute) return { action: 'points_absolute', channel, points: magnitude };
  const sign = /^(abaixa|abaixe|baixar|diminui|diminua)$/.test(relative[1]) ? -1 : 1;
  return { action: 'points_relative', channel, points: sign * magnitude };
}

export function pointsToDb(points) {
  if (!validPoint(points)) throw new RangeError('Pontos fora da faixa de 0 a 100.');
  return -60 + points * 0.6;
}

export function observationToPoints(observation, now = Date.now()) {
  if (!observation || !Number.isSafeInteger(observation.revision) || observation.revision < 1 ||
      typeof observation.value !== 'number' || !Number.isFinite(observation.value) || observation.value < 0 || observation.value > 1 ||
      !Number.isFinite(now)) throw new RangeError('Observação indisponível.');
  const timestamp = Date.parse(observation.observedAt);
  if (!Number.isFinite(timestamp) || now < timestamp || now - timestamp > MAX_AGE_MS) throw new RangeError('Observação expirada.');
  const db = faderValueToDB(observation.value);
  // Numerical tolerance handles rounding of the library's boundary values.
  if (!Number.isFinite(db) || db < -60 - 1e-6 || db > 1e-6) throw new RangeError('Fader observado fora da escala.');
  return Math.max(0, Math.min(100, (db + 60) / 0.6));
}

/** Compute once for review; caller must revalidate the token at execution. */
export function prepareRelativePoints(offset, observation, now = Date.now()) {
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset === 0 || Math.abs(offset) > 100) throw new RangeError('Alteração inválida.');
  const previous = observationToPoints(observation, now);
  const target = previous + offset;
  if (target < -1e-7 || target > 100 + 1e-7) throw new RangeError('Resultado fora da escala.');
  const points = Math.max(0, Math.min(100, target));
  return Object.freeze({ previous, offset, points, db: pointsToDb(points), observedAt: observation.observedAt, revision: observation.revision });
}

export function relativeObservationUnchanged(prepared, observation, now = Date.now()) {
  try {
    return prepared?.revision === observation?.revision && prepared?.observedAt === observation?.observedAt &&
      Math.abs(observationToPoints(observation, now) - prepared.previous) < 1e-7;
  } catch { return false; }
}
