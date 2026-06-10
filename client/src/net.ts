// WebSocket client: thin transport with typed callbacks.

import { CLIENT_SEND_HZ, type LevelId } from '../../shared/constants';
import { decode, encode, type C2S, type S2C } from '../../shared/protocol';

export interface NetCallbacks {
  onMessage(msg: S2C): void;
  onClose(): void;
  onOpen(): void;
}

export class Net {
  private ws: WebSocket | null = null;
  private sendTimer = 0;
  private pingTimer = 0;
  latency = 0;
  connected = false;
  myId = -1;

  constructor(private cb: NetCallbacks) {}

  connect(name: string, level: LevelId): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.send({ t: 'join', name, level });
      this.cb.onOpen();
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000);
    };
    ws.onmessage = (e) => {
      const msg = decode<S2C>(e.data as string);
      if (!msg) return;
      if (msg.t === 'welcome') this.myId = msg.id;
      if (msg.t === 'pong') {
        this.latency = performance.now() - msg.ts;
        return;
      }
      this.cb.onMessage(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.cb.onClose();
    };
    ws.onerror = () => ws.close();
  }

  send(msg: C2S): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encode(msg));
    }
  }

  /** Rate-limited state upload; call every frame. */
  sendState(now: number, get: () => Omit<Extract<C2S, { t: 'state' }>, 't'>): void {
    if (now - this.sendTimer < 1000 / CLIENT_SEND_HZ) return;
    this.sendTimer = now;
    this.send({ t: 'state', ...get() });
  }

  close(): void {
    this.ws?.close();
  }
}
