// Where the stage's chat comes from: the live relay (server, admins only) or
// a simulator that floods the real aggregator in the browser, for stress
// testing without waiting for the awards.
import { ChatAggregator, type ChatSummary } from "@/server/lab/chat-aggregator";

export type FeedStatus = { connected: boolean; note: string; ingestMs?: number };
type OnSummary = (summary: ChatSummary, status: FeedStatus) => void;

const EMPTY = (): ChatSummary => ({ at: Date.now(), messages: 0, emoteOnly: 0, events: [], speakers: [], top: [], combo: null, ended: [], said: [] });

/**
 * The live relay. If the connection to it drops (a deploy, the network), it
 * reconnects by itself, waiting a little longer each time (up to 30 s).
 * Returns a function that disconnects for good.
 */
export function liveFeed(onSummary: OnSummary, source: "omnichat" | "gum" | "dgg" = "omnichat") {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let tries = 0;
  let stopped = false;
  const connect = () => {
    const s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/lab/chat?source=${source}`);
    socket = s;
    s.onmessage = (e) => {
      tries = 0;
      const { summary, status } = JSON.parse(e.data);
      onSummary(summary, {
        connected: status.connected,
        note: status.fallback
          ? `Omnichat is down, so this is ${status.source} until it's back (try ${status.retries + 1}).`
          : status.connected
            ? `Connected to ${status.source}.`
            : `Connecting to ${status.source} (try ${status.retries + 1}).`,
      });
    };
    s.onclose = () => {
      if (stopped) return;
      const wait = Math.min(30_000, 1000 * 2 ** tries++);
      onSummary(EMPTY(), { connected: false, note: `Lost the relay; reconnecting in ${Math.round(wait / 1000)} s` });
      retry = setTimeout(connect, wait);
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    socket?.close();
  };
}

const SIM_EMOTES = [
  "Klappa", "YEE", "PEPE", "OMEGALUL", "LUL", "PepeLaugh", "POGGERS", "catJAM", "AlienPls", "FeelsGoodMan",
  "NODDERS", "monkaS", "GIGACHAD", "widepeepoHappy", "peepoHug", "CHEERSTINY", "JAMSTINY", "PepoG",
];
const VERIFIED_LINES = ["Congrats, well deserved!", "I can't believe I won this", "Thank you chat", "LETS GO"];

/**
 * Fake chat at `rate()` messages a second, as raw socket frames through the
 * same aggregator the server uses. `emoteShare()` of them are emote-only, now
 * and then a combo runs, and one in a few hundred is a verified chatter.
 */
export function simulatedFeed(emotes: string[], rate: () => number, emoteShare: () => number, onSummary: OnSummary) {
  const usable = SIM_EMOTES.filter((e) => emotes.includes(e));
  const pool = usable.length > 0 ? usable : emotes.slice(0, 20);
  const aggregator = new ChatAggregator(new Map(emotes.map((e) => [e, 0])));
  let comboEmote: string | null = null;
  let comboLeft = 0;
  let carry = 0;
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
  const timer = setInterval(() => {
    carry += rate() / 4;
    const count = Math.floor(carry);
    carry -= count;
    if (comboLeft <= 0 && Math.random() < 0.08) {
      comboEmote = pick(pool);
      comboLeft = 3 + Math.floor(Math.random() * 25);
    }
    const started = performance.now();
    // A combo is a run of back-to-back messages of the one emote, as in chat;
    // it continues into the next window until it's used up.
    const run = Math.min(comboLeft, count);
    for (let i = 0; i < count; i++) {
      const nick = `chatter${Math.floor(Math.random() * 4000)}`;
      let text: string;
      let features: string[] = [];
      if (i < run) {
        text = comboEmote!;
        comboLeft--;
      } else if (Math.random() < emoteShare()) {
        text = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => pick(pool)).join(" ");
      } else if (Math.random() < 0.004) {
        text = pick(VERIFIED_LINES);
        features = ["flair20"];
      } else {
        text = "this is a normal chat message with words in it";
      }
      aggregator.ingest(`MSG ${JSON.stringify({ nick, data: text, features, timestamp: Date.now() })}`);
    }
    const ingestMs = performance.now() - started;
    onSummary(aggregator.flush(), { connected: true, note: `Simulating ${Math.round(rate())} messages a second`, ingestMs });
  }, 250);
  return () => clearInterval(timer);
}
