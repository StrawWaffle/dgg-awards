// Ranking many things by hand, with ties: merge sort, asking a person. Lists
// are merged two at a time by picking the better of two (or "equal"). With
// `size` above 1 it starts from small batches ranked whole instead of single
// items (tried first; picking from two all the way was quicker in practice).
// A tie joins the two into one group, which then moves as one, so ties are
// kept without asking more questions (if A = B and B = C, then A = C).
//
// With `top` (say 10), only the best that many matter: a merge stops once it
// has that many, and the rest drop out, never asked about again. Equals may
// share places in the top, but a group that crosses the line (four tied for
// places 8 to 11) is split: the person ranks just that group, for the places
// left (three), and again if it still crosses.
//
// The state is plain data (JSON), so it can be saved and stepped back.

/** Things ranked equal. */
export type Group = string[];
/** Best first. */
export type Ranking = Group[];

type Common = { asked: number; top: number | null };
export type RankState = Common &
  (
    | { phase: "batches"; batches: string[][]; ranked: Ranking[] }
    | { phase: "merge"; queue: Ranking[]; left: Ranking; right: Ranking; out: Ranking }
    /** A group crossing the top line: `inner` ranks it for the `need` places left after `kept`. */
    | { phase: "split"; kept: Ranking; need: number; inner: RankState }
    | { phase: "done"; result: Ranking }
  );
export type MergeState = Extract<RankState, { phase: "merge" }>;

export type Choice = "left" | "right" | "tie";

const count = (r: Ranking) => r.reduce((n, g) => n + g.length, 0);

/** Split into batches of at most `size`, as even as they can be (11 → 4, 3, 4). */
export function batchesOf<T>(items: T[], size = 5): T[][] {
  const n = Math.ceil(items.length / size);
  const out: T[][] = [];
  for (let i = 0; i < n; i++) out.push(items.slice(Math.round((i * items.length) / n), Math.round(((i + 1) * items.length) / n)));
  return out;
}

/** Start: the items one by one (or in batches), in the order given (shuffle them first for a fair mix). */
export function start(ids: string[], size = 1, top: number | null = null): RankState {
  return next({ phase: "batches", batches: batchesOf(ids, size), ranked: [], asked: 0, top });
}

/** The batch to rank now, if it's that phase. */
export function currentBatch(state: RankState) {
  return state.phase === "batches" ? state.batches[state.ranked.length]! : null;
}

/** The comparison being asked, however deep in splits. */
export function currentMerge(state: RankState): MergeState | null {
  if (state.phase === "split") return currentMerge(state.inner);
  return state.phase === "merge" ? state : null;
}

/** While a group crossing the top line is being split: how many it is, the places it's for, and the first place. */
export function currentSplit(state: RankState): { size: number; need: number; from: number } | null {
  if (state.phase !== "split") return null;
  const deeper = currentSplit(state.inner);
  const from = count(state.kept) + 1;
  if (deeper) return { ...deeper, from: from + deeper.from - 1 };
  return { size: splitSize(state.inner), need: state.need, from };
}
function splitSize(s: RankState): number {
  if (s.phase === "batches") return s.batches.flat().length;
  if (s.phase === "merge") return count(s.out) + count(s.left) + count(s.right) + s.queue.reduce((n, r) => n + count(r), 0);
  if (s.phase === "split") return count(s.kept) + splitSize(s.inner);
  return count(s.result);
}

/** Rank the current batch: its items in groups, best first. */
export function rankBatch(state: RankState, ranking: Ranking): RankState {
  if (state.phase !== "batches") throw new Error("Not ranking batches.");
  const batch = state.batches[state.ranked.length]!;
  const given = ranking.flat();
  if (given.length !== batch.length || !batch.every((id) => given.includes(id))) throw new Error("Rank every item of the batch, once.");
  return next({ ...state, ranked: [...state.ranked, cut(ranking.filter((g) => g.length), state.top)], asked: state.asked + 1 });
}

/** Pick between the two groups shown. */
export function choose(state: RankState, choice: Choice): RankState {
  if (state.phase === "split") return next({ ...state, inner: choose(state.inner, choice), asked: state.asked + 1 });
  if (state.phase !== "merge") throw new Error("Not comparing.");
  const [a, ...left] = state.left;
  const [b, ...right] = state.right;
  const asked = state.asked + 1;
  if (choice === "left") return next({ ...state, left, out: [...state.out, a!], asked });
  if (choice === "right") return next({ ...state, right, out: [...state.out, b!], asked });
  return next({ ...state, left, right, out: [...state.out, [...a!, ...b!]], asked });
}

/** The groups that start within the top (a group crossing the line is kept whole, for now). */
function cut(r: Ranking, top: number | null): Ranking {
  if (top === null) return r;
  const kept: Ranking = [];
  let before = 0;
  for (const g of r) {
    if (before >= top) break;
    kept.push(g);
    before += g.length;
  }
  return kept;
}

/** Move on until there's a question to ask (a batch with more than one item, or two groups to compare). */
function next(state: RankState): RankState {
  const { top } = state;
  if (state.phase === "batches") {
    // A batch of one ranks itself.
    while (state.ranked.length < state.batches.length && state.batches[state.ranked.length]!.length < 2) {
      state = { ...state, ranked: [...state.ranked, state.batches[state.ranked.length]!.map((id) => [id])] };
    }
    if (state.ranked.length < state.batches.length) return state;
    return merge(state.ranked, state.asked, top);
  }
  if (state.phase === "merge") {
    // Done when a side runs out, or (with a top) once the top is full: the rest drop out.
    const full = top !== null && count(state.out) >= top;
    if (full || !state.left.length || !state.right.length) {
      const merged = full ? state.out : [...state.out, ...state.left, ...state.right];
      return merge([...state.queue, cut(merged, top)], state.asked, top);
    }
  }
  if (state.phase === "split" && state.inner.phase === "done") {
    return { phase: "done", result: [...state.kept, ...state.inner.result], asked: state.asked, top };
  }
  return state;
}

/** Merge the first two rankings in the queue (the result goes to the back), or finish. */
function merge(queue: Ranking[], asked: number, top: number | null): RankState {
  if (queue.length <= 1) return finish(queue[0] ?? [], asked, top);
  const [left, right, ...rest] = queue;
  return next({ phase: "merge", queue: rest, left: left!, right: right!, out: [], asked, top });
}

/** The end, unless a group of equals crosses the top line: then that group is split. */
function finish(result: Ranking, asked: number, top: number | null): RankState {
  if (top === null || count(result) <= top) return { phase: "done", result, asked, top };
  const kept = result.slice(0, -1);
  const need = top - count(kept);
  const group = result.at(-1)!;
  return next({ phase: "split", kept, need, inner: start(group, 1, need), asked, top });
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

/** The most questions still to come (fewer when there are ties, or one side runs out early). */
export function mostLeft(state: RankState): number {
  return questionsLeft(state, (a, b) => a + b - 1);
}

/**
 * About how many questions are still to come, if there are no more ties:
 * merging a random a and b takes a + b - a/(b+1) - b/(a+1) on average, as one
 * side usually runs out a little early. Every tie makes it fewer.
 */
export function expectedLeft(state: RankState): number {
  return Math.round(questionsLeft(state, (a, b) => a + b - a / (b + 1) - b / (a + 1)));
}

function questionsLeft(state: RankState, cost: (a: number, b: number) => number): number {
  const { top } = state;
  if (state.phase === "done") return 0;
  if (state.phase === "split") return questionsLeft(state.inner, cost);
  // With a top, a merge asks at most `top` questions (each places at least
  // one), and keeps at most `top`.
  const merge = (a: number, b: number) => (top === null ? cost(a, b) : Math.min(cost(a, b), top));
  const keep = (n: number) => (top === null ? n : Math.min(n, top));
  let queue: number[];
  let now = 0;
  if (state.phase === "batches") {
    const left = state.batches.slice(state.ranked.length);
    now = left.filter((b) => b.length > 1).length;
    queue = [...state.ranked.map((r) => r.length), ...left.map((b) => keep(b.length))];
  } else {
    const placed = state.out.length;
    now = top === null ? cost(state.left.length, state.right.length) : Math.min(cost(state.left.length, state.right.length), Math.max(0, top - count(state.out)));
    queue = [...state.queue.map((r) => r.length), keep(placed + state.left.length + state.right.length)];
  }
  while (queue.length > 1) {
    const [a, b, ...rest] = queue;
    now += merge(a!, b!);
    queue = [...rest, keep(a! + b!)];
  }
  return now;
}
