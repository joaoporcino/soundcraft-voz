const numbers = { um: 1, uma: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezassete: 17, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, 'vinte e um': 21, 'vinte e dois': 22, 'vinte e tres': 23, 'vinte e quatro': 24, zero: 0 };
const num = s => /^-?\d+$/.test(s) ? Number(s) : numbers[s];
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
const n = '(?:vinte e (?:um|dois|tres|quatro)|[a-z]+|\\d+)';

const muteVerbs = 'mutar|muta|mute|silenciar|silencia|silencie|fechar|fecha|feche';
const unmuteVerbs = 'desmutar|desmuta|desmute|ativar|ativa|ative|abrir|abre|abra|ligar|liga|ligue';
const faderVerbs = 'ajustar|ajuste|ajusta|colocar|coloque|coloca|mudar|muda|mude|deixar|deixa|deixe|fader';

export function parseCommand(text) {
  const s = normalize(text);

  // Ex: "muta canal 3", "desmutar o canal 1", "silenciar canal vinte e quatro"
  let match = s.match(new RegExp(`^(${unmuteVerbs}|${muteVerbs})(?: o| a)? (?:o )?canal (${n})$`));
  if (match) {
    const channel = num(match[2]);
    if (!(channel >= 1 && channel <= 24)) throw Error('Canal deve estar entre 1 e 24.');
    const isUnmute = new RegExp(`^(${unmuteVerbs})$`).test(match[1]);
    return { action: isUnmute ? 'unmute' : 'mute', channel };
  }

  // Ex: "canal 3 muta", "canal 1 desmutar"
  match = s.match(new RegExp(`^(?:o )?canal (${n}) (${unmuteVerbs}|${muteVerbs})$`));
  if (match) {
    const channel = num(match[1]);
    if (!(channel >= 1 && channel <= 24)) throw Error('Canal deve estar entre 1 e 24.');
    const isUnmute = new RegExp(`^(${unmuteVerbs})$`).test(match[2]);
    return { action: isUnmute ? 'unmute' : 'mute', channel };
  }

  // Ex: "ajustar canal 2 para menos 6 dB", "colocar canal 1 em 0 db", "canal 3 em -10 db"
  match = s.match(new RegExp(`^(?:(?:${faderVerbs}) )?(?:o )?canal (${n}) (?:em|para|no) (menos |-|\\+)?(${n}) ?(?:db|decibeis)?$`));
  if (match) {
    const channel = num(match[1]), magnitude = num(match[3]);
    if (!(channel >= 1 && channel <= 24)) throw Error('Canal deve estar entre 1 e 24.');
    if (magnitude === undefined) throw Error('Valor de dB não reconhecido.');
    const sign = (match[2] && (match[2].includes('menos') || match[2].includes('-'))) ? -1 : 1;
    const db = sign * Math.abs(magnitude);
    if (db < -60 || db > 0) throw Error('Por segurança, use um valor entre -60 e 0 dB.');
    return { action: 'level', channel, db };
  }

  throw Error('Comando não reconhecido. Consulte os exemplos no README.');
}

export function describe(c) {
  if (c.action === 'level') return `Ajustar fader do canal ${c.channel} para ${c.db} dB`;
  return `${c.action === 'mute' ? 'Mutar' : 'Desmutar'} canal ${c.channel}`;
}
