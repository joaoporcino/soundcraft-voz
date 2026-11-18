import { ConnectionStatus, SoundcraftUI } from 'soundcraft-ui-connection';

const DEFAULT_STOP_TIMEOUT_MS = 500;
const DEFAULT_RETRY_MS = 1000;

/** Mantém uma única conexão da biblioteca e expõe estados em português. */
export class MixerConnection {
  constructor({ targetIP, onStatus = () => {}, onInbound = () => {}, retryMs = DEFAULT_RETRY_MS, createMixer = (ip) => new SoundcraftUI(ip) }) {
    if (!targetIP) throw new TypeError('targetIP é obrigatório');
    this.targetIP = targetIP;
    this.onStatus = onStatus;
    this.onInbound = onInbound;
    this.retryMs = retryMs;
    this.createMixer = createMixer;
    this.mixer = createMixer(targetIP);
    this.status = 'desconectada';
    this.started = false;
    this.stopped = false;
    this.subscription = undefined;
    this.inboundSubscription = undefined;
    this.connectPromise = undefined;
    this.stopPromise = undefined;
    this.retryTimer = undefined;
    this.retryScheduled = false;
  }

  isConnected() {
    return !this.stopped && this.mixer.conn.status === ConnectionStatus.Open;
  }

  #setStatus(status) {
    if (this.stopped || this.status === status) return;
    this.status = status;
    try { this.onStatus(status); } catch { /* callbacks não podem interromper a conexão */ }
  }

  #subscribeAndConnect() {
    this.subscription?.unsubscribe();
    this.inboundSubscription?.unsubscribe();
    const currentMixer = this.mixer;
    this.inboundSubscription = currentMixer.conn.inbound$?.subscribe({
      next: message => {
        if (this.stopped || currentMixer !== this.mixer || !this.isConnected()) return;
        try { this.onInbound(message); } catch { /* observação não interrompe a conexão */ }
      },
    });
    this.subscription = currentMixer.status$?.subscribe({
      next: event => {
        if (this.stopped || currentMixer !== this.mixer) return;
        switch (event?.type) {
          case ConnectionStatus.Open:
            this.retryScheduled = false;
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
            this.#setStatus('conectada');
            break;
          case ConnectionStatus.Reconnecting:
            this.retryScheduled = false;
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
            this.#setStatus('tentando novamente');
            break;
          case ConnectionStatus.Close:
          case ConnectionStatus.Error:
            this.#scheduleRetry();
            break;
          case ConnectionStatus.Opening:
            this.#setStatus(this.status === 'conectando' ? 'conectando' : 'tentando novamente');
            break;
          default:
            break;
        }
      },
      error: () => this.#scheduleRetry(),
    });
    try {
      this.connectPromise = Promise.resolve(currentMixer.connect()).catch(() => {
        if (!this.stopped && currentMixer === this.mixer) this.#scheduleRetry();
      });
    } catch {
      this.#scheduleRetry();
    }
  }

  #scheduleRetry() {
    if (this.stopped || this.retryScheduled) return;
    if (this.status !== 'tentando novamente') {
      this.#setStatus('desconectada');
      this.#setStatus('tentando novamente');
    }
    this.retryScheduled = true;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryScheduled = false;
      if (this.stopped) return;
      const previousMixer = this.mixer;
      this.subscription?.unsubscribe();
      this.inboundSubscription?.unsubscribe();
      // Encerra o socket anterior sem aguardar uma promessa de connect() que pode
      // permanecer pendente enquanto o firmware/servidor não responde.
      try { Promise.resolve(previousMixer.disconnect()).catch(() => {}); } catch { /* sem socket aberto */ }
      try {
        this.mixer = this.createMixer(this.targetIP);
        this.#subscribeAndConnect();
      } catch {
        this.mixer = previousMixer;
        this.#scheduleRetry();
      }
    }, Math.max(0, this.retryMs));
  }

  start() {
    if (this.started || this.stopped) return;
    this.started = true;
    this.#setStatus('conectando');
    // A promessa só conclui após abrir. Os eventos de status são a fonte de estado;
    // capturamos a rejeição para não deixar falhas não tratadas.
    this.#subscribeAndConnect();
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryScheduled = false;
    this.status = 'desconectada';
    this.subscription?.unsubscribe();
    this.inboundSubscription?.unsubscribe();
    this.subscription = undefined;
    this.inboundSubscription = undefined;
    this.stopPromise = (async () => {
      let timeout;
      try {
        await Promise.race([
          Promise.resolve().then(() => this.mixer.disconnect()),
          new Promise(resolve => { timeout = setTimeout(resolve, DEFAULT_STOP_TIMEOUT_MS); }),
        ]);
      } catch { /* desconexão pode rejeitar quando nunca houve socket aberto */ }
      finally { clearTimeout(timeout); }
    })();
    return this.stopPromise;
  }
}
