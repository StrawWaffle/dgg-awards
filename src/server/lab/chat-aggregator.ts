// Boils destiny.gg chat down to a small summary for the presentation stage.
//
// Chat during the awards is a flood, and the stage only needs a handful of
// characters to move and a sense of what everyone is spamming. So per window
// (a quarter second) this keeps: how many messages came in, a random sample
// of emote-only messages as characters to show (nick and emote), the most used
// emotes, the running combo, and a few messages from verified people. Whatever
// the chat rate, the summary stays the same size; the work per message is a
// split and a few map lookups.
//
// Two feeds come in: destiny.gg chat's own socket (`ingest`), and omnichat's
// (`ingestOmni`), which pools destiny.gg, Kick and YouTube chat. Chatters
// from elsewhere than destiny.gg carry their `platform`; their own emotes
// are named "<platform>:<name>" and drawn from the picture in `pictures`.
import type { EmoteCatalogue } from "@/server/lab/emotes";

/** Where a chatter typed, when not destiny.gg ("kick", "youtube", "twitch"). */
type From = { platform?: string };
/** Someone who sent only emotes: shown as a character doing that emote. */
export type ChatEvent = { nick: string; emote: string; flair: string | null } & From;
/** Someone who said anything, with the last emote in it (null if none). */
export type ChatSpeaker = { nick: string; emote: string | null; flair: string | null } & From;
/** Words from someone verified, which the stage may show at the right moment. */
export type ChatSaid = { nick: string; text: string; flair: string | null } & From;

export type ChatSummary = {
  /** End of the window, ms. */
  at: number;
  /** Every message in the window, from people (bots excluded). */
  messages: number;
  /** Of those, messages that were only emotes. */
  emoteOnly: number;
  /** A uniform random sample of the emote-only messages. */
  events: ChatEvent[];
  /**
   * Who spoke in the window (any message), once each with their latest, up to
   * a cap (a random pick past it). The stage keeps a roster from these, as
   * dgg-radio does, so people who type words appear and stay too.
   */
  speakers: ChatSpeaker[];
  /** The most used emotes in the window, most first. */
  top: [emote: string, count: number][];
  /** A run of messages that were all the same single emote, as chat counts combos. */
  combo: { emote: string; count: number } | null;
  /** Combos of 2 or more that ended during the window (they'd be missed otherwise). */
  ended: { emote: string; count: number }[];
  said: ChatSaid[];
  /** Pictures of the emotes from other platforms seen in the window, by name. */
  pictures?: Record<string, string>;
};

/** destiny.gg's flairs (cdn.destiny.gg/flairs/flairs.json) that mark someone as known. */
export const VERIFIED_FLAIRS = ["flair20", "flair2", "flair12", "moderator", "admin", "flair125"];
const BOT_FLAIRS = new Set(["bot", "flair11"]);
/** Which flair a name shows in, for the stage's name colour. The first held wins. */
const SHOWN_FLAIRS = ["admin", "moderator", "flair12", "flair20", "flair2", "flair42", "flair8", "flair3", "flair1", "flair13", "subscriber"];

type Message = { nick?: unknown; data?: unknown; features?: unknown; subscription?: { tier?: unknown } | null };

/** Bots on the other platforms, which have no bot flair to go by. */
const BOT_NAMES = new Set(["botrix", "kickbot", "nightbot", "streamelements", "fossabot", "moobot", "streamlabs", "sery_bot"]);

/** One chat message, from either feed. */
type Line = {
  nick: string;
  text: string;
  features: string[];
  tier: number;
  /** Null for destiny.gg. */
  platform: string | null;
  /**
   * The emotes in it, as omnichat marks them: the word as typed, and the
   * emote's name. Null: tell emotes from words with the catalogue.
   */
  emotes: Map<string, string> | null;
};

/** Omnichat's message, as far as it's read here. */
type OmniMessage = {
  platform?: unknown;
  type?: unknown;
  user?: { username?: unknown; badges?: { id?: unknown }[] | null; subscription?: { tier?: unknown } | null } | null;
  content?: { originalText?: unknown; blocks?: { type?: unknown; platform?: unknown; id?: unknown; originalId?: unknown; url?: unknown }[] | null } | null;
};

/**
 * Kick and YouTube emotes typed with nothing between them, or stuck to a
 * word ("[emote:1:a][emote:2:b]", ":face-fuchsia-poop-shape:chaaat!"),
 * spaced apart so each reads as its own word. destiny.gg's are left alone:
 * its chat only counts an emote with spaces around it. Longest first, so a
 * code that holds a shorter one is matched whole.
 */
function spaceEmotes(text: string, codes: string[]) {
  if (codes.length === 0) return text;
  const escaped = [...codes].sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return text.replace(new RegExp(escaped.join("|"), "g"), (code) => ` ${code} `);
}

/** Only plain https addresses go to the stage as pictures. */
const PICTURE_URL = /^https:\/\/[^\s"'()\\]+$/;

export class ChatAggregator {
  private messages = 0;
  private emoteOnly = 0;
  private sample: ChatEvent[] = [];
  private speakers = new Map<string, ChatSpeaker>();
  private speakerCount = 0;
  private counts = new Map<string, number>();
  private said: ChatSaid[] = [];
  private combo: { emote: string; count: number } | null = null;
  private ended: { emote: string; count: number }[] = [];
  private pictures = new Map<string, string>();
  private readonly verified: Set<string>;

  constructor(
    private catalogue: EmoteCatalogue | null,
    private readonly options: { maxEvents?: number; maxSaid?: number; maxSpeakers?: number; verified?: string[]; random?: () => number } = {},
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
    this.add({
      nick: msg.nick,
      text: msg.data,
      features: Array.isArray(msg.features) ? (msg.features as string[]) : [],
      tier: typeof msg.subscription?.tier === "number" ? msg.subscription.tier : 0,
      platform: null,
      emotes: null,
    });
  }

  /**
   * One frame off omnichat's socket (JSON, `type: "message"` for chat). Its
   * destiny.gg messages carry destiny.gg's flairs as badges, so they read as
   * they do from chat itself; the emotes come marked, so no catalogue is
   * needed, and other platforms' emotes bring their picture.
   */
  ingestOmni(raw: string) {
    if (!raw.includes('"type":"message"')) return;
    let msg: OmniMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const nick = msg.user?.username;
    const text = msg.content?.originalText;
    if (msg.type !== "message" || typeof nick !== "string" || typeof text !== "string") return;
    const platform = typeof msg.platform === "string" && msg.platform !== "dgg" ? msg.platform : null;
    if (platform && BOT_NAMES.has(nick.toLowerCase())) return;
    const emotes = new Map<string, string>();
    const others: string[] = [];
    for (const b of msg.content?.blocks ?? []) {
      if (b.type !== "emote" || typeof b.id !== "string" || typeof b.originalId !== "string") continue;
      if (b.platform === "dgg" || b.platform === undefined) emotes.set(b.originalId, b.id);
      else if (typeof b.platform === "string" && typeof b.url === "string" && PICTURE_URL.test(b.url)) {
        const name = `${b.platform}:${b.id}`;
        emotes.set(b.originalId, name);
        this.pictures.set(name, b.url);
        others.push(b.originalId);
      }
    }
    const tier = msg.user?.subscription?.tier;
    this.add({
      nick,
      text: spaceEmotes(text, others),
      // Flairs mean something only on destiny.gg (Kick has "moderator" and "subscriber" badges too).
      features: platform ? [] : (msg.user?.badges ?? []).map((b) => b.id).filter((id): id is string => typeof id === "string"),
      tier: typeof tier === "number" ? tier : 0,
      platform,
      emotes,
    });
  }

  private add(line: Line) {
    const { nick, features, tier } = line;
    if (features.some((f) => BOT_FLAIRS.has(f))) return;
    this.messages++;
    const from = line.platform ? { platform: line.platform } : {};

    const words = line.text.split(/\s+/).filter(Boolean);
    let last: string | null = null;
    let allEmotes = words.length > 0;
    for (const word of words) {
      // Chat's own rule: an emote the author's tier doesn't allow is just a word.
      let emote: string | undefined;
      if (line.emotes) emote = line.emotes.get(word);
      else {
        const needs = this.catalogue?.get(word);
        if (needs !== undefined && needs <= tier) emote = word;
      }
      if (emote === undefined) {
        allEmotes = false;
        continue;
      }
      last = emote;
      this.counts.set(emote, (this.counts.get(emote) ?? 0) + 1);
    }
    const flair = SHOWN_FLAIRS.find((f) => features.includes(f)) ?? null;

    // Everyone who speaks, once per window with their latest. Past the cap,
    // each new name may replace one at random (reservoir sampling). The same
    // name on two platforms is two people.
    const maxSpeakers = this.options.maxSpeakers ?? 150;
    const key = line.platform ? `${line.platform}:${nick}` : nick;
    const speaker = { nick, emote: last, flair, ...from };
    if (this.speakers.has(key) || this.speakers.size < maxSpeakers) this.speakers.set(key, speaker);
    else {
      this.speakerCount++;
      const random = this.options.random ?? Math.random;
      if (Math.floor(random() * (maxSpeakers + this.speakerCount)) < maxSpeakers) {
        const victim = [...this.speakers.keys()][Math.floor(random() * this.speakers.size)]!;
        this.speakers.delete(victim);
        this.speakers.set(key, speaker);
      }
    }

    // Combos: consecutive messages that are exactly one emote, the same one.
    const continues = allEmotes && words.length === 1 && last !== null && this.combo?.emote === last;
    if (!continues && this.combo && this.combo.count >= 2 && this.ended.length < 10) this.ended.push(this.combo);
    if (continues) this.combo = { emote: last!, count: this.combo!.count + 1 };
    else this.combo = allEmotes && words.length === 1 && last ? { emote: last, count: 1 } : null;

    if (allEmotes && last) {
      this.emoteOnly++;
      // Reservoir sampling: every emote-only message equally likely to be kept.
      const max = this.options.maxEvents ?? 40;
      const event = { nick, emote: last, flair, ...from };
      if (this.sample.length < max) this.sample.push(event);
      else {
        const slot = Math.floor((this.options.random ?? Math.random)() * this.emoteOnly);
        if (slot < max) this.sample[slot] = event;
      }
      return;
    }
    if (features.some((f) => this.verified.has(f)) && this.said.length < (this.options.maxSaid ?? 3)) {
      this.said.push({ nick, text: line.text.slice(0, 140), flair, ...from });
    }
  }

  /** The window so far, and start a new one. The combo carries over. */
  flush(at = Date.now()): ChatSummary {
    const summary: ChatSummary = {
      at,
      messages: this.messages,
      emoteOnly: this.emoteOnly,
      events: this.sample,
      speakers: [...this.speakers.values()],
      top: [...this.counts].sort((a, b) => b[1] - a[1]).slice(0, 8),
      combo: this.combo && this.combo.count >= 2 ? this.combo : null,
      ended: this.ended,
      said: this.said,
      ...(this.pictures.size > 0 ? { pictures: Object.fromEntries(this.pictures) } : {}),
    };
    this.pictures = new Map();
    this.ended = [];
    this.messages = 0;
    this.emoteOnly = 0;
    this.sample = [];
    this.speakers = new Map();
    this.speakerCount = 0;
    this.counts = new Map();
    this.said = [];
    return summary;
  }
}
