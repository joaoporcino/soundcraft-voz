import readline from 'node:readline';

const mode = process.argv[2] ?? 'normal';
process.stdout.write('{"type":"ready","version":1,"device":[0,"Microfone simulado",0,2]}\n');
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  if (mode === 'timeout') return;
  if (mode === 'crash') { process.exit(7); return; }
  if (mode === 'null-response') { process.stdout.write('null\n'); return; }
  if (mode === 'device-fatal') {
    process.stdout.write(`${JSON.stringify({ type: 'error', id: request.id, message: 'dispositivo alterado', fatal: true })}\n`);
    return;
  }
  if (mode === 'delay') {
    setTimeout(() => process.stdout.write(`${JSON.stringify({ type: 'result', id: request.id, text: 'atrasada' })}\n`), 200);
    return;
  }
  if (mode === 'request-error' && request.id === 1) {
    process.stdout.write(`${JSON.stringify({ type: 'error', id: request.id, message: 'falha simulada' })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ type: 'result', id: request.id, text: `texto-${request.id}` })}\n`);
});
