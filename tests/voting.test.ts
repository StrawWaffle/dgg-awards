import { describe, expect, test } from "bun:test";
import { effectiveStyle, instantRunoff, runoffTop, countPoints, placesToRanks, pointsForPlaces, ranksToPlaces, validPlaces } from "@/lib/voting";

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

describe("points (a top 10, equals sharing places)", () => {
  test("10 for first down to 1 for tenth; equals share the places they take", () => {
    const rows = pointsForPlaces([["a"], ["b", "c"], ["d"]]);
    expect(rows.map((r) => [r.place, r.points])).toEqual([[1, 10], [2, 8.5], [4, 7]]);
    const ten = pointsForPlaces([...Array(10).keys()].map((i) => [`n${i}`]));
    expect(ten.map((r) => r.points)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  test("stored as places shared by equals, and back", () => {
    const places = [["a"], ["b", "c"], ["d"]];
    const rows = placesToRanks(places);
    expect(rows).toEqual([{ id: "a", rank: 1 }, { id: "b", rank: 2 }, { id: "c", rank: 2 }, { id: "d", rank: 4 }]);
    expect(ranksToPlaces(rows)).toEqual(places);
    // In any order: the places come back the same (equals in any order).
    expect(ranksToPlaces([...rows].reverse()).map((g) => g.sort())).toEqual(places);
  });

  test("a ballot is up to ten, none twice, no empty groups", () => {
    expect(validPlaces([["a"], ["b", "c"]])).toBe(true);
    expect(validPlaces([])).toBe(false);
    expect(validPlaces([["a"], []])).toBe(false);
    expect(validPlaces([["a"], ["a"]])).toBe(false);
    expect(validPlaces([...Array(11).keys()].map((i) => [`n${i}`]))).toBe(false);
  });

  test("points add up over ballots; most points wins", () => {
    const r = countPoints(["a", "b", "c", "d"], [
      [["a"], ["b"]],
      [["b"], ["a"]],
      [["b", "c"]],
    ]);
    expect(r.points).toEqual({ a: 19, b: 28.5, c: 9.5, d: 0 });
    expect(r.placed).toEqual({ a: 2, b: 3, c: 1, d: 0 });
    expect(r.ballots).toBe(3);
    expect(r.winners).toEqual(["b"]);
    expect(r.order).toEqual(["b", "a", "c", "d"]);
  });

  test("a tie on points goes to more first places, then more ballots; else it's shared", () => {
    // a and b both 10 points: a from one first place, b from a second and a tenth.
    const ids = "abcdefghijk".split("");
    const r = countPoints(ids, [[["a"]], [["c"], ["b"]], "cdefghijkb".split("").map((x) => [x])]);
    expect([r.points.a, r.points.b]).toEqual([10, 10]);
    expect(r.order.indexOf("a")).toBeLessThan(r.order.indexOf("b"));
    const even = countPoints(["a", "b"], [[["a"], ["b"]], [["b"], ["a"]]]);
    expect(even.winners).toEqual(["a", "b"]);
  });

  test("no ballots, no winner; unknown and repeated nominees are ignored", () => {
    expect(countPoints(["a"], []).winners).toEqual([]);
    const r = countPoints(["a", "b"], [[["a", "x"], ["a"], ["b"]]]);
    expect(r.points).toEqual({ a: 10, b: 9 });
  });
});

describe("runoffTop", () => {
  test("keeps eliminating past a majority until k are left, best first", () => {
    // a has a majority from the start, but the top two are wanted.
    const r = runoffTop(["a", "b", "c", "d"], [...repeat(6, ["a"]), ...repeat(3, ["b"]), ["c", "b"], ["d", "c"]], 2);
    expect(r.top).toEqual(["a", "b"]);
    expect(r.tied).toEqual([]);
  });

  test("ballots move on as nominees go out", () => {
    // c's two voters prefer b next, so b passes a for second.
    const ballots = [...repeat(6, ["x"]), ...repeat(4, ["a"]), ...repeat(3, ["b"]), ...repeat(2, ["c", "b"])];
    expect(runoffTop(["x", "a", "b", "c"], ballots, 2).top).toEqual(["x", "b"]);
  });

  test("a tie at the cut is left for an admin", () => {
    const r = runoffTop(["a", "b", "c"], [...repeat(3, ["a"]), ["b"], ["c"]], 2);
    expect(r.top).toEqual(["a"]);
    expect(r.tied.sort()).toEqual(["b", "c"]);
  });

  test("fewer nominees than k: all of them", () => {
    expect(runoffTop(["a"], [["a"]], 2).top).toEqual(["a"]);
  });
});
