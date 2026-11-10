import { describe, expect, test } from "bun:test";
import { type Choice, type RankState, choose, crossing, current, expectedLeft, keep, mostLeft, phase, points, start } from "@/lab/rank";

/**
 * Answer every question from a known score (higher is better; equal scores
 * tie). A group crossing the top line keeps the `need` best by `pick` (as a
 * person must choose, somehow).
 */
function run(ids: string[], score: (id: string) => number, top: number | null = null, pick = (id: string) => score(id)) {
  let s: RankState = start(ids, top);
  const seen: number[] = [mostLeft(s)];
  let picks = 0;
  while (phase(s) !== "done") {
    if (phase(s) === "compare") {
      const q = current(s)!;
      const a = score(q.id);
      const b = score(q.group[0]!);
      const c: Choice = a > b ? "left" : a < b ? "right" : "tie";
      s = choose(s, c);
    } else {
      const x = crossing(s)!;
      s = keep(s, [...x.group].sort((p, q) => pick(q) - pick(p)).slice(0, x.need));
      picks++;
    }
    seen.push(mostLeft(s));
  }
  return { result: s.ranked, out: s.out, asked: s.asked, seen, picks };
}
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5);
const names = (n: number) => [...Array(n).keys()].map((i) => `n${i}`);
const value = (id: string) => Number(id.slice(1));

describe("ranking by insertion, with ties", () => {
  test("67 distinct items come out in order, in about n log n questions", () => {
    const { result, asked, out } = run(shuffle(names(67)), value);
    expect(result).toEqual(names(67).reverse().map((i) => [i]));
    expect(out).toEqual([]);
    expect(asked).toBeLessThan(67 * 7);
    expect(asked).toBeGreaterThan(67 * 4);
  });

  test("ties stay together, however they're met", () => {
    const tier = (id: string) => Math.floor(value(id) / 7); // 6 tiers of 7, one of 5
    const { result } = run(shuffle(names(40)), tier);
    expect(result.map((g) => g.length)).toEqual([5, 7, 7, 7, 7, 7]);
    for (const g of result) expect(new Set(g.map(tier)).size).toBe(1);
    expect(result.map((g) => tier(g[0]!))).toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("the most to go never rises while comparing, and ends at zero", () => {
    const { seen } = run(names(23), value);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)).toBe(0);
  });

  test("top 10 of 67: the best ten in order, in far fewer questions, most out after one", () => {
    const ids = shuffle(names(67));
    const all = run(ids, value);
    const top = run(ids, value, 10);
    expect(top.result).toEqual([...Array(10).keys()].map((i) => [`n${66 - i}`]));
    expect(top.out).toHaveLength(57);
    expect(top.asked).toBeLessThan(all.asked * 0.6);
    expect(top.picks).toBe(0);
    // The 11th and later newcomers each cost at least one question; those who
    // beat the cutoff cost a few more.
    expect(top.asked).toBeGreaterThan(57);
  });

  test("top 10: equals inside the top share places and points", () => {
    const score = (id: string) => (value(id) < 3 ? 100 : value(id) < 6 ? 90 : 80 - value(id));
    const { result, picks } = run(shuffle(names(30)), score, 10);
    expect(result.map((g) => g.length)).toEqual([3, 3, 1, 1, 1, 1]);
    expect(picks).toBe(0);
    const rows = points(result, 10);
    expect(rows.map((r) => r.place)).toEqual([1, 4, 7, 8, 9, 10]);
    expect(rows.map((r) => r.points)).toEqual([9, 6, 4, 3, 2, 1]);
  });

  test("top 10: a group crossing the line is split in one pick of exactly those who fit", () => {
    // 8 clear ones, then 5 equal (places 9 to 13), then the rest.
    const score = (id: string) => (value(id) < 8 ? 100 - value(id) : value(id) < 13 ? 50 : 10 - value(id));
    const pick = (id: string) => (["n8", "n9"].includes(id) ? 1 : 0);
    const { result, out, picks, asked } = run(shuffle(names(25)), score, 10, pick);
    expect(picks).toBe(1);
    expect(result.slice(0, 8)).toEqual(names(8).map((i) => [i]));
    expect(result[8]!.sort()).toEqual(["n8", "n9"]);
    expect(result.flat()).toHaveLength(10);
    expect(out).toHaveLength(15);
    expect(points(result, 10).at(-1)!.points).toBe(1.5);
    expect(asked).toBeLessThan(25 * 4);
  });

  test("keep() wants exactly the number that fit", () => {
    let s = start(names(12), 10);
    while (phase(s) === "compare") s = choose(s, "tie"); // all twelve equal
    const x = crossing(s)!;
    expect([x.group.length, x.need, x.place]).toEqual([12, 10, 1]);
    expect(() => keep(s, x.group.slice(0, 9))).toThrow();
    expect(() => keep(s, [...x.group.slice(0, 9), "nope"])).toThrow();
    s = keep(s, x.group.slice(0, 10));
    expect(phase(s)).toBe("done");
    expect(s.out).toHaveLength(2);
  });

  test("the first question for a newcomer to a full top is against the cutoff", () => {
    let s = start(names(12), 10);
    // Place the first ten in order (each better than everyone so far: always "left").
    for (let i = 0; i < 10; i++) while (s.cur === `n${i}`) s = choose(s, "left");
    const q = current(s)!;
    expect(q.id).toBe("n10");
    expect(q.place).toBe(10);
    expect(q.group).toEqual(["n0"]);
    s = choose(s, "right"); // worse than the 10th: out at once
    expect(s.out).toEqual(["n10"]);
    expect(current(s)!.id).toBe("n11");
  });

  test("estimates: the top is well below the whole, and close to what it takes", () => {
    const ids = names(67);
    expect(expectedLeft(start(ids, 10))).toBeLessThan(expectedLeft(start(ids)) * 0.6);
    expect(expectedLeft(start(ids, 10))).toBeLessThanOrEqual(mostLeft(start(ids, 10)));
    let total = 0;
    for (let i = 0; i < 20; i++) total += run(shuffle(ids), value, 10).asked;
    expect(Math.abs(expectedLeft(start(ids, 10)) - total / 20)).toBeLessThan(20);
  });
});
