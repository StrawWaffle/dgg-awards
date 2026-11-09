import { describe, expect, test } from "bun:test";
import { effectiveStyle, instantRunoff } from "@/lib/voting";

const repeat = (n: number, ballot: string[]) => Array.from({ length: n }, () => ballot);

describe("instantRunoff", () => {
  test("a first-round majority wins at once", () => {
    const r = instantRunoff(["a", "b", "c"], [...repeat(6, ["a"]), ...repeat(3, ["b"]), ["c"]]);
    expect(r.winners).toEqual(["a"]);
    expect(r.rounds).toHaveLength(1);
    expect(r.rounds[0]!.counts).toEqual({ a: 6, b: 3, c: 1 });
  });

  test("transfers decide it: the first-round leader can lose", () => {
    // a leads on first choices, but c's voters prefer b.
    const ballots = [
      ...repeat(8, ["a", "b"]),
      ...repeat(7, ["b", "a"]),
      ...repeat(5, ["c", "b"]),
    ];
    const r = instantRunoff(["a", "b", "c"], ballots);
    expect(r.rounds.map((x) => x.counts)).toEqual([
      { a: 8, b: 7, c: 5 },
      { a: 8, b: 12 },
    ]);
    expect(r.rounds[0]!.eliminated).toEqual(["c"]);
    expect(r.winners).toEqual(["b"]);
  });

  test("ballots that run out of choices are exhausted, not counted", () => {
    const ballots = [...repeat(4, ["a"]), ...repeat(3, ["b"]), ...repeat(2, ["c"])];
    const r = instantRunoff(["a", "b", "c"], ballots);
    expect(r.rounds[1]).toEqual({ counts: { a: 4, b: 3 }, exhausted: 2, eliminated: [] });
    expect(r.winners).toEqual(["a"]);
  });

  test("ties for last place are broken by earlier rounds", () => {
    // Round 1: d out. Round 2: b and c tie on 3; c had fewer in round 1.
    const ballots = [
      ...repeat(4, ["a"]),
      ...repeat(3, ["b"]),
      ...repeat(2, ["c"]),
      ["d", "c"],
    ];
    const r = instantRunoff(["a", "b", "c", "d"], ballots);
    expect(r.rounds[0]!.eliminated).toEqual(["d"]);
    expect(r.rounds[1]!.counts).toEqual({ a: 4, b: 3, c: 3 });
    expect(r.rounds[1]!.eliminated).toEqual(["c"]);
  });

  test("nominees without votes go out together", () => {
    // a 2, b 2, c 1: no majority; x and y (0 each) go out before c.
    const ballots = [...repeat(2, ["a"]), ...repeat(2, ["b"]), ["c", "a"]];
    const r = instantRunoff(["a", "b", "c", "x", "y"], ballots);
    expect(r.rounds[0]!.eliminated.sort()).toEqual(["x", "y"]);
    expect(r.rounds[1]!.eliminated).toEqual(["c"]);
    expect(r.winners).toEqual(["a"]);
  });

  test("an unbreakable tie is shared", () => {
    const r = instantRunoff(["a", "b"], [["a"], ["b"]]);
    expect(r.winners.sort()).toEqual(["a", "b"]);
  });

  test("no ballots, no winner", () => {
    expect(instantRunoff(["a", "b"], []).winners).toEqual([]);
  });

  test("unknown and repeated nominees on a ballot are ignored", () => {
    const r = instantRunoff(["a", "b"], [["zzz", "a", "a"], ["b"], ["a"]]);
    expect(r.rounds[0]!.counts).toEqual({ a: 2, b: 1 });
    expect(r.winners).toEqual(["a"]);
  });
});

test("a category's own style beats the site default", () => {
  expect(effectiveStyle("ranked", "single")).toBe("ranked");
  expect(effectiveStyle(null, "ranked")).toBe("ranked");
  expect(effectiveStyle(null, undefined)).toBe("single");
});
