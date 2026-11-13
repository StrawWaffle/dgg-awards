// Where the stage's chat comes from: the live relay (server, admins only) or
// a simulator that floods the real aggregator in the browser, for stress
// testing without waiting for the awards.
import { ChatAggregator, type ChatSummary, type RecentLine } from "@/server/lab/chat-aggregator";

export type FeedStatus = { connected: boolean; note: string; ingestMs?: number };
type OnSummary = (summary: ChatSummary, status: FeedStatus) => void;
/** A running feed: stop it, or ask for some chatters' latest messages (for the winner). */
export type FeedHandle = { stop: () => void; recent: (names: string[]) => Promise<Record<string, RecentLine[]>> };

const EMPTY = (): ChatSummary => ({ at: Date.now(), messages: 0, emoteOnly: 0, events: [], speakers: [], top: [], combo: null, ended: [], said: [] });

/**
 * The live relay. If the connection to it drops (a deploy, the network), it
 * reconnects by itself, waiting a little longer each time (up to 30 s).
 * `stop` disconnects for good.
 */
export function liveFeed(onSummary: OnSummary, source: "omnichat" | "gum" | "dgg" = "omnichat"): FeedHandle {
  let socket: WebSocket | null = null;
  /** Waiting for an answer about someone's latest messages (one at a time is plenty). */
  let asking: ((recent: Record<string, RecentLine[]>) => void) | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let tries = 0;
  let stopped = false;
  const connect = () => {
    const s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/lab/chat?source=${source}`);
    socket = s;
    s.onmessage = (e) => {
      tries = 0;
      const data = JSON.parse(e.data);
      if (data.recent) {
        asking?.(data.recent);
        asking = null;
        return;
      }
      const { summary, status } = data;
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
  return {
    stop: () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    },
    recent: (names) =>
      new Promise((resolve) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || names.length === 0) return resolve({});
        asking?.({});
        asking = resolve;
        socket.send(JSON.stringify({ recent: names }));
        setTimeout(() => {
          if (asking === resolve) {
            asking = null;
            resolve({});
          }
        }, 3000);
      }),
  };
}

const SIM_EMOTES = [
  "Klappa", "YEE", "PEPE", "OMEGALUL", "LUL", "PepeLaugh", "POGGERS", "catJAM", "AlienPls", "FeelsGoodMan",
  "NODDERS", "monkaS", "GIGACHAD", "widepeepoHappy", "peepoHug", "CHEERSTINY", "JAMSTINY", "PepoG",
];
const VERIFIED_LINES = ["Congrats, well deserved!", "I can't believe I won this", "Thank you chat", "LETS GO"];

/** Kick's global emotes, as omnichat sends them (seen in chat on 2026-11-11). */
const SIM_KICK_EMOTES: [name: string, id: number][] = [
  ["POLICE", 37230],
  ["collectiblesFlushed", 5747875],
  ["collectiblesarnoldHalt", 5747947],
  ["collectibles4Weird", 5747849],
];
const SIM_WORDS = [
  "this is a normal chat message with words in it",
  "who's winning this one",
  "LETS GOOO",
  "no way",
  "W",
  "rigged",
  // For the chat window's filters: a swear, links, a long one.
  "holy shit this is rigged",
  "clip it https://youtu.be/dQw4w9WgXcQ",
  "go to destiny.gg/bigscreen for the stream",
  "this is a very long message that goes on and on about the awards, the nominees, who should have won, who got robbed last year, what the voting system should be, why the runoff is fair or not, and it keeps going well past what the chat window shows",
];
const SIM_ENDINGS = ["lol", "honestly", "chat", "for real", "imo", "again", "every year", "KEKW", "LULW", "I called it"];
/** What the simulated winners say, if they win. */
const WINNER_WORDS = ["no way", "I'm actually shaking", "thank you chat", "THIS IS RIGGED (thank you)"];
/** Who's typing where, roughly: most in destiny.gg chat, then Kick, then YouTube. */
const SIM_PLATFORMS: [platform: "dgg" | "kick" | "youtube", share: number][] = [
  ["dgg", 0.7],
  ["kick", 0.22],
  ["youtube", 0.08],
];
/** Name colours to spread over destiny.gg chatters, as subscribers and the rest. */
const SIM_FLAIRS = [[], [], ["subscriber", "flair13"], ["subscriber", "flair1"], ["subscriber", "flair3"], ["flair42"]];

type SimBlock = { type: "emote"; platform: string; id: string; originalId: string; url: string };
const dggBlock = (name: string): SimBlock => ({ type: "emote", platform: "dgg", id: name, originalId: name, url: "" });
const kickBlock = ([name, id]: [string, number]): SimBlock => ({
  type: "emote",
  platform: "kick",
  id: name,
  originalId: `[emote:${id}:${name}]`,
  url: `https://files.kick.com/emotes/${id}/fullsize`,
});

/**
 * Fake chat at `rate()` messages a second, as omnichat frames through the
 * same aggregator the server uses, so the simulator shows everything the
 * stream will: destiny.gg, Kick and YouTube chatters (with their marks),
 * destiny.gg emotes and Kick's (as pictures), combos in either, plain
 * words, name colours, and now and then a verified chatter's line.
 * `emoteShare()` of the messages are emote-only.
 */
export function simulatedFeed(
  emotes: string[],
  rate: () => number,
  emoteShare: () => number,
  onSummary: OnSummary,
  /** Nominees' destiny.gg usernames: now and then one of them chats too, so the winner has something to say. */
  nominees: () => string[] = () => [],
): FeedHandle {
  const usable = SIM_EMOTES.filter((e) => emotes.includes(e));
  const pool = usable.length > 0 ? usable : emotes.slice(0, 20);
  const aggregator = new ChatAggregator(null);
  let combo: { blocks: SimBlock; platform: "dgg" | "kick" } | null = null;
  let comboLeft = 0;
  let carry = 0;
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
  const platformOf = () => {
    let roll = Math.random();
    for (const [platform, share] of SIM_PLATFORMS) if ((roll -= share) < 0) return platform;
    return "dgg";
  };
  const frame = (platform: string, nick: string, blocks: SimBlock[], words: string | null, badges: string[]) =>
    JSON.stringify({
      platform,
      type: "message",
      user: { username: nick, badges: badges.map((id) => ({ type: "text", id })), subscription: { tier: badges.length ? 1 : 0 } },
      content: { originalText: words ?? blocks.map((b) => b.originalId).join(" "), blocks: blocks.length ? blocks : null },
    });
  let ticks = 0;
  /** Someone whose words were sent to the screen a moment ago: the next to be muted. */
  let talker = "";
  const timer = setInterval(() => {
    ticks++;
    carry += rate() / 4;
    const count = Math.floor(carry);
    carry -= count;
    if (comboLeft <= 0 && Math.random() < 0.08) {
      // Mostly destiny.gg emotes, sometimes Kick chat spamming one of its own.
      combo = Math.random() < 0.8 ? { blocks: dggBlock(pick(pool)), platform: "dgg" } : { blocks: kickBlock(pick(SIM_KICK_EMOTES)), platform: "kick" };
      comboLeft = 3 + Math.floor(Math.random() * 25);
    }
    const started = performance.now();
    // A combo is a run of back-to-back messages of the one emote, as in chat;
    // it continues into the next window until it's used up.
    const run = Math.min(comboLeft, count);
    for (let i = 0; i < count; i++) {
      const id = Math.floor(Math.random() * 4000);
      if (i < run) {
        comboLeft--;
        const c = combo!;
        aggregator.ingestOmni(frame(c.platform, `${c.platform === "kick" ? "kicker" : "chatter"}${id}`, [c.blocks], null, []));
        continue;
      }
      const platform = platformOf();
      const nick = `${platform === "dgg" ? "chatter" : platform === "kick" ? "kicker" : "viewer"}${id}`;
      const badges = platform === "dgg" ? SIM_FLAIRS[id % SIM_FLAIRS.length]! : [];
      if (Math.random() < emoteShare() && platform !== "youtube") {
        const n = 1 + Math.floor(Math.random() * 3);
        const blocks = Array.from({ length: n }, () => (platform === "kick" && Math.random() < 0.6 ? kickBlock(pick(SIM_KICK_EMOTES)) : dggBlock(pick(pool))));
        aggregator.ingestOmni(frame(platform, nick, blocks, null, badges));
      } else if (platform === "dgg" && Math.random() < 0.004) {
        aggregator.ingestOmni(frame("dgg", nick, [], pick(VERIFIED_LINES), ["flair20"]));
      } else {
        // Some lines as typed, some with a chatter's own ending, so they aren't all repeats.
        const said = pick(SIM_WORDS);
        aggregator.ingestOmni(frame(platform, nick, [], Math.random() < 0.5 ? said : `${said} ${pick(SIM_ENDINGS)}`, badges));
      }
    }
    // A nominee says something now and then, and a moderator mutes someone
    // every 10 seconds or so (the chat window's "Muted or banned" setting).
    const names = nominees();
    if (names.length && Math.random() < 0.1) aggregator.ingestOmni(frame("dgg", pick(names), [], pick(WINNER_WORDS), ["subscriber", "flair13"]));
    if (ticks % 40 === 0 && talker) aggregator.ingest(`MUTE ${JSON.stringify({ nick: "a_mod", data: talker })}`);
    const ingestMs = performance.now() - started;
    const summary = aggregator.flush();
    if (ticks % 40 === 32) talker = summary.lines?.find((l) => !l.platform)?.nick ?? talker;
    onSummary(summary, { connected: true, note: `Simulating ${Math.round(rate())} messages a second from destiny.gg, Kick and YouTube`, ingestMs });
  }, 250);
  return { stop: () => clearInterval(timer), recent: async (names) => aggregator.recentFor(names) };
}
