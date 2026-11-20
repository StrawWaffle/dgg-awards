import { describe, expect, test } from "bun:test";
import { type Timing, nextOpening, roundsOf, votableNow } from "@/lib/rounds";

const site = { viewingMode: "voting", startTime: "1000", endTime: "2000" };
const main: Timing = { id: "ally", nominees: 3 };
const wild = { id: "wild", round: "W", opensAt: 100, closesAt: 200, nominees: 60 };
const group = { id: "g", round: "G", opensAt: 300, closesAt: 400, nominees: 12 };
const final: Timing = { id: "final", nominees: 0 };
const ids = (now: number, awards = [main, wild, group, final]) => votableNow(awards, site, now).map((a) => a.id);

describe("votableNow", () => {
  test("a round on its own while it's open, then the main vote", () => {
    expect(ids(150)).toEqual(["wild"]);
    expect(ids(250)).toEqual([]);
    expect(ids(350)).toEqual(["g"]);
    expect(ids(1500)).toEqual(["ally"]);
  });
  test("an award with no nominees is never open", () => {
    expect(ids(1500, [main, { ...final, nominees: 10 }])).toEqual(["ally", "final"]);
    expect(ids(1500, [main, final])).toEqual(["ally"]);
  });
  test("a round without dates votes with the main vote, not instead of it", () => {
    expect(ids(1500, [main, { id: "g2", round: "G", nominees: 12 }])).toEqual(["ally", "g2"]);
  });
  test("nothing outside voting mode", () => {
    expect(votableNow([main, wild], { ...site, viewingMode: "locked" }, 150)).toEqual([]);
  });
});

describe("rounds and what opens next", () => {
  test("rounds come from awards with dates, in order", () => {
    expect(roundsOf([group, wild, main, { id: "x", round: "G", opensAt: 280, closesAt: 410 }])).toEqual([
      { name: "W", opensAt: 100, closesAt: 200 },
      { name: "G", opensAt: 280, closesAt: 410 },
    ]);
  });
  test("the next opening is a round's or the main vote's", () => {
    const rounds = roundsOf([wild, group]);
    expect(nextOpening(site, rounds, 50)).toEqual({ at: 100, name: "W" });
    expect(nextOpening(site, rounds, 250)).toEqual({ at: 300, name: "G" });
    expect(nextOpening(site, rounds, 500)).toEqual({ at: 1000, name: null });
    expect(nextOpening(site, rounds, 1500)).toBeNull();
  });
});
