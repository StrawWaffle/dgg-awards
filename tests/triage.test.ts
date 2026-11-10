import { describe, expect, test } from "bun:test";
import { current } from "@/lab/rank";
import { type TriageState, type Verdict, apply, card, phase, result, start } from "@/lab/triage";

const names = (n: number) => [...Array(n).keys()].map((i) => `n${i}`);
const value = (id: string) => Number(id.slice(1));

/** Swipe by a rule, then answer the knockout by value (higher is better). */
function run(ids: string[], swipe: (id: string) => Verdict, again: (id: string) => boolean = () => true) {
  let s: TriageState = start(ids);
  while (phase(s) === "swipe" || phase(s) === "again") {
    const c = card(s)!;
    s = apply(s, { swipe: phase(s) === "again" ? (again(c.id) ? "yes" : "no") : swipe(c.id) });
  }
  let comparisons = 0;
  while (phase(s) === "compare") {
    const m = current(s.bracket!)!;
    s = apply(s, value(m.left[0]!) > value(m.right[0]!) ? "left" : "right");
    comparisons++;
  }
  return { s, comparisons };
}

describe("swipe, then compare the finalists", () => {
  test("15 yeses of 67: 67 swipes, then only they are compared, for the right top ten", () => {
    const { s, comparisons } = run(names(67), (id) => (value(id) >= 52 ? "yes" : value(id) >= 45 ? "maybe" : "no"));
    expect(s.swipes).toBe(67);
    expect(s.finalists).toHaveLength(15);
    expect(result(s)).toEqual([...Array(10).keys()].map((i) => [`n${66 - i}`]));
    expect(comparisons).toBeLessThan(50);
    expect(phase(s)).toBe("done");
  });

  test("too few yeses: the maybes join", () => {
    const { s } = run(names(30), (id) => (value(id) >= 25 ? "yes" : value(id) >= 20 ? "maybe" : "no"));
    expect(s.finalists).toHaveLength(10);
    expect(result(s).flat()).toHaveLength(10);
  });

  test("fewer than ten in all: they're ranked, and that's the top", () => {
    const { s } = run(names(20), (id) => (value(id) >= 16 ? "yes" : "no"));
    expect(s.finalists).toHaveLength(4);
    expect(result(s)).toEqual([["n19"], ["n18"], ["n17"], ["n16"]]);
  });

  test("too many yeses: one more pass over them only, yes or no", () => {
    let s = start(names(40));
    for (let i = 0; i < 40; i++) s = apply(s, { swipe: value(card(s)!.id) >= 15 ? "yes" : "no" });
    expect(phase(s)).toBe("again");
    expect(card(s)).toMatchObject({ n: 1, of: 25, kept: 0 });
    expect(() => apply(s, { swipe: "maybe" })).toThrow();
    const { s: done } = run(names(40), (id) => (value(id) >= 15 ? "yes" : "no"), (id) => value(id) >= 27);
    expect(done.swipes).toBe(40 + 25);
    expect(done.finalists).toHaveLength(13);
    expect(result(done)).toEqual([...Array(10).keys()].map((i) => [`n${39 - i}`]));
  });

  test("the second pass keeping too few: the whole yes pile goes on", () => {
    const { s } = run(names(40), (id) => (value(id) >= 15 ? "yes" : "no"), (id) => value(id) >= 35);
    expect(s.finalists).toHaveLength(25);
  });

  test("the first card says how the swiping goes", () => {
    let s = start(names(5));
    expect(card(s)).toEqual({ id: "n0", n: 1, of: 5, yes: 0, maybe: 0 });
    s = apply(s, { swipe: "yes" });
    s = apply(s, { swipe: "maybe" });
    expect(card(s)).toEqual({ id: "n2", n: 3, of: 5, yes: 1, maybe: 1 });
    expect(() => apply(s, "left")).toThrow();
  });
});
