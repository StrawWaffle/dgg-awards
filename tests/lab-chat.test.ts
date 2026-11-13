import { describe, expect, test } from "bun:test";
import { ChatAggregator } from "@/server/lab/chat-aggregator";
import { FILTER_DEFAULTS, RepeatGuard, Removals, badWords, cleanMessage, withoutEmotes } from "@/lab/chatFilter";

const catalogue = new Map([
  ["Klappa", 0],
  ["YEE", 0],
  ["PEPE", 0],
  ["SubOnly", 1],
]);
const msg = (nick: string, data: string, extra: Record<string, unknown> = {}) =>
  `MSG ${JSON.stringify({ nick, data, features: [], ...extra })}`;

describe("chat aggregator", () => {
  test("keeps emote-only messages as events and drops plain words", () => {
    const agg = new ChatAggregator(catalogue);
    agg.ingest(msg("a", "Klappa Klappa"));
    agg.ingest(msg("b", "hello Klappa"));
    agg.ingest(msg("c", "YEE"));
    agg.ingest("JOIN {\"nick\":\"d\"}");
    const s = agg.flush(1);
    expect(s.messages).toBe(3);
    expect(s.emoteOnly).toBe(2);
    expect(s.events).toEqual([
      // A message of several emotes keeps them all, in order, as some are drawn together.
      { nick: "a", emote: "Klappa", flair: null, seq: ["Klappa", "Klappa"] },
      { nick: "c", emote: "YEE", flair: null },
    ]);
    expect(s.top).toEqual([
      ["Klappa", 3],
      ["YEE", 1],
    ]);
    // A new window starts empty.
    expect(agg.flush(2)).toMatchObject({ messages: 0, events: [], top: [] });
  });

  test("lists everyone who spoke, once each with their latest emote, up to a cap", () => {
    const agg = new ChatAggregator(catalogue, { maxSpeakers: 3 });
    agg.ingest(msg("a", "hello chat"));
    agg.ingest(msg("b", "nice YEE"));
    agg.ingest(msg("a", "Klappa"));
    expect(agg.flush().speakers).toEqual([
      { nick: "a", emote: "Klappa", flair: null },
      { nick: "b", emote: "YEE", flair: null },
    ]);
    for (const n of ["c", "d", "e", "f", "g"]) agg.ingest(msg(n, "words"));
    const s = agg.flush();
    expect(s.speakers.length).toBe(3);
    expect(s.messages).toBe(5);
    expect(agg.flush().speakers).toEqual([]);
  });

  test("an emote the author's tier doesn't allow is a word", () => {
    const agg = new ChatAggregator(catalogue);
    agg.ingest(msg("free", "SubOnly"));
    agg.ingest(msg("sub", "SubOnly", { subscription: { tier: 1 } }));
    expect(agg.flush().events.map((e) => e.nick)).toEqual(["sub"]);
  });

  test("ignores bots, keeps a few verified messages, and colours names by flair", () => {
    const agg = new ChatAggregator(catalogue, { maxSaid: 2 });
    agg.ingest(msg("Bot", "Klappa", { features: ["bot"] }));
    agg.ingest(msg("v1", "congrats!", { features: ["flair20"] }));
    agg.ingest(msg("v2", "well deserved", { features: ["moderator"] }));
    agg.ingest(msg("v3", "third", { features: ["flair20"] }));
    agg.ingest(msg("nobody", "just words"));
    agg.ingest(msg("sub", "PEPE", { features: ["subscriber", "flair13"] }));
    const s = agg.flush();
    expect(s.messages).toBe(5);
    expect(s.said).toEqual([
      { nick: "v1", text: "congrats!", flair: "flair20" },
      { nick: "v2", text: "well deserved", flair: "moderator" },
    ]);
    expect(s.events).toEqual([{ nick: "sub", emote: "PEPE", flair: "flair13" }]);
  });

  test("counts combos as chat does: the same single emote, message after message", () => {
    const agg = new ChatAggregator(catalogue);
    for (const nick of ["a", "b", "c"]) agg.ingest(msg(nick, "Klappa"));
    expect(agg.flush().combo).toEqual({ emote: "Klappa", count: 3 });
    // It carries over into the next window, until something else breaks it.
    agg.ingest(msg("d", "Klappa"));
    expect(agg.flush().combo).toEqual({ emote: "Klappa", count: 4 });
    agg.ingest(msg("e", "Klappa YEE"));
    const broken = agg.flush();
    expect(broken.combo).toBeNull();
    // The combo that ended is reported, so a short one isn't lost between windows.
    expect(broken.ended).toEqual([{ emote: "Klappa", count: 4 }]);
    expect(agg.flush().ended).toEqual([]);
  });

  test("a flood stays cheap and the summary stays small", () => {
    const agg = new ChatAggregator(new Map([...catalogue, ...Array.from({ length: 300 }, (_, i) => [`E${i}`, 0] as const)]));
    const frames = Array.from({ length: 100_000 }, (_, i) =>
      msg(`chatter${i % 5000}`, i % 3 === 0 ? "a normal message with several words" : `E${i % 300} Klappa`, {
        features: i % 7 === 0 ? ["subscriber"] : [],
        subscription: { tier: 1 },
      }),
    );
    const started = performance.now();
    for (const f of frames) agg.ingest(f);
    const s = agg.flush();
    const ms = performance.now() - started;
    console.log(`100,000 messages in ${ms.toFixed(0)} ms (${Math.round(100_000 / (ms / 1000))} per second)`);
    expect(s.messages).toBe(100_000);
    expect(s.events.length).toBe(40);
    expect(s.top.length).toBe(8);
    // 40 events, 150 speakers (with a message's emotes when there are several), the top emotes: about 14 kB, four times a second.
    expect(s.speakers.length).toBe(150);
    expect(JSON.stringify(s).length).toBeLessThan(16_000);
    // Generous: a busy awards chat is a few hundred messages a second.
    expect(ms).toBeLessThan(2000);
  });
});

// Frames as omnichat sends them (recorded from gum.vyneer.me, 2026-11-11).
const omni = (platform: string, username: string, text: string, blocks: unknown[] | null = null, badges: string[] = []) =>
  JSON.stringify({
    platform,
    type: "message",
    user: { username, badges: badges.map((id) => ({ type: "text", id })), subscription: { tier: 1 } },
    content: { originalText: text, blocks },
  });
const dggEmote = (id: string) => ({ type: "emote", platform: "dgg", id, originalId: id, url: `https://r2cdn.destiny.gg/emotes/${id}.png` });
const kickEmote = (id: string, n: number) => ({
  type: "emote",
  platform: "kick",
  id,
  originalId: `[emote:${n}:${id}]`,
  url: `https://files.kick.com/emotes/${n}/fullsize`,
});

describe("chat aggregator, omnichat", () => {
  test("reads destiny.gg, Kick and YouTube messages, with their platform", () => {
    const agg = new ChatAggregator(null);
    agg.ingestOmni(omni("dgg", "a", "ShrimpleAs", [dggEmote("ShrimpleAs")], ["flair13", "subscriber"]));
    agg.ingestOmni(omni("kick", "b", "[emote:5299391:gemzarsideeye]", [kickEmote("gemzarsideeye", 5299391)], ["subscriber"]));
    agg.ingestOmni(omni("youtube", "c", "hello there"));
    agg.ingestOmni(JSON.stringify({ platform: "system", type: "connected" }));
    const s = agg.flush(1);
    expect(s.messages).toBe(3);
    expect(s.events).toEqual([
      // destiny.gg flairs still colour the name; Kick's badges don't.
      { nick: "a", emote: "ShrimpleAs", flair: "flair13" },
      { nick: "b", emote: "kick:gemzarsideeye", flair: null, platform: "kick" },
    ]);
    expect(s.speakers).toContainEqual({ nick: "c", emote: null, flair: null, platform: "youtube" });
    expect(s.pictures).toEqual({ "kick:gemzarsideeye": "https://files.kick.com/emotes/5299391/fullsize" });
    expect(agg.flush(2).pictures).toBeUndefined();
  });

  test("counts combos across platforms, skips their bots, and keeps the same name on two platforms apart", () => {
    const agg = new ChatAggregator(null);
    agg.ingestOmni(omni("dgg", "a", "PEPE", [dggEmote("PEPE")]));
    agg.ingestOmni(omni("kick", "a", "PEPE", [dggEmote("PEPE")]));
    agg.ingestOmni(omni("kick", "BotRix", "follow the channel"));
    const s = agg.flush(1);
    expect(s.messages).toBe(2);
    expect(s.combo).toEqual({ emote: "PEPE", count: 2 });
    expect(s.speakers).toHaveLength(2);
  });

  test("Kick and YouTube emotes typed with no space between them still count", () => {
    const agg = new ChatAggregator(null);
    const heart = { type: "emote", platform: "youtube", id: ":heart:", originalId: ":heart:", url: "https://yt3.ggpht.com/h=w48-h48" };
    agg.ingestOmni(omni("kick", "a", "[emote:1:x][emote:1:x][emote:2:y]", [kickEmote("x", 1), kickEmote("x", 1), kickEmote("y", 2)]));
    agg.ingestOmni(omni("youtube", "b", ":heart::heart:", [heart, heart]));
    agg.ingestOmni(omni("youtube", "c", ":heart:chaaat!", [heart]));
    const s = agg.flush(1);
    expect(s.emoteOnly).toBe(2);
    expect(s.events).toEqual([
      { nick: "a", emote: "kick:y", flair: null, platform: "kick", seq: ["kick:x", "kick:x", "kick:y"] },
      { nick: "b", emote: "youtube::heart:", flair: null, platform: "youtube", seq: ["youtube::heart:", "youtube::heart:"] },
    ]);
    expect(s.speakers).toContainEqual({ nick: "c", emote: "youtube::heart:", flair: null, platform: "youtube" });
    expect(s.top).toEqual(expect.arrayContaining([["youtube::heart:", 3], ["kick:x", 2]]));
  });

  test("Destiny's Kick emotes are drawn as destiny.gg's own, where there is one", () => {
    const agg = new ChatAggregator(new Map([["SideEye", 0], ["PEPE", 0]]));
    agg.ingestOmni(omni("kick", "a", "[emote:5886923:destinySideEye]", [kickEmote("destinySideEye", 5886923)]));
    agg.ingestOmni(omni("kick", "b", "[emote:1:destinyRustle]", [kickEmote("destinyRustle", 1)]));
    const s = agg.flush(1);
    expect(s.events.map((e) => e.emote)).toEqual(["SideEye", "kick:destinyRustle"]);
    expect(s.pictures).toEqual({ "kick:destinyRustle": "https://files.kick.com/emotes/1/fullsize" });
  });

  test("a Kick moderator's words aren't shown as verified, and odd picture addresses are dropped", () => {
    const agg = new ChatAggregator(null);
    agg.ingestOmni(omni("kick", "m", "hi chat", null, ["moderator"]));
    agg.ingestOmni(omni("kick", "x", "[emote:1:bad]", [{ ...kickEmote("bad", 1), url: 'https://x.test/a") body{' }]));
    const s = agg.flush(1);
    expect(s.said).toEqual([]);
    expect(s.pictures).toBeUndefined();
    expect(s.emoteOnly).toBe(0);
  });
});

describe("chat window: messages, moderation and the winner's words", () => {
  test("people's words go to the chat window with their emotes marked; verified ones stay apart", () => {
    const agg = new ChatAggregator(catalogue);
    agg.ingest(msg("a", "hello YEE chat"));
    agg.ingest(msg("b", "Klappa"));
    agg.ingest(msg("v", "thanks chat", { features: ["flair20"] }));
    const s = agg.flush(1);
    expect(s.lines).toEqual([{ nick: "a", text: "hello YEE chat", flair: null, emotes: { YEE: "YEE" } }]);
    expect(s.said.map((x) => x.nick)).toEqual(["v"]);
  });

  test("mutes, bans and deaths name who to take down; omnichat's deleted messages by id", () => {
    const agg = new ChatAggregator(catalogue);
    agg.ingest(`MUTE ${JSON.stringify({ nick: "mod", data: "loud" })}`);
    agg.ingest(`BAN ${JSON.stringify({ nick: "mod", data: "rude" })}`);
    agg.ingest(`DEATH ${JSON.stringify({ nick: "gone" })}`);
    agg.ingestOmni(JSON.stringify({ platform: "youtube", type: "moderation-action", action: { type: "delete-message", uuid: "m1" } }));
    expect(agg.flush(1).removed).toEqual({ nicks: [{ nick: "loud" }, { nick: "rude" }, { nick: "gone" }], ids: ["m1"] });
    expect(agg.flush(2).removed).toBeUndefined();
  });

  test("omnichat's mutes and bans, as recorded live (destiny.gg's mutes come through it too)", () => {
    const agg = new ChatAggregator(null);
    const act = (platform: string, action: unknown) => JSON.stringify({ platform, type: "moderation-action", uuid: "x", action });
    agg.ingestOmni(act("dgg", { type: "mute", moderator: { username: "Bot" }, target: { username: "loud", id: "1" }, duration: 600 }));
    agg.ingestOmni(act("kick", { type: "ban", moderator: { username: "amod" }, target: { username: "rude", id: "rude" }, duration: 0 }));
    expect(agg.flush(1).removed).toEqual({ nicks: [{ nick: "loud" }, { nick: "rude", platform: "kick" }], ids: [] });
  });

  test("keeps everyone's last messages for the winner, forgets a muted chatter's, and drops a deleted one", () => {
    const agg = new ChatAggregator(catalogue);
    for (const t of ["one", "two", "three", "four"]) agg.ingest(msg("Winner", t));
    agg.ingestOmni(omni("kick", "winner", "five", null));
    agg.ingestOmni(JSON.stringify({ ...JSON.parse(omni("youtube", "WINNER", "deleted soon")), uuid: "y1" }));
    agg.ingestOmni(JSON.stringify({ platform: "youtube", type: "moderation-action", action: { type: "delete-message", uuid: "y1" } }));
    expect(agg.recentFor(["winner"]).winner!.map((r) => r.text)).toEqual(["three", "four", "five"]);
    agg.ingest(`MUTE ${JSON.stringify({ nick: "mod", data: "Winner" })}`);
    expect(agg.recentFor(["winner"]).winner!.map((r) => r.text)).toEqual(["five"]);
  });

  test("the filters: bad words starred (emotes left alone), links out, long ones out", () => {
    const bad = badWords("dang");
    const f = FILTER_DEFAULTS;
    expect(cleanMessage("holy shit that's dang good", undefined, f, bad)).toBe("holy **** that's **** good");
    expect(cleanMessage("FUCKING POGGERS", { POGGERS: "POGGERS" }, f, bad)).toBe("****ING POGGERS");
    expect(cleanMessage("look https://x.test/a and destiny.gg/bigscreen", undefined, f, bad)).toBe("look and");
    expect(cleanMessage("https://x.test/a", undefined, f, bad)).toBeNull();
    expect(cleanMessage("a".repeat(201), undefined, f, bad)).toBeNull();
    expect(cleanMessage("shit https://x.test", undefined, { ...f, censor: false, links: false }, bad)).toBe("shit https://x.test");
  });

  test("a speech bubble has the words without the emotes", () => {
    expect(withoutEmotes("hello YEE chat kick:x", { YEE: "YEE", "kick:x": "kick:x" })).toBe("hello chat");
    expect(withoutEmotes("YEE YEE", { YEE: "YEE" })).toBeNull();
    expect(withoutEmotes("just words", undefined)).toBe("just words");
  });

  test("repeats within half a minute, and who moderators took down", () => {
    const g = new RepeatGuard();
    const pasta = "This is a copy pasta, everyone!";
    expect(g.isRepeat(pasta, 0, "a")).toBe(false);
    expect(g.isRepeat("this is a COPY pasta everyone", 10_000, "b")).toBe(true);
    expect(g.isRepeat(pasta, 35_000, "c")).toBe(true);
    expect(g.isRepeat(pasta, 90_000, "d")).toBe(false);
    // Short: only the same person again.
    expect(g.isRepeat("W", 0, "a")).toBe(false);
    expect(g.isRepeat("W", 1000, "b")).toBe(false);
    expect(g.isRepeat("w!", 2000, "A")).toBe(true);
    const r = new Removals();
    r.add({ nicks: [{ nick: "Loud" }, { nick: "k", platform: "kick" }], ids: ["m1"] }, 0);
    expect(r.has({ nick: "loud" })).toBe(true);
    expect(r.has({ nick: "k" })).toBe(false);
    expect(r.has({ nick: "k", platform: "kick" })).toBe(true);
    expect(r.has({ nick: "x", msgId: "m1" })).toBe(true);
  });
});

describe("emotes drawn together", () => {
  test("the emotes whose look depends on their neighbours come from emotes.css", async () => {
    const { combiningEmotes } = await import("@/server/lab/emotes");
    const css = `
      .emote.PEPE { width: 32px }
      .emote.GIGACHAD + .emote.BLADE { transform: scaleX(-1) }
      .emote.BoomerSippy:first-of-type, .emote.Plain:hover { left: 0 }
      .text > .emote.Chatting:not(.emote + .emote.Chatting):has(+ .emote) { top: 0 }
      /* .emote.Commented + .emote.Out */`;
    expect(combiningEmotes(css)).toEqual(["BLADE", "BoomerSippy", "Chatting", "GIGACHAD"]);
  });
});
