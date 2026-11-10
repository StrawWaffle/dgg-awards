// Ranking many things by hand, with ties: insertion, asking a person. The
// items are placed one at a time into the list ranked so far, each by
// comparing with the midpoint of where it could still land (binary search),
// so every question halves what's left to learn about it. "Equal" puts it in
// that group: ties cost nothing extra, and if A = B and B = C, then A = C.
//
// With `top` (say 10), only the best that many matter. Once ten are placed, a
// newcomer is first compared with whoever holds 10th place: worse, and they're
// out after one question, never asked about again; better, and the midpoint
// questions place them among the top. Equals may share places in the top, but
// if a group of equals ends up crossing the line (four tied for places 8 to
// 11), the person picks exactly the ones that fit (three); those stay equal.
//
// (Merge sort was tried first: its comparisons felt random, and splitting a
// group meant ranking it all over again.)
//
// The state is plain data (JSON), so it can be saved and stepped back.

/** Things ranked equal. */
export type Group = string[];
/** Best first. */
export type Ranking = Group[];

export type RankState = {
  top: number | null;
  /** Not placed yet, in the order they'll come. */
  queue: string[];
  /** Placed so far, best first. */
  ranked: Ranking;
  /** Dropped: can't make the top any more. */
  out: string[];
  /** The one being placed, and the groups (by index) it could still land among: [lo, hi). */
  cur: string | null;
  lo: number;
  hi: number;
  /** The group it's compared with now. */
  probe: number;
  asked: number;
};

export type Choice = "left" | "right" | "tie";
/** Answers, as saved: a comparison, or the ones kept out of a group crossing the line. */
export type Step = Choice | { keep: string[] };

const count = (r: Ranking) => r.reduce((n, g) => n + g.length, 0);

/** Start: the items in the order given (shuffle them first for a fair mix). */
export function start(ids: string[], top: number | null = null): RankState {
  return next({ top, queue: ids, ranked: [], out: [], cur: null, lo: 0, hi: 0, probe: 0, asked: 0 });
}

export type Phase = "compare" | "pick" | "done";
export function phase(s: RankState): Phase {
  if (s.cur) return "compare";
  return crossing(s) ? "pick" : "done";
}

/** The comparison being asked: the newcomer and the group it's measured against, with that group's first place. */
export function current(s: RankState) {
  if (!s.cur) return null;
  const group = s.ranked[s.probe]!;
  let place = 1;
  for (let i = 0; i < s.probe; i++) place += s.ranked[i]!.length;
  return { id: s.cur, group, place };
}

/** The group of equals crossing the top line, and how many of them fit. */
export function crossing(s: RankState): { group: Group; need: number; place: number } | null {
  if (s.top === null || s.cur || count(s.ranked) <= s.top) return null;
  const group = s.ranked.at(-1)!;
  const before = count(s.ranked) - group.length;
  return { group, need: s.top - before, place: before + 1 };
}

/** Pick between the newcomer (left) and the group it's compared with (right). */
export function choose(s: RankState, choice: Choice): RankState {
  if (!s.cur) throw new Error("Nothing to compare.");
  const asked = s.asked + 1;
  if (choice === "tie") {
    const ranked = s.ranked.map((g, i) => (i === s.probe ? [...g, s.cur!] : g));
    return next(trim({ ...s, ranked, cur: null, asked }));
  }
  const lo = choice === "left" ? s.lo : s.probe + 1;
  const hi = choice === "left" ? s.probe : s.hi;
  if (lo < hi) return { ...s, lo, hi, probe: Math.floor((lo + hi) / 2), asked };
  const ranked = [...s.ranked.slice(0, lo), [s.cur], ...s.ranked.slice(lo)];
  return next(trim({ ...s, ranked, cur: null, asked }));
}

/** Keep exactly the ones that fit out of the group crossing the line; the rest drop out. They stay equal. */
export function keep(s: RankState, ids: string[]): RankState {
  const x = crossing(s);
  if (!x) throw new Error("No group to split.");
  if (ids.length !== x.need || !ids.every((id) => x.group.includes(id))) throw new Error(`Keep exactly ${x.need} of them.`);
  const rest = x.group.filter((id) => !ids.includes(id));
  return { ...s, ranked: [...s.ranked.slice(0, -1), ids], out: [...s.out, ...rest], asked: s.asked + 1 };
}

export function apply(s: RankState, step: Step): RankState {
  return typeof step === "string" ? choose(s, step) : keep(s, step.keep);
}

/** With a top: groups that start past the line drop out (one crossing it stays, to be split at the end). */
function trim(s: RankState): RankState {
  if (s.top === null) return s;
  const ranked: Ranking = [];
  const out = [...s.out];
  let before = 0;
  for (const g of s.ranked) {
    if (before >= s.top) out.push(...g);
    else ranked.push(g);
    before += g.length;
  }
  return { ...s, ranked, out };
}

/** Take the next one from the queue and set up its first question. */
function next(s: RankState): RankState {
  if (s.cur || !s.queue.length) return s;
  const [cur, ...queue] = s.queue;
  if (!s.ranked.length) return next({ ...s, queue, ranked: [[cur!]] });
  const c = cutoff(s);
  // Once the top is full, the first question is against whoever holds the last place.
  if (c !== null) return { ...s, queue, cur: cur!, lo: 0, hi: c + 1, probe: c };
  return { ...s, queue, cur: cur!, lo: 0, hi: s.ranked.length, probe: Math.floor(s.ranked.length / 2) };
}

/** The index of the group holding the last place of the top, once that many are placed. */
function cutoff(s: RankState): number | null {
  if (s.top === null || count(s.ranked) < s.top) return null;
  let before = 0;
  for (let i = 0; i < s.ranked.length; i++) {
    before += s.ranked[i]!.length;
    if (before >= s.top) return i;
  }
  return null;
}

/**
 * Points for each place in the top: `top` for the first, down to 1. Equals
 * share the points of the places they take (tied for 3rd and 4th of ten:
 * (8 + 7) / 2 = 7.5 each).
 */
export function points(result: Ranking, top: number): { place: number; group: Group; points: number }[] {
  const rows = [];
  let place = 1;
  for (const group of result) {
    const taken = Array.from({ length: group.length }, (_, i) => Math.max(0, top + 1 - (place + i)));
    rows.push({ place, group, points: taken.reduce((a, b) => a + b, 0) / group.length });
    place += group.length;
  }
  return rows;
}

/** The most questions still to come (fewer with ties). */
export function mostLeft(s: RankState): number {
  return questionsLeft(s, (n) => Math.ceil(Math.log2(n + 1)), () => 1);
}

/**
 * About how many questions are still to come, with no more ties. In a top,
 * the k-th newcomer beats the cutoff with about top/k odds (random order), and
 * only then needs the midpoint questions.
 */
export function expectedLeft(s: RankState): number {
  return Math.round(questionsLeft(s, (n) => Math.log2(n + 1), (k) => Math.min(1, (s.top ?? 0) / k)));
}

/** `search(n)`: questions to place among n groups; `odds(k)`: that the k-th newcomer beats the cutoff. */
function questionsLeft(s: RankState, search: (n: number) => number, odds: (k: number) => number): number {
  let now = 0;
  let groups = s.ranked.length;
  let seen = count(s.ranked) + s.out.length;
  if (s.cur) {
    // The one on the table: however many of the groups it could still land among.
    now += Math.max(1, search(s.hi - s.lo) - 0) * (s.hi - s.lo > 0 ? 1 : 0);
    groups++;
    seen++;
  }
  for (let i = 0; i < s.queue.length; i++) {
    seen++;
    if (s.top !== null && seen - 1 >= s.top) {
      now += 1 + odds(seen) * search(Math.min(groups, s.top) - 1);
      groups = Math.min(groups + 1, s.top);
    } else {
      now += search(groups);
      groups++;
    }
  }
  return now;
}
