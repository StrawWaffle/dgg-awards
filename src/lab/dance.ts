/**
 * The big screen's crowd dancing: jumps in a smooth arc (up from the ground,
 * not a snap to mid-air) and the four ways to move to the music that rinlux
 * can pick between. Plain data, so `tests/dance.test.ts` can check it.
 */

/** The part of a character on stage that dances. */
export type Dancer = {
  /** When the jump leaves the ground (it can be a moment from now), how high (1 a full jump) and for how long, in ms. */
  jumpAt: number;
  jumpH: number;
  jumpDur: number;
  /** A little bounce on a beat, from this time. */
  bobAt: number;
  /** "Their own little hops": when this one hops next. */
  nextHop: number;
};

/** The settings' choices, in order. */
export const MOVES: { id: Moves; label: string }[] = [
  { id: "together", label: "Together on each bar" },
  { id: "some", label: "A few at a time" },
  { id: "own", label: "Their own little hops" },
  { id: "walk", label: "Just walking" },
];

/** A dancer standing still, its next hop up to `spread` ms from `now`. */
export const standing = (now: number, spread = 6000): Dancer => ({
  jumpAt: -1e9,
  jumpH: 0,
  jumpDur: 1,
  bobAt: -1e9,
  nextHop: now + Math.random() * spread,
});

/**
 * How the crowd moves to the music, picked in the gear's settings for rinlux to try:
 * - `together`: everyone jumps on the one of each bar, each a little early or late and to their own height
 * - `some`: on each bar a few jump, never all at once
 * - `own`: no beat; each hops now and then on their own
 * - `walk`: no jumping, just walking around
 * Chatting, a combo and a winner still make them jump in all four.
 */
export type Moves = "together" | "some" | "own" | "walk";

/** How long a landing's squash (and a beat's bounce) lasts, in ms. */
export const LAND_MS = 140;

/** Start a jump `delay` ms from now. One already well in the air lands first. */
export function jump(n: Dancer, now: number, strength: number, delay = 0) {
  if (lift(n, now) > 0.25) return;
  n.jumpAt = now + delay;
  n.jumpH = strength;
  n.jumpDur = 320 + 140 * Math.min(1.5, strength);
}

/** How high it is now: up from the ground and back in a smooth arc, 0 to its jump's height. */
export function lift(n: Dancer, now: number) {
  const t = (now - n.jumpAt) / n.jumpDur;
  return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * n.jumpH;
}

/** How squashed it is now, 0 to 1: just landed from a jump, or a beat's bounce. */
export function squash(n: Dancer, now: number) {
  const landed = now - (n.jumpAt + n.jumpDur);
  const fromJump = landed >= 0 && landed < LAND_MS ? (1 - landed / LAND_MS) * Math.min(1, n.jumpH) : 0;
  const sinceBob = now - n.bobAt;
  const fromBob = sinceBob >= 0 && sinceBob < LAND_MS ? 1 - sinceBob / LAND_MS : 0;
  return Math.max(fromJump, fromBob);
}

/** This frame's move to the music for one character, by the setting. */
export function dance(n: Dancer, now: number, moves: Moves, downbeat: boolean, beat: boolean) {
  if (moves === "together") {
    if (downbeat) jump(n, now, 0.75 + Math.random() * 0.25, Math.random() * 90);
    else if (beat) n.bobAt = now + Math.random() * 60;
  } else if (moves === "some") {
    if (downbeat && Math.random() < 0.3) jump(n, now, 0.6 + Math.random() * 0.4, Math.random() * 160);
    else if (beat && Math.random() < 0.2) n.bobAt = now + Math.random() * 80;
  } else if (moves === "own" && now >= n.nextHop) {
    jump(n, now, 0.35 + Math.random() * 0.4);
    n.nextHop = now + 2500 + Math.random() * 6000;
  }
}
