// Ranking many things by hand, with ties: merge sort, asking a person. Lists
// are merged two at a time by picking the better of two (or "equal"). With
// `size` above 1 it starts from small batches ranked whole instead of single
// items (tried first; picking from two all the way was quicker in practice).
// A tie joins the two into one group, which then moves as one, so ties are
// kept without asking more questions (if A = B and B = C, then A = C).
//
// The state is plain data (JSON), so it can be saved and stepped back.

/** Things ranked equal. */
export type Group = string[];
/** Best first. */
export type Ranking = Group[];

export type RankState =
  | { phase: "batches"; batches: string[][]; ranked: Ranking[]; asked: number }
  | { phase: "merge"; queue: Ranking[]; left: Ranking; right: Ranking; out: Ranking; asked: number }
  | { phase: "done"; result: Ranking; asked: number };

export type Choice = "left" | "right" | "tie";

/** Split into batches of at most `size`, as even as they can be (11 → 4, 4, 3). */
export function batchesOf<T>(items: T[], size = 5): T[][] {
  const count = Math.ceil(items.length / size);
  const out: T[][] = [];
  for (let i = 0; i < count; i++) out.push(items.slice(Math.round((i * items.length) / count), Math.round(((i + 1) * items.length) / count)));
  return out;
}

/** Start: the items one by one (or in batches), in the order given (shuffle them first for a fair mix). */
export function start(ids: string[], size = 1): RankState {
  return next({ phase: "batches", batches: batchesOf(ids, size), ranked: [], asked: 0 });
}

/** The batch to rank now, if it's that phase. */
export function currentBatch(state: RankState) {
  return state.phase === "batches" ? state.batches[state.ranked.length]! : null;
}

/** Rank the current batch: its items in groups, best first. */
export function rankBatch(state: RankState, ranking: Ranking): RankState {
  if (state.phase !== "batches") throw new Error("Not ranking batches.");
  const batch = state.batches[state.ranked.length]!;
  const given = ranking.flat();
  if (given.length !== batch.length || !batch.every((id) => given.includes(id))) throw new Error("Rank every item of the batch, once.");
  return next({ ...state, ranked: [...state.ranked, ranking.filter((g) => g.length)], asked: state.asked + 1 });
}

/** Pick between the two groups shown. */
export function choose(state: RankState, choice: Choice): RankState {
  if (state.phase !== "merge") throw new Error("Not comparing.");
  const [a, ...left] = state.left;
  const [b, ...right] = state.right;
  const asked = state.asked + 1;
  if (choice === "left") return next({ ...state, left, out: [...state.out, a!], asked });
  if (choice === "right") return next({ ...state, right, out: [...state.out, b!], asked });
  return next({ ...state, left, right, out: [...state.out, [...a!, ...b!]], asked });
}

/** Move on until there's a question to ask (a batch with more than one item, or two groups to compare). */
function next(state: RankState): RankState {
  if (state.phase === "batches") {
    // A batch of one ranks itself.
    while (state.ranked.length < state.batches.length && state.batches[state.ranked.length]!.length < 2) {
      state = { ...state, ranked: [...state.ranked, state.batches[state.ranked.length]!.map((id) => [id])] };
    }
    if (state.ranked.length < state.batches.length) return state;
    return merge(state.ranked, state.asked);
  }
  if (state.phase === "merge" && (!state.left.length || !state.right.length)) {
    const merged = [...state.out, ...state.left, ...state.right];
    return merge([...state.queue, merged], state.asked);
  }
  return state;
}

/** Merge the first two rankings in the queue (the result goes to the back), or finish. */
function merge(queue: Ranking[], asked: number): RankState {
  if (queue.length <= 1) return { phase: "done", result: queue[0] ?? [], asked };
  const [left, right, ...rest] = queue;
  return next({ phase: "merge", queue: rest, left: left!, right: right!, out: [], asked });
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

function questionsLeft(state: RankState, merge: (a: number, b: number) => number): number {
  if (state.phase === "done") return 0;
  let queue: number[];
  let now = 0;
  if (state.phase === "batches") {
    const left = state.batches.slice(state.ranked.length);
    now = left.filter((b) => b.length > 1).length;
    queue = [...state.ranked.map((r) => r.length), ...left.map((b) => b.length)];
  } else {
    now = merge(state.left.length, state.right.length);
    queue = [...state.queue.map((r) => r.length), state.out.length + state.left.length + state.right.length];
  }
  while (queue.length > 1) {
    const [a, b, ...rest] = queue;
    now += merge(a!, b!);
    queue = [...rest, a! + b!];
  }
  return now;
}
