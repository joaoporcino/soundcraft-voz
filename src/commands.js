const numbers = { um: 1, uma: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezassete: 17, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, 'vinte e um': 21, 'vinte e dois': 22, 'vinte e tres': 23, 'vinte e quatro': 24, zero: 0 };
const num = s => /^\d+$/.test(s) ? Number(s) : numbers[s];
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
const n = '(?:vinte e (?:um|dois|tres|quatro)|[a-z]+|\\d+)';

export function parseCommand(text) {
  const s = normalize(text);
  let match = s.match(new RegExp(`^(mutar|mute|silenciar|silencie|mutar o|silenciar o|desmutar|desmute|ativar|ative|desmutar o|ativar o) (?:o )?canal (${n})$`));
  if (match) {
    const channel = num(match[2]);
    if (!(channel >= 1 && channel <= 24)) throw Error('Canal deve estar entre 1 e 24.');
    return { action: /^(desmut|ativ)/.test(match[1]) ? 'unmute' : 'mute', channel };
  }
  match = s.match(new RegExp(`^(?:ajustar|ajuste|colocar|coloque) (?:o )?canal (${n}) (?:em|para) (menos )?(${n}) (?:db|decibeis)$`));
  if (match) {
    const channel = num(match[1]), magnitude = num(match[3]);
    if (!(channel >= 1 && channel <= 24)) throw Error('Canal deve estar entre 1 e 24.');
    if (magnitude === undefined) throw Error('Valor de dB não reconhecido.');
    const db = (match[2] ? -1 : 1) * magnitude;
    if (db < -60 || db > 0) throw Error('Por segurança, use um valor entre -60 e 0 dB.');
    return { action: 'level', channel, db };
  }
  throw Error('Comando não reconhecido. Consulte os exemplos no README.');
}

export function describe(c) {
  if (c.action === 'level') return `Ajustar fader do canal ${c.channel} para ${c.db} dB`;
  return `${c.action === 'mute' ? 'Mutar' : 'Desmutar'} canal ${c.channel}`;
}
