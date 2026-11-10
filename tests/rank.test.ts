import { describe, expect, test } from "bun:test";
import { type Choice, type RankState, choicesLeft, choose, crossing, current, inPlay, keep, phase, points, start } from "@/lab/rank";

/**
 * Answer every match from a known score (higher is better; equal scores tie).
 * A group crossing the line keeps the `need` best by `pick`.
 */
function run(ids: string[], score: (id: string) => number, top = 10, pick = (id: string) => score(id)) {
  let s: RankState = start(ids, top);
  let picks = 0;
  const seen: number[] = [choicesLeft(s).most];
  while (phase(s) !== "done") {
    if (phase(s) === "compare") {
      const m = current(s)!;
      const a = score(m.left[0]!);
      const b = score(m.right[0]!);
      const c: Choice = a > b ? "left" : a < b ? "right" : "tie";
      s = choose(s, c);
    } else {
      const x = crossing(s)!;
      s = keep(s, [...x.group].sort((p, q) => pick(q) - pick(p)).slice(0, x.need));
      picks++;
    }
    seen.push(choicesLeft(s).most);
  }
  return { result: s.placed, asked: s.asked, picks, seen, state: s };
}
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5);
const names = (n: number) => [...Array(n).keys()].map((i) => `n${i}`);
const value = (id: string) => Number(id.slice(1));

describe("a knockout for the top ten, with ties", () => {
  test("67 distinct: the best ten in order, in about 111 to 129 choices", () => {
    for (let i = 0; i < 20; i++) {
      const { result, asked, picks } = run(shuffle(names(67)), value);
      expect(result).toEqual([...Array(10).keys()].map((i) => [`n${66 - i}`]));
      expect(asked).toBeGreaterThanOrEqual(66 + 9 * 5);
      expect(asked).toBeLessThanOrEqual(66 + 9 * 7);
      expect(picks).toBe(0);
    }
  });

  test("first place takes exactly n - 1 matches, and the first round pairs everyone off", () => {
    let s = start(names(67));
    const m = current(s)!;
    expect([m.round, m.rounds, m.placing]).toEqual([1, 7, 1]);
    let n = 0;
    while (s.placed.length === 0) {
      const q = current(s)!;
      s = choose(s, value(q.left[0]!) > value(q.right[0]!) ? "left" : "right");
      n++;
    }
    expect(n).toBe(66);
    expect(s.placed).toEqual([["n66"]]);
    expect(current(s)!.placing).toBe(2);
    expect(inPlay(s)).toHaveLength(66);
  });

  test("ties go on together and share places and points", () => {
    const score = (id: string) => (value(id) < 3 ? 100 : value(id) < 6 ? 90 : 80 - value(id));
    const { result, picks } = run(shuffle(names(30)), score);
    expect(result.map((g) => g.length)).toEqual([3, 3, 1, 1, 1, 1]);
    expect(result[0]!.sort()).toEqual(["n0", "n1", "n2"]);
    expect(picks).toBe(0);
    expect(points(result, 10).map((r) => r.points)).toEqual([9, 6, 4, 3, 2, 1]);
  });

  test("a group crossing the line is one pick of exactly those who fit", () => {
    const score = (id: string) => (value(id) < 8 ? 100 - value(id) : value(id) < 13 ? 50 : 10 - value(id));
    const pick = (id: string) => (["n8", "n9"].includes(id) ? 1 : 0);
    const { result, picks } = run(shuffle(names(25)), score, 10, pick);
    expect(picks).toBe(1);
    expect(result.slice(0, 8)).toEqual(names(8).map((i) => [i]));
    expect(result[8]!.sort()).toEqual(["n8", "n9"]);
    expect(points(result, 10).at(-1)!.points).toBe(1.5);
  });

  test("keep() wants exactly the number that fit", () => {
    let s = start(names(12));
    while (phase(s) === "compare") s = choose(s, "tie");
    const x = crossing(s)!;
    expect([x.group.length, x.need, x.place]).toEqual([12, 10, 1]);
    expect(() => keep(s, x.group.slice(0, 9))).toThrow();
    expect(() => keep(s, [...x.group.slice(0, 9), "nope"])).toThrow();
    s = keep(s, x.group.slice(0, 10));
    expect(phase(s)).toBe("done");
  });

  test("who each one lost to is kept", () => {
    const { state } = run(names(8), value);
    expect(state.lostTo.n0).toEqual(["n1"]);
    expect(state.lostTo.n6).toEqual(["n7"]);
    expect(state.lostTo.n7).toBeUndefined();
  });

  test("the most to go never rises during matches, and ends at zero", () => {
    const { seen } = run(shuffle(names(40)), value);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)).toBe(0);
  });

  test("the estimate is close", () => {
    const { about, most } = choicesLeft(start(names(67)));
    expect(most).toBe(66 + 9 * 7);
    expect(Math.abs(about - 123)).toBeLessThan(10);
  });
});
