import { describe, expect, test } from "bun:test";
import { ChatAggregator } from "@/server/lab/chat-aggregator";

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
      { nick: "a", emote: "Klappa", flair: null },
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
    // 40 events, 150 speakers, the top emotes: about 10 kB, four times a second.
    expect(s.speakers.length).toBe(150);
    expect(JSON.stringify(s).length).toBeLessThan(14_000);
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
