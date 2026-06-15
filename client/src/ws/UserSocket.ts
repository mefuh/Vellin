import type { UserC2S, UserS2C } from '@vellin/shared';

type Listener = (msg: UserS2C) => void;

export interface UserSocketOptions {
  /** Async ticket refresher — должен вернуть валидный realtime-тикет. */
  getTicket: () => Promise<string>;
  onMessage: Listener;
  /** Вызывается при каждом успешном открытии (для ре-подписок после реконнекта). */
  onOpen?: () => void;
}

/**
 * App-wide пользовательский realtime-канал (`/ws/user`). Живёт всё время сессии,
 * переживает навигацию между страницами. Отвечает на ping серверным pong'ом,
 * авто-переподключается с backoff. Отдельный от комнатного WSClient.
 */
export class UserSocket {
  private socket: WebSocket | null = null;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;

  constructor(private readonly opts: UserSocketOptions) {}

  async connect(): Promise<void> {
    if (this.closedByUser) return;
    let ticket: string;
    try {
      ticket = await this.opts.getTicket();
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (this.closedByUser) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws/user?ticket=${encodeURIComponent(ticket)}`;
    const sock = new WebSocket(url);
    this.socket = sock;

    sock.onopen = () => {
      this.retryCount = 0;
      this.opts.onOpen?.();
    };

    sock.onmessage = (event) => {
      let msg: UserS2C;
      try {
        msg = JSON.parse(event.data as string) as UserS2C;
      } catch {
        return;
      }
      if (msg.t === 'ping') {
        this.sendPong(msg.serverTs);
        return;
      }
      this.opts.onMessage(msg);
    };

    sock.onerror = () => {
      /* onclose обработает реконнект */
    };

    sock.onclose = () => {
      this.socket = null;
      if (this.closedByUser) return;
      this.scheduleReconnect();
    };
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'client closed');
    }
    this.socket = null;
  }

  /** Отправить C2S-сообщение (подписки на присутствие и т.п.). */
  send(msg: UserC2S): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private sendPong(serverTs: number): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ t: 'pong', serverTs }));
    }
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    const delay = Math.min(8000, 500 * 2 ** Math.min(this.retryCount, 5));
    this.retryCount += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }
}
