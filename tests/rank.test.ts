import { describe, expect, test } from "bun:test";
import { type Choice, type RankState, batchesOf, choose, currentBatch, expectedLeft, mostLeft, rankBatch, start } from "@/lab/rank";

/** Answer every question from a known score (higher is better; equal scores tie). */
function run(ids: string[], score: (id: string) => number, size = 1) {
  let s: RankState = start(ids, size);
  const seen: number[] = [mostLeft(s)];
  while (s.phase !== "done") {
    if (s.phase === "batches") {
      const batch = currentBatch(s)!;
      const scores = [...new Set(batch.map(score))].sort((a, b) => b - a);
      s = rankBatch(s, scores.map((v) => batch.filter((id) => score(id) === v)));
    } else {
      const a = score(s.left[0]![0]!);
      const b = score(s.right[0]![0]!);
      const c: Choice = a > b ? "left" : a < b ? "right" : "tie";
      s = choose(s, c);
    }
    seen.push(mostLeft(s));
  }
  return { result: s.result, asked: s.asked, seen };
}

describe("ranking with ties", () => {
  test("batches are as even as they can be", () => {
    expect(batchesOf([...Array(11).keys()]).map((b) => b.length)).toEqual([4, 3, 4]);
    expect(batchesOf([...Array(67).keys()]).map((b) => b.length).sort()).toEqual([4, 4, 4, ...Array(11).fill(5)].sort());
    expect(batchesOf([...Array(5).keys()]).map((b) => b.length)).toEqual([5]);
  });

  test("67 distinct items come out in order", () => {
    const ids = [...Array(67).keys()].map((i) => `n${i}`).sort(() => Math.random() - 0.5);
    const { result, asked } = run(ids, (id) => Number(id.slice(1)));
    expect(result).toEqual([...Array(67).keys()].reverse().map((i) => [`n${i}`]));
    expect(asked).toBeLessThan(67 * 7);
  });

  test("ties stay together, however they're met", () => {
    const ids = [...Array(40).keys()].map((i) => `n${i}`).sort(() => Math.random() - 0.5);
    const tier = (id: string) => Math.floor(Number(id.slice(1)) / 7); // 6 tiers of 7, one of 5
    const { result } = run(ids, tier);
    expect(result.map((g) => g.length)).toEqual([5, 7, 7, 7, 7, 7]);
    for (const g of result) expect(new Set(g.map(tier)).size).toBe(1);
    expect(result.map((g) => tier(g[0]!))).toEqual([5, 4, 3, 2, 1, 0]);
  });

  test("the questions left never go up, and end at zero", () => {
    const ids = [...Array(23).keys()].map((i) => `n${i}`);
    const { seen } = run(ids, (id) => Number(id.slice(1)) % 4);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)).toBe(0);
  });

  test("in batches of five, too", () => {
    const ids = [...Array(31).keys()].map((i) => `n${i}`).sort(() => Math.random() - 0.5);
    const { result } = run(ids, (id) => Number(id.slice(1)), 5);
    expect(result).toEqual([...Array(31).keys()].reverse().map((i) => [`n${i}`]));
  });

  test("67 one by one: the estimate is below the most, and close to what it takes", () => {
    const s = start([...Array(67).keys()].map((i) => `n${i}`));
    expect(s.phase).toBe("merge");
    expect(mostLeft(s)).toBe(67 * 7 - 2 ** 7 + 1 - 0); // n·⌈log2 n⌉ − 2^⌈log2 n⌉ + 1 for bottom-up pairs
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const ids = [...Array(67).keys()].map((i) => `n${i}`).sort(() => Math.random() - 0.5);
      total += run(ids, (id) => Number(id.slice(1))).asked;
    }
    const average = total / 20;
    expect(expectedLeft(s)).toBeLessThan(mostLeft(s));
    expect(Math.abs(expectedLeft(s) - average)).toBeLessThan(15);
  });

  test("a batch must be ranked whole", () => {
    const s = start(["a", "b", "c"], 5);
    expect(() => rankBatch(s, [["a"], ["b"]])).toThrow();
    expect(rankBatch(s, [["a", "b", "c"]]).phase).toBe("done");
  });
});
