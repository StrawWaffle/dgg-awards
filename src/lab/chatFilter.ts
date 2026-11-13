// What the big screen's chat window lets through, set in the gear's settings
// and remembered per browser. It's on stream, so the defaults are careful:
// messages from muted or banned chatters come down, swear words are starred
// out (destiny.gg chat's own list), and links, long messages and repeats are
// left out.

export type ChatFilters = {
  /** People's messages in the chat window, not only emotes and verified people. */
  words: boolean;
  /** Messages of someone a moderator muted or banned, or deleted: taken out, shown as <censored>, or left. */
  removed: "remove" | "censor" | "nothing";
  /** Star out destiny.gg chat's bad words, and `extraWords`. */
  censor: boolean;
  /** More words to star out, separated by commas or spaces. */
  extraWords: string;
  /**
   * Leave out repeats within half a minute: a longer message sent again by
   * anyone (copypastas), or a short one sent again by the same person ("W"
   * from many people is just chat).
   */
  repeats: boolean;
  /** Leave out messages over LONG_AT characters. */
  long: boolean;
  /** Take links out of messages. */
  links: boolean;
  /** Beside the winner: their last messages in chat, the line typed in the admin page, or nothing. */
  winnerWords: "chat" | "line" | "off";
};

export const FILTER_DEFAULTS: ChatFilters = {
  words: true,
  removed: "remove",
  censor: true,
  extraWords: "",
  repeats: true,
  long: true,
  links: true,
  winnerWords: "chat",
};

const FILTERS_KEY = "lab.stage.chat";
export function loadFilters(): ChatFilters {
  try {
    return { ...FILTER_DEFAULTS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "{}") };
  } catch {
    return FILTER_DEFAULTS;
  }
}
export function saveFilters(f: ChatFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {}
}

export const LONG_AT = 200;

/** destiny.gg chat's own "Censor bad words" list (chat-gui, BadWordsCensorshipFormatter.js). */
export const BAD_WORDS = ["fuck", "shit", "cunt", "whore", "bitch", "faggot", "fag", "nigger", "nigga", "gusano", "cracker", "rape"];

/** Matched anywhere in a word, as destiny.gg chat does ("bullshit" too). */
export function badWords(extra: string): RegExp {
  const own = extra
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const all = [...own, ...BAD_WORDS].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${all.join("|")})`, "gi");
}

/** Addresses, with or without https:// (destiny.gg, youtu.be/…, www.…). */
const LINK =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gg|tv|io|me|co|ly|be|xyz|link|app|dev|info|us|uk|ca|de|ru|to)(?:\/\S*)?/gi;

/**
 * A message as the chat window should show it, or null to leave it out.
 * `emotes` (word → emote) are never touched.
 */
export function cleanMessage(text: string, emotes: Record<string, string> | undefined, f: ChatFilters, bad: RegExp): string | null {
  if (f.long && text.length > LONG_AT) return null;
  const words = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (emotes?.[word]) {
      kept.push(word);
      continue;
    }
    let w = word;
    if (f.links) w = w.replace(LINK, "");
    if (!w) continue;
    if (f.censor) w = w.replace(bad, (m) => "*".repeat(m.length));
    kept.push(w);
  }
  return kept.length ? kept.join(" ") : null;
}

/** Messages up to this long (letters and digits) are only repeats from the same person. */
const SHORT = 15;

/**
 * A message without its emotes, for a speech bubble: the character under it
 * shows the emote already. Null if nothing's left.
 */
export function withoutEmotes(text: string, emotes: Record<string, string> | undefined): string | null {
  const words = emotes ? text.split(/\s+/).filter((w) => w && !emotes[w]) : [text];
  const left = words.join(" ").trim();
  return left || null;
}

/** Remembers messages for half a minute, to spot the same one sent again. */
export class RepeatGuard {
  private seen = new Map<string, number>();
  constructor(private readonly windowMs = 30_000) {}

  /**
   * True if this text (ignoring case, spacing and punctuation) was seen
   * lately: from anyone if it's long, from `nick` if it's short. Remembers it
   * either way.
   */
  isRepeat(text: string, now: number, nick = ""): boolean {
    const bare = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (!bare) return false;
    const key = bare.length > SHORT ? bare : `${nick.toLowerCase()} ${bare}`;
    const at = this.seen.get(key);
    this.seen.delete(key);
    this.seen.set(key, now);
    // Oldest first: forget what's past the window.
    for (const [k, t] of this.seen) {
      if (now - t <= this.windowMs) break;
      this.seen.delete(k);
    }
    return at !== undefined && now - at <= this.windowMs;
  }
}

/**
 * Who moderators took down, and which messages. A name is remembered for a
 * minute, so lines from them still on their way (the sample is a quarter
 * second behind) stay out too; a mute that ends lets them back.
 */
export class Removals {
  private nicks = new Map<string, number>();
  private ids = new Set<string>();
  constructor(private readonly keepMs = 60_000) {}

  static key(nick: string, platform?: string | null) {
    return `${platform ?? "dgg"}:${nick.toLowerCase()}`;
  }

  add(removed: { nicks: { nick: string; platform?: string }[]; ids: string[] }, now: number) {
    for (const r of removed.nicks) this.nicks.set(Removals.key(r.nick, r.platform), now);
    for (const id of removed.ids) this.ids.add(id);
    if (this.ids.size > 2000) this.ids = new Set([...this.ids].slice(-1000));
    for (const [k, t] of this.nicks) if (now - t > this.keepMs) this.nicks.delete(k);
  }

  has(line: { nick?: string; platform?: string; msgId?: string }) {
    if (line.msgId && this.ids.has(line.msgId)) return true;
    return !!line.nick && this.nicks.has(Removals.key(line.nick, line.platform));
  }
}
