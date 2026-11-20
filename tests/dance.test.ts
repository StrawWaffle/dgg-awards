import { describe, expect, test } from "bun:test";
import { type Dancer, type Moves, dance, jump, lift, squash, standing } from "@/lab/dance";

const crowd = (n: number) => Array.from({ length: n }, () => standing(0));
/** Heights over a jump, every 10 ms from when it was asked for. */
const arc = (d: Dancer, from: number, ms: number) => Array.from({ length: ms / 10 }, (_, i) => lift(d, from + i * 10));

describe("a jump", () => {
  test("starts on the ground and rises smoothly, without a snap to mid-air", () => {
    const d = standing(0);
    jump(d, 1000, 1);
    const h = arc(d, 1000, 600);
    expect(h[0]).toBe(0);
    // No step between frames bigger than a tenth of the jump.
    for (let i = 1; i < h.length; i++) expect(Math.abs(h[i]! - h[i - 1]!)).toBeLessThan(0.1);
    expect(Math.max(...h)).toBeCloseTo(1, 1);
    expect(h.at(-1)).toBe(0);
  });

  test("lands with a squash", () => {
    const d = standing(0);
    jump(d, 0, 1);
    expect(squash(d, d.jumpDur + 10)).toBeGreaterThan(0.5);
    expect(squash(d, d.jumpDur + 500)).toBe(0);
  });

  test("waits for its delay", () => {
    const d = standing(0);
    jump(d, 0, 1, 80);
    expect(lift(d, 50)).toBe(0);
    expect(lift(d, 200)).toBeGreaterThan(0);
  });

  test("one well in the air isn't restarted", () => {
    const d = standing(0);
    jump(d, 0, 1);
    const at = d.jumpAt;
    jump(d, 150, 0.5);
    expect(d.jumpAt).toBe(at);
  });
});

describe("dancing", () => {
  /** On a downbeat at 0: how many are in the air at some point, and how spread their take-offs are. */
  const downbeat = (moves: Moves) => {
    const all = crowd(200);
    for (const d of all) dance(d, 0, moves, true, true);
    const jumped = all.filter((d) => d.jumpAt >= 0);
    return { share: jumped.length / all.length, starts: jumped.map((d) => d.jumpAt), heights: jumped.map((d) => d.jumpH) };
  };

  test("together: everyone jumps on the one, not on the same frame or to the same height", () => {
    const { share, starts, heights } = downbeat("together");
    expect(share).toBe(1);
    expect(new Set(starts.map((s) => Math.round(s / 10))).size).toBeGreaterThan(5);
    expect(Math.max(...starts)).toBeLessThan(100);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.1);
  });

  test("a few at a time: some jump on each bar, never everyone", () => {
    const { share } = downbeat("some");
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.45);
  });

  test("their own hops: no beat, each on its own time", () => {
    expect(downbeat("own").share).toBe(0);
    const all = crowd(200);
    // Over ten seconds of frames, everyone hops at some point, at different times.
    for (let t = 0; t <= 10_000; t += 16) for (const d of all) dance(d, t, "own", false, false);
    expect(all.every((d) => d.jumpAt >= 0)).toBe(true);
    expect(new Set(all.map((d) => Math.round(d.jumpAt / 100))).size).toBeGreaterThan(30);
  });

  test("just walking: no jumps or bounces", () => {
    const all = crowd(50);
    for (let t = 0; t <= 10_000; t += 16) for (const d of all) dance(d, t, "walk", t % 500 === 0, true);
    expect(all.every((d) => d.jumpAt < 0 && d.bobAt < 0)).toBe(true);
  });
});
