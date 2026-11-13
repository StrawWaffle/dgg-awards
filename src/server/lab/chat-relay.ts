// One connection per chat source, shared by every presentation screen.
//
// Two kinds of source: destiny.gg chat itself, and omnichat, which pools
// destiny.gg, Kick and YouTube chat into one socket (omnichat.destiny.gg;
// gum.vyneer.me runs the same for another channel, handy for testing when
// Destiny is offline). Both refuse sockets from other sites (any Origin but
// their own gets a 403), so a browser can't read them directly; the server
// does, sending no Origin, as dgg-radio does. A relay connects only while a
// screen is listening, and sends each screen the aggregator's summary four
// times a second.
//
// If omnichat stays down, its relay borrows destiny.gg chat's summaries until
// it's back, so the stage keeps its crowd (`status.fallback`).
import { ChatAggregator, type ChatSummary, type RecentLine } from "@/server/lab/chat-aggregator";
import { emoteCatalogue } from "@/server/lab/emotes";

export type ChatSourceId = "omnichat" | "gum" | "dgg";
type ChatSource = { kind: "dgg" | "omni"; url: string; label: string };

export const CHAT_SOURCES: Record<ChatSourceId, ChatSource> = {
  omnichat: { kind: "omni", url: "wss://omnichat.destiny.gg/ws?chat=destinygg", label: "omnichat (destiny.gg, Kick, YouTube)" },
  gum: { kind: "omni", url: "wss://gum.vyneer.me/ws?chat=anythingelse", label: "gum.vyneer.me (test: Anything Else)" },
  dgg: { kind: "dgg", url: "wss://chat.destiny.gg/ws", label: "destiny.gg chat" },
};

const USER_AGENT = "dgg-awards (+https://dgg-awards.strawwaffle.dev)";
const TICK_MS = 250;
/** Keep the connection this long after the last screen leaves, for reloads. */
const GRACE_MS = 60_000;
/** Both ping every 10 s (omnichat when we do); this long without any frame means the socket is dead. */
const SILENCE_MS = 30_000;
/** Omnichat fails this many reconnects in a row: borrow destiny.gg chat meanwhile. */
const FALLBACK_AFTER = 3;

type Listener = (summary: ChatSummary, status: RelayStatus) => void;
export type RelayStatus = {
  connected: boolean;
  since: number | null;
  retries: number;
  /** What's being read: the source's label, or destiny.gg chat's while falling back. */
  source: string;
  /** Omnichat is down and destiny.gg chat stands in. */
  fallback?: boolean;
};

class ChatRelay {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private aggregator = new ChatAggregator(null);
  private tick: Timer | null = null;
  private ping: Timer | null = null;
  private stopTimer: Timer | null = null;
  private retryTimer: Timer | null = null;
  private lastFrameAt = 0;
  private status: RelayStatus;
  /** While falling back: the unsubscribe from destiny.gg chat's relay. */
  private borrowed: (() => void) | null = null;

  constructor(private readonly source: ChatSource) {
    this.status = { connected: false, since: null, retries: 0, source: source.label };
  }

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
    if (this.source.kind === "dgg") emoteCatalogue().then((c) => this.aggregator.setCatalogue(c));
    this.connect();
    this.tick = setInterval(() => this.broadcast(), TICK_MS);
  }

  /** The latest messages of these chatters, from this relay (or the one standing in for it). */
  recentFor(names: string[]): Record<string, RecentLine[]> {
    if (this.borrowed) return relayFor("dgg").recentFor(names);
    return this.aggregator.recentFor(names);
  }

  private stop() {
    if (this.tick) clearInterval(this.tick);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.ping) clearInterval(this.ping);
    this.tick = null;
    this.retryTimer = null;
    this.ping = null;
    this.giveBack();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "No longer needed");
    this.status = { connected: false, since: null, retries: 0, source: this.source.label };
  }

  private connect() {
    // Bun's client takes headers, and sends no Origin unless told to.
    const socket = new WebSocket(this.source.url, { headers: { "User-Agent": USER_AGENT } } as never);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.status = { connected: true, since: Date.now(), retries: 0, source: this.source.label };
      this.lastFrameAt = Date.now();
      this.giveBack();
      // Omnichat's own page pings every 10 s; so do we, as it may expect it.
      if (this.source.kind === "omni") {
        if (this.ping) clearInterval(this.ping);
        this.ping = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ platform: "system", type: "ping", timestamp: new Date().toISOString() }));
          }
        }, 10_000);
      }
    });
    socket.addEventListener("message", (event) => {
      this.lastFrameAt = Date.now();
      const raw = String(event.data);
      if (this.source.kind === "omni") this.aggregator.ingestOmni(raw);
      else if (raw.startsWith("PING ")) socket.send(`PONG ${raw.slice(5)}`);
      else this.aggregator.ingest(raw);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      this.status = { ...this.status, connected: false };
      if (!this.tick) return;
      // Backoff with full jitter, as chat-gui does.
      const window = Math.min(60_000, 3000 * 2 ** this.status.retries);
      this.status.retries++;
      this.retryTimer = setTimeout(() => this.connect(), 500 + Math.random() * window);
    });
    socket.addEventListener("error", () => socket.close());
  }

  /** Omnichat down for a while: pass on destiny.gg chat's summaries until it's back. */
  private borrow() {
    if (this.borrowed || this.source.kind !== "omni") return;
    this.borrowed = relayFor("dgg").subscribe((summary, status) => {
      const own = { ...this.status, source: CHAT_SOURCES.dgg.label, fallback: true, connected: status.connected };
      for (const listener of this.listeners) listener(summary, own);
    });
  }

  private giveBack() {
    this.borrowed?.();
    this.borrowed = null;
  }

  private broadcast() {
    if (this.socket && this.status.connected && Date.now() - this.lastFrameAt > SILENCE_MS) {
      this.socket.close(); // reconnects from the close handler
    }
    const summary = this.aggregator.flush();
    if (!this.status.connected && this.status.retries >= FALLBACK_AFTER) this.borrow();
    if (this.borrowed) return; // the borrowed relay sends instead
    for (const listener of this.listeners) listener(summary, this.status);
  }
}

const relays = new Map<ChatSourceId, ChatRelay>();

/** The relay for a source, made the first time it's asked for. */
export function relayFor(id: ChatSourceId) {
  let relay = relays.get(id);
  if (!relay) {
    relay = new ChatRelay(CHAT_SOURCES[id]);
    relays.set(id, relay);
  }
  return relay;
}

export const isChatSource = (id: string | undefined): id is ChatSourceId => !!id && id in CHAT_SOURCES;
