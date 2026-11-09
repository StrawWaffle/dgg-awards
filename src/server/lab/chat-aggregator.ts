// Boils destiny.gg chat down to a small summary for the presentation stage.
//
// Chat during the awards is a flood, and the stage only needs a handful of
// characters to move and a sense of what everyone is spamming. So per window
// (a quarter second) this keeps: how many messages came in, a random sample
// of emote-only messages as characters to show (nick and emote), the most used
// emotes, the running combo, and a few messages from verified people. Whatever
// the chat rate, the summary stays the same size; the work per message is a
// split and a few map lookups.
import type { EmoteCatalogue } from "@/server/lab/emotes";

/** Someone who sent only emotes: shown as a character doing that emote. */
export type ChatEvent = { nick: string; emote: string; flair: string | null };
/** Words from someone verified, which the stage may show at the right moment. */
export type ChatSaid = { nick: string; text: string; flair: string | null };

export type ChatSummary = {
  /** End of the window, ms. */
  at: number;
  /** Every message in the window, from people (bots excluded). */
  messages: number;
  /** Of those, messages that were only emotes. */
  emoteOnly: number;
  /** A uniform random sample of the emote-only messages. */
  events: ChatEvent[];
  /** The most used emotes in the window, most first. */
  top: [emote: string, count: number][];
  /** A run of messages that were all the same single emote, as chat counts combos. */
  combo: { emote: string; count: number } | null;
  said: ChatSaid[];
};

/** destiny.gg's flairs (cdn.destiny.gg/flairs/flairs.json) that mark someone as known. */
export const VERIFIED_FLAIRS = ["flair20", "flair2", "flair12", "moderator", "admin", "flair125"];
const BOT_FLAIRS = new Set(["bot", "flair11"]);
/** Which flair a name shows in, for the stage's name colour. The first held wins. */
const SHOWN_FLAIRS = ["admin", "moderator", "flair12", "flair20", "flair2", "flair42", "flair8", "flair3", "flair1", "flair13", "subscriber"];

type Message = { nick?: unknown; data?: unknown; features?: unknown; subscription?: { tier?: unknown } | null };

export class ChatAggregator {
  private messages = 0;
  private emoteOnly = 0;
  private sample: ChatEvent[] = [];
  private counts = new Map<string, number>();
  private said: ChatSaid[] = [];
  private combo: { emote: string; count: number } | null = null;
  private readonly verified: Set<string>;

  constructor(
    private catalogue: EmoteCatalogue | null,
    private readonly options: { maxEvents?: number; maxSaid?: number; verified?: string[]; random?: () => number } = {},
  ) {
    this.verified = new Set(options.verified ?? VERIFIED_FLAIRS);
  }

  setCatalogue(catalogue: EmoteCatalogue | null) {
    this.catalogue = catalogue;
  }

  /** One raw frame off the chat socket (`EVENT {json}`). Anything but MSG is ignored. */
  ingest(raw: string) {
    // Cheap test first: in a flood nearly everything is MSG, but not all.
    if (!raw.startsWith("MSG ")) return;
    let msg: Message;
    try {
      msg = JSON.parse(raw.slice(4));
    } catch {
      return;
    }
    if (typeof msg.nick !== "string" || typeof msg.data !== "string") return;
    const features = Array.isArray(msg.features) ? (msg.features as string[]) : [];
    if (features.some((f) => BOT_FLAIRS.has(f))) return;
    this.messages++;

    const tier = typeof msg.subscription?.tier === "number" ? msg.subscription.tier : 0;
    const words = msg.data.split(/\s+/).filter(Boolean);
    let last: string | null = null;
    let allEmotes = words.length > 0;
    for (const word of words) {
      // Chat's own rule: an emote the author's tier doesn't allow is just a word.
      const needs = this.catalogue?.get(word);
      if (needs === undefined || needs > tier) {
        allEmotes = false;
        continue;
      }
      last = word;
      this.counts.set(word, (this.counts.get(word) ?? 0) + 1);
    }
    const flair = SHOWN_FLAIRS.find((f) => features.includes(f)) ?? null;

    // Combos: consecutive messages that are exactly one emote, the same one.
    if (allEmotes && words.length === 1 && last) {
      this.combo = this.combo?.emote === last ? { emote: last, count: this.combo.count + 1 } : { emote: last, count: 1 };
    } else {
      this.combo = null;
    }

    if (allEmotes && last) {
      this.emoteOnly++;
      // Reservoir sampling: every emote-only message equally likely to be kept.
      const max = this.options.maxEvents ?? 40;
      const event = { nick: msg.nick, emote: last, flair };
      if (this.sample.length < max) this.sample.push(event);
      else {
        const slot = Math.floor((this.options.random ?? Math.random)() * this.emoteOnly);
        if (slot < max) this.sample[slot] = event;
      }
      return;
    }
    if (features.some((f) => this.verified.has(f)) && this.said.length < (this.options.maxSaid ?? 3)) {
      this.said.push({ nick: msg.nick, text: msg.data.slice(0, 140), flair });
    }
  }

  /** The window so far, and start a new one. The combo carries over. */
  flush(at = Date.now()): ChatSummary {
    const summary: ChatSummary = {
      at,
      messages: this.messages,
      emoteOnly: this.emoteOnly,
      events: this.sample,
      top: [...this.counts].sort((a, b) => b[1] - a[1]).slice(0, 8),
      combo: this.combo && this.combo.count >= 2 ? this.combo : null,
      said: this.said,
    };
    this.messages = 0;
    this.emoteOnly = 0;
    this.sample = [];
    this.counts = new Map();
    this.said = [];
    return summary;
  }
}
