// One connection to destiny.gg chat, shared by every presentation screen.
//
// destiny.gg refuses sockets from other sites (any Origin but its own gets a
// 403), so a browser can't read chat directly; the server does, sending no
// Origin, as dgg-radio does. It connects only while a screen is listening,
// and sends each screen the aggregator's summary four times a second.
import { ChatAggregator, type ChatSummary } from "@/server/lab/chat-aggregator";
import { emoteCatalogue } from "@/server/lab/emotes";

const CHAT_URL = "wss://chat.destiny.gg/ws";
const USER_AGENT = "dgg-awards (+https://dgg-awards.strawwaffle.dev)";
const TICK_MS = 250;
/** Keep the connection this long after the last screen leaves, for reloads. */
const GRACE_MS = 60_000;
/** Chat pings every 10 s; this long without any frame means the socket is dead. */
const SILENCE_MS = 30_000;

type Listener = (summary: ChatSummary, status: RelayStatus) => void;
export type RelayStatus = { connected: boolean; since: number | null; retries: number };

class ChatRelay {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private aggregator = new ChatAggregator(null);
  private tick: Timer | null = null;
  private stopTimer: Timer | null = null;
  private retryTimer: Timer | null = null;
  private lastFrameAt = 0;
  private status: RelayStatus = { connected: false, since: null, retries: 0 };

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stopTimer = setTimeout(() => this.stop(), GRACE_MS);
    };
  }

  private start() {
    if (this.tick) return;
    emoteCatalogue().then((c) => this.aggregator.setCatalogue(c));
    this.connect();
    this.tick = setInterval(() => this.broadcast(), TICK_MS);
  }

  private stop() {
    if (this.tick) clearInterval(this.tick);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.tick = null;
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "No longer needed");
    this.status = { connected: false, since: null, retries: 0 };
  }

  private connect() {
    // Bun's client takes headers, and sends no Origin unless told to.
    const socket = new WebSocket(CHAT_URL, { headers: { "User-Agent": USER_AGENT } } as never);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.status = { connected: true, since: Date.now(), retries: 0 };
      this.lastFrameAt = Date.now();
    });
    socket.addEventListener("message", (event) => {
      this.lastFrameAt = Date.now();
      const raw = String(event.data);
      if (raw.startsWith("PING ")) socket.send(`PONG ${raw.slice(5)}`);
      else this.aggregator.ingest(raw);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.status = { ...this.status, connected: false };
      if (!this.tick) return;
      // Backoff with full jitter, as chat-gui does.
      const window = Math.min(60_000, 3000 * 2 ** this.status.retries);
      this.status.retries++;
      this.retryTimer = setTimeout(() => this.connect(), 500 + Math.random() * window);
    });
    socket.addEventListener("error", () => socket.close());
  }

  private broadcast() {
    if (this.socket && this.status.connected && Date.now() - this.lastFrameAt > SILENCE_MS) {
      this.socket.close(); // reconnects from the close handler
    }
    const summary = this.aggregator.flush();
    for (const listener of this.listeners) listener(summary, this.status);
  }
}

export const chatRelay = new ChatRelay();
