// Finding a person's top `top` of many, by asking them to pick between two,
// as a knockout tournament (Knuth, Sorting and Searching, 5.3.3). Everyone is
// paired off; winners meet winners; after n - 1 matches the winner is first
// place, which is the fewest choices any method can take for that. Second
// place can only be someone who lost to the first, and in a bracket that's
// about log2 n people, so the first's matches are replayed without them: a
// handful of choices per place. Those who lost to a loser are never asked
// about again. For 67 and a top 10: 123 to 126 choices, almost always.
//
// "Equal" merges the two into one unit, which goes on as one; a unit that
// wins holds that many places. If equals end up crossing the line (four tied
// for places 8 to 11), the person picks exactly the ones that fit.
//
// (Insertion against the cutoff was tried before: about 143 choices and up
// to 183; merge sort, 207. Comparing everyone with first place, as proposed,
// would be about 345: losing to the first tells almost nothing.)
//
// The state is plain data (JSON), so it can be saved and stepped back.

import { pointsForPlaces } from "@/lib/voting";

/** Equals, going on together. */
export type Group = string[];
/** Best first. */
export type Ranking = Group[];

export type RankState = {
  top: number;
  /**
   * The bracket, 1-based like a heap: node i's children are 2i and 2i+1;
   * leaves are size..2*size-1. A group is who's won there; null a bye or a
   * spot emptied by placing; undefined means it's not decided yet.
   */
  tree: (Group | null | undefined)[];
  size: number;
  /** Placed so far, best first. */
  placed: Ranking;
  /** Whoever beat each one, in order, so a card can say who they lost to. */
  lostTo: Record<string, string[]>;
  asked: number;
};

export type Choice = "left" | "right" | "tie";
/** Answers, as saved: a match, or the ones kept out of a group crossing the line. */
export type Step = Choice | { keep: string[] };

const count = (r: Ranking) => r.reduce((n, g) => n + g.length, 0);
const depth = (i: number) => Math.floor(Math.log2(i));

/** Start: the people in the order given (shuffle them first for a fair draw). */
export function start(ids: string[], top = 10): RankState {
  let size = 1;
  while (size < ids.length) size *= 2;
  const tree: (Group | null | undefined)[] = new Array(2 * size).fill(undefined);
  for (let i = 0; i < size; i++) tree[size + i] = i < ids.length ? [ids[i]!] : null;
  return settle({ top, tree, size, placed: [], lostTo: {}, asked: 0 });
}

export type Phase = "compare" | "pick" | "done";
export function phase(s: RankState): Phase {
  if (current(s)) return "compare";
  return crossing(s) ? "pick" : "done";
}

/** The match being asked: its two sides and where it is in the bracket. */
export function current(s: RankState) {
  const i = pending(s);
  if (i === null) return null;
  const left = s.tree[2 * i] as Group;
  const right = s.tree[2 * i + 1] as Group;
  // Rounds count from the leaves: the first round is the deepest matches.
  const round = Math.log2(s.size) - depth(i);
  return { node: i, left, right, round, rounds: Math.log2(s.size), placing: s.placed.length + 1 };
}

/** The deepest undecided match whose sides are both known (bracket order: round by round). */
function pending(s: RankState): number | null {
  for (let i = s.size - 1; i >= 1; i--) {
    if (s.tree[i] === undefined && s.tree[2 * i] && s.tree[2 * i + 1]) return i;
  }
  return null;
}

/** The group of equals crossing the top line, and how many of them fit. */
export function crossing(s: RankState): { group: Group; need: number; place: number } | null {
  if (count(s.placed) <= s.top) return null;
  const group = s.placed.at(-1)!;
  const before = count(s.placed) - group.length;
  return { group, need: s.top - before, place: before + 1 };
}

/** Decide the match on the table. */
export function choose(s: RankState, choice: Choice): RankState {
  const i = pending(s);
  if (i === null) throw new Error("No match to decide.");
  const left = s.tree[2 * i] as Group;
  const right = s.tree[2 * i + 1] as Group;
  const tree = [...s.tree];
  const lostTo = { ...s.lostTo };
  if (choice === "tie") tree[i] = [...left, ...right];
  else {
    const [winner, loser] = choice === "left" ? [left, right] : [right, left];
    tree[i] = winner;
    for (const id of loser) lostTo[id] = [...(lostTo[id] ?? []), ...winner];
  }
  return settle({ ...s, tree, lostTo, asked: s.asked + 1 });
}

/** Keep exactly the ones that fit out of the group crossing the line; the rest drop out. They stay equal. */
export function keep(s: RankState, ids: string[]): RankState {
  const x = crossing(s);
  if (!x) throw new Error("No group to split.");
  if (ids.length !== x.need || !ids.every((id) => x.group.includes(id))) throw new Error(`Keep exactly ${x.need} of them.`);
  return { ...s, placed: [...s.placed.slice(0, -1), ids], asked: s.asked + 1 };
}

export function apply(s: RankState, step: Step): RankState {
  return typeof step === "string" ? choose(s, step) : keep(s, step.keep);
}

/**
 * Walk the bracket on: byes go through without a match, a decided final
 * places the winner (and empties their spots, so their matches replay), until
 * a real match is waiting, or the top is full.
 */
function settle(s: RankState): RankState {
  const tree = [...s.tree];
  let placed = s.placed;
  for (;;) {
    let moved = false;
    for (let i = s.size - 1; i >= 1; i--) {
      if (tree[i] !== undefined) continue;
      const a = tree[2 * i];
      const b = tree[2 * i + 1];
      if (a === undefined || b === undefined) continue;
      if (a && b) continue; // a real match: wait for the answer
      tree[i] = a ?? b ?? null;
      moved = true;
    }
    if (tree[1] === undefined) {
      if (!moved) break;
      continue;
    }
    const winner = tree[1];
    if (winner === null || count(placed) >= s.top) break;
    placed = [...placed, winner];
    // Take the winner out: their leaves empty, and every match above replays.
    for (let leaf = s.size; leaf < 2 * s.size; leaf++) {
      const g = tree[leaf];
      if (g && g.every((id) => winner.includes(id))) {
        tree[leaf] = null;
        for (let i = leaf >> 1; i >= 1; i >>= 1) tree[i] = undefined;
      }
    }
  }
  return { ...s, tree, placed };
}

/** Still in the running: in the bracket, not placed. */
export function inPlay(s: RankState): string[] {
  const out: string[] = [];
  for (let leaf = s.size; leaf < 2 * s.size; leaf++) for (const id of s.tree[leaf] ?? []) out.push(id);
  return out;
}

/**
 * Points for each place in the top: `top` for the first, down to 1. Equals
 * share the points of the places they take (tied for 3rd and 4th of ten:
 * (8 + 7) / 2 = 7.5 each). The official vote counts the same way
 * (`pointsForPlaces` in src/lib/voting.ts).
 */
export function points(result: Ranking, top: number): { place: number; group: Group; points: number }[] {
  return pointsForPlaces(result, top);
}

/**
 * Choices still to come, if nobody ties: the matches left to decide the
 * bracket (units in play minus one), then about log2 of the bracket per
 * further place (`most` takes the full height each time).
 */
export function choicesLeft(s: RankState): { about: number; most: number } {
  if (count(s.placed) >= s.top) return { about: 0, most: 0 };
  // Units at the frontier: decided, with an undecided parent.
  let units = 0;
  for (let i = 2; i < 2 * s.size; i++) if (s.tree[i] && s.tree[i >> 1] === undefined) units++;
  const bracket = Math.max(0, units - 1);
  const places = s.top - count(s.placed) - 1;
  const height = Math.log2(s.size);
  return { about: Math.round(bracket + Math.max(0, places) * (height - 1.5)), most: bracket + Math.max(0, places) * height };
}
