import type { C2S, S2C } from '@vellin/shared';

type Listener = (msg: S2C) => void;

export interface WSClientOptions {
  url: string;
  /** Async ticket refresher — must return a valid wsTicket. */
  getTicket: () => Promise<string>;
  onMessage: Listener;
  onStateChange?: (state: WSConnectionState) => void;
  onError?: (err: Error) => void;
}

export type WSConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

const PING_TIMEOUT_MS = 30000;

export class WSClient {
  private socket: WebSocket | null = null;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private state: WSConnectionState = 'idle';
  private closedByUser = false;
  /** RTT samples in ms, used to compute clockOffset (server - local). */
  private clockOffsetMs = 0;
  private offsetSamples: number[] = [];

  constructor(private readonly opts: WSClientOptions) {}

  async connect(): Promise<void> {
    if (this.closedByUser) return;
    this.setState(this.retryCount === 0 ? 'connecting' : 'reconnecting');
    let ticket: string;
    try {
      ticket = await this.opts.getTicket();
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
      return;
    }

    const url = `${this.opts.url}?ticket=${encodeURIComponent(ticket)}`;
    const sock = new WebSocket(url);
    this.socket = sock;

    sock.onopen = () => {
      this.retryCount = 0;
      this.setState('open');
      this.send({ t: 'hello', clientTs: Date.now() });
      this.armPingTimeout();
    };

    sock.onmessage = (event) => {
      this.armPingTimeout();
      let msg: S2C;
      try {
        msg = JSON.parse(event.data as string) as S2C;
      } catch {
        return;
      }
      if (msg.t === 'ping') {
        this.send({ t: 'pong', serverTs: msg.serverTs, clientTs: Date.now() });
        this.recordClockOffset(msg.serverTs);
        return;
      }
      if (msg.t === 'welcome') {
        this.recordClockOffset(msg.serverTs);
      }
      this.opts.onMessage(msg);
    };

    sock.onerror = (e) => {
      this.opts.onError?.(new Error('WebSocket error'));
      void e;
    };

    sock.onclose = () => {
      this.socket = null;
      if (this.closedByUser) {
        this.setState('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  send(msg: C2S): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimeoutTimer) clearTimeout(this.pingTimeoutTimer);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'client closed');
    }
    this.socket = null;
    this.setState('closed');
  }

  getClockOffsetMs(): number {
    return this.clockOffsetMs;
  }

  getState(): WSConnectionState {
    return this.state;
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    this.setState('reconnecting');
    const delay = Math.min(5000, 250 * 2 ** Math.min(this.retryCount, 5));
    this.retryCount += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private armPingTimeout(): void {
    if (this.pingTimeoutTimer) clearTimeout(this.pingTimeoutTimer);
    this.pingTimeoutTimer = setTimeout(() => {
      // If we haven't heard from the server within the window, force reconnect.
      if (this.socket) {
        try {
          this.socket.close(4000, 'ping timeout');
        } catch {
          /* ignore */
        }
      }
    }, PING_TIMEOUT_MS);
  }

  private recordClockOffset(serverTs: number): void {
    const offset = serverTs - Date.now();
    this.offsetSamples.push(offset);
    if (this.offsetSamples.length > 8) this.offsetSamples.shift();
    // Use the median to resist jitter outliers.
    const sorted = [...this.offsetSamples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.clockOffsetMs =
      sorted.length % 2 === 1
        ? (sorted[mid] ?? 0)
        : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }

  private setState(s: WSConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onStateChange?.(s);
  }
}
