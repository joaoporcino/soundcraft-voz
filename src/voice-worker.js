import { spawn as spawnProcess } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const DEFAULT_SCRIPT = fileURLToPath(new URL('./transcribe.py', import.meta.url));

/** Owns one persistent Python transcription process. */
export class VoiceWorker {
  constructor({
    python = 'python',
    model = 'small',
    device,
    channel = 1,
    descrever = false,
    fimPorSilencio = false,
    script = DEFAULT_SCRIPT,
    args,
    spawn = spawnProcess,
    cwd,
    onStderr = (text) => process.stderr.write(text),
    startupTimeoutMs = 180_000,
    requestTimeoutMs = 90_000,
  } = {}) {
    this.python = python;
    this.model = model;
    this.device = device;
    this.channel = channel;
    this.descrever = descrever;
    this.fimPorSilencio = fimPorSilencio;
    this.script = script;
    this.args = args;
    this.spawn = spawn;
    this.cwd = cwd;
    this.onStderr = onStderr;
    this.startupTimeoutMs = startupTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.child = null;
    this.state = 'idle';
    this.nextId = 1;
    this.pending = null;
    this.startPromise = null;
    this.stderr = '';
    this.deviceIdentity = null;
  }

  start() {
    if (this.state === 'ready') return Promise.resolve();
    if (this.state === 'starting') return this.startPromise;
    if (this.state !== 'idle') return Promise.reject(new Error('Worker já foi encerrado ou falhou.'));
    this.state = 'starting';
    this.startPromise = this.#startProcess();
    return this.startPromise;
  }

  async #startProcess() {
    const args = this.args ?? [this.script, '--worker', '--model', String(this.model)];
    if (this.args === undefined) {
      if (this.device !== undefined && this.device !== null && this.device !== '') args.push('--device', String(this.device));
      if (this.channel !== undefined && this.channel !== null) args.push('--channel', String(this.channel));
      if (this.descrever) args.push('--descrever');
      if (this.fimPorSilencio) args.push('--fim-por-silencio');
    }
    try {
      this.child = this.spawn(this.python, args, {
        ...(this.cwd ? { cwd: this.cwd } : {}),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      this.state = 'failed';
      throw error;
    }
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.#onStdout(chunk));
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
      this.onStderr(chunk);
    });
    this.child.on('error', (error) => this.#fail(error));
    this.child.stdin.on('error', (error) => this.#fail(error));
    this.child.on('exit', (code, signal) => {
      if (!['closing', 'closed', 'failed'].includes(this.state)) {
        this.#fail(new Error(`Worker encerrou inesperadamente (${signal ?? `código ${code}`}).`));
      }
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Worker não ficou pronto em ${this.startupTimeoutMs} ms.`);
        this.#fail(error);
        reject(error);
      }, this.startupTimeoutMs);
      this.startResolve = () => { clearTimeout(timer); resolve(); };
      this.startReject = (error) => { clearTimeout(timer); reject(error); };
    });
  }

  #onStdout(chunk) {
    this.stdoutBuffer = (this.stdoutBuffer ?? '') + chunk;
    let newline;
    while ((newline = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch {
        this.#fail(new Error(`Protocolo inválido do worker: ${line.slice(0, 200)}`));
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        this.#fail(new Error('Mensagem inválida do worker.'));
        return;
      }
      if (this.state === 'starting') {
        if (message.type !== 'ready' || message.version !== 1) {
          this.#fail(new Error('Worker enviou sinal de inicialização incompatível.'));
          return;
        }
        const identity = message.device;
        if (identity !== undefined && (!Array.isArray(identity) || identity.length !== 4 ||
            !Number.isSafeInteger(identity[0]) || identity[0] < 0 || typeof identity[1] !== 'string' || !identity[1] ||
            !Number.isSafeInteger(identity[2]) || identity[2] < 0 || !Number.isSafeInteger(identity[3]) || identity[3] < 1)) {
          this.#fail(new Error('Identidade de áudio inválida.'));
          return;
        }
        if (identity === undefined && this.args === undefined) {
          this.#fail(new Error('Worker não informou identidade do dispositivo.'));
          return;
        }
        this.deviceIdentity = identity === undefined ? null : [...identity];
        this.state = 'ready';
        this.startResolve?.();
        continue;
      }
      if (this.state !== 'ready' || !this.pending || message.id !== this.pending.id) {
        this.#fail(new Error('Resposta do worker não corresponde ao pedido ativo.'));
        return;
      }
      const pending = this.pending;
      if (message.type === 'result' && typeof message.text === 'string') {
        this.pending = null;
        clearTimeout(pending.timer);
        pending.resolve(message.text);
      } else if (message.type === 'error' && typeof message.message === 'string') {
        if (message.fatal === true) {
          this.#fail(new Error(message.message));
          return;
        }
        if (message.fatal !== undefined && message.fatal !== false) {
          this.#fail(new Error('Resposta inválida do worker.'));
          return;
        }
        this.pending = null;
        clearTimeout(pending.timer);
        pending.reject(new Error(message.message));
      } else this.#fail(new Error('Resposta inválida do worker.'));
    }
  }

  transcribe() {
    if (this.state !== 'ready') return Promise.reject(new Error('Worker não está pronto.'));
    if (this.pending) return Promise.reject(new Error('Já existe uma transcrição em andamento.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Transcrição excedeu ${this.requestTimeoutMs} ms.`);
        this.#fail(error);
      }, this.requestTimeoutMs);
      this.pending = { id, resolve, reject, timer };
      this.child.stdin.write(`${JSON.stringify({ type: 'transcribe', id })}\n`, (error) => {
        if (error) this.#fail(error);
      });
    });
  }

  async close() {
    if (this.state === 'closed') return;
    if (this.state === 'starting') this.#fail(new Error('Worker encerrado durante inicialização.'));
    if (!this.child || ['failed', 'closed'].includes(this.state)) return;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Worker encerrado durante transcrição.'));
      this.pending = null;
    }
    this.state = 'closing';
    this.child.stdin.end();
    await new Promise((resolve) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { this.child.kill(); resolve(); }, 1000);
      this.child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    this.state = 'closed';
  }

  #fail(error) {
    if (this.state === 'failed' || this.state === 'closed') return;
    const failure = this.stderr ? new Error(`${error.message}\n${this.stderr.trim()}`) : error;
    this.state = 'failed';
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(failure);
      this.pending = null;
    }
    this.startReject?.(failure);
    this.startResolve = null;
    this.startReject = null;
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
  }
}
