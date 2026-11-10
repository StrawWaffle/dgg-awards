// Your top ten with the least effort: swipe first, compare only the finalists.
//
// Comparing two people is a hard, relative choice; saying yes or no to one is
// quick (paired comparisons take about four times as long per item as a
// rating). And most of the 67 are clearly not top ten. So, as in a Q-sort:
//
// 1. Swipe through everyone once: yes (top ten material), no, or maybe.
// 2. The finalists: the yeses. Too many (over twice the top): one more quick
//    pass over the yeses only, "still a yes?". Too few: the maybes join. No
//    one else is looked at again.
// 3. Order the finalists with the knockout (src/lab/rank.ts), ties allowed:
//    only close calls between people you already approved.
//
// For 67 with about 15 yeses: 67 swipes and about 40 comparisons, against 123
// comparisons for the knockout alone. Plain data, so it can be saved and
// stepped back.
import { type Choice, type RankState, type Step as RankStep, apply as applyRank, phase as rankPhase, start as startRank } from "@/lab/rank";

export type Verdict = "yes" | "no" | "maybe";
/** Answers, as saved: a swipe, or a step of the knockout. */
export type Step = { swipe: Verdict } | RankStep;

export type TriageState = {
  top: number;
  order: string[];
  /** First pass: everyone, in order. */
  first: Verdict[];
  /** Second pass over the yeses, when there were too many: still a yes? */
  again: string[] | null;
  second: boolean[];
  /** Who's being compared, and the knockout among them, once the swipes are done. */
  finalists: string[] | null;
  bracket: RankState | null;
  swipes: number;
};

export function start(order: string[], top = 10): TriageState {
  return settle({ top, order, first: [], again: null, second: [], finalists: null, bracket: null, swipes: 0 });
}

export type Phase = "swipe" | "again" | "compare" | "pick" | "done";
export function phase(s: TriageState): Phase {
  if (!s.finalists) return s.again ? "again" : "swipe";
  return s.bracket ? rankPhase(s.bracket) : "done";
}

/** The card being swiped, and where we are. */
export function card(s: TriageState) {
  if (s.finalists) return null;
  if (s.again) {
    const i = s.second.length;
    return { id: s.again[i]!, n: i + 1, of: s.again.length, kept: s.second.filter(Boolean).length };
  }
  const i = s.first.length;
  return { id: s.order[i]!, n: i + 1, of: s.order.length, yes: count(s.first, "yes"), maybe: count(s.first, "maybe") };
}

const count = (vs: Verdict[], v: Verdict) => vs.filter((x) => x === v).length;
const pile = (s: TriageState, v: Verdict) => s.order.filter((_, i) => s.first[i] === v);

export function apply(s: TriageState, step: Step): TriageState {
  if (typeof step === "object" && "swipe" in step) {
    if (s.finalists) throw new Error("The swiping is done.");
    if (s.again) {
      if (step.swipe === "maybe") throw new Error("Yes or no, this time.");
      return settle({ ...s, second: [...s.second, step.swipe === "yes"], swipes: s.swipes + 1 });
    }
    return settle({ ...s, first: [...s.first, step.swipe], swipes: s.swipes + 1 });
  }
  if (!s.bracket) throw new Error("Nothing to compare yet.");
  return { ...s, bracket: applyRank(s.bracket, step as Choice | { keep: string[] }) };
}

/** After the last swipe of a pass: a second pass, or the finalists. */
function settle(s: TriageState): TriageState {
  if (s.finalists) return s;
  if (s.again) {
    if (s.second.length < s.again.length) return s;
    const kept = s.again.filter((_, i) => s.second[i]);
    // Kept too few? The whole yes pile goes on, rather than guessing.
    return compare(s, kept.length >= s.top ? kept : s.again);
  }
  if (s.first.length < s.order.length) return s;
  const yes = pile(s, "yes");
  if (yes.length > 2 * s.top) return { ...s, again: yes, second: [] };
  if (yes.length >= s.top) return compare(s, yes);
  return compare(s, [...yes, ...pile(s, "maybe")]);
}

function compare(s: TriageState, finalists: string[]): TriageState {
  if (finalists.length < 2) return { ...s, finalists, bracket: null };
  return { ...s, finalists, bracket: startRank(finalists, Math.min(s.top, finalists.length)) };
}

/** The final top: from the knockout, or the lone finalist. */
export function result(s: TriageState) {
  if (s.bracket) return s.bracket.placed;
  return (s.finalists ?? []).map((id) => [id]);
}

/** Comparisons for an ordered top k of n finalists, about: n - 1 for first, then about log2 n per place. */
export function comparisonsFor(n: number, top: number) {
  if (n < 2) return 0;
  const k = Math.min(top, n);
  return Math.round(n - 1 + (k - 1) * Math.max(1, Math.log2(n) - 1));
}
