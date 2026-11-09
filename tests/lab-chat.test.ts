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
    expect(agg.flush().combo).toBeNull();
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
    expect(JSON.stringify(s).length).toBeLessThan(6000);
    // Generous: a busy awards chat is a few hundred messages a second.
    expect(ms).toBeLessThan(2000);
  });
});
