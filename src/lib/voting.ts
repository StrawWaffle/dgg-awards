// Voting styles and instant-runoff counting. Pure, shared by server and client.

// single: pick one. ranked: rank any number, counted by instant runoff.
// points: a top 10 (ties allowed), 10 points for first down to 1 for tenth,
// added up over everyone's ballots (the DGGer wildcards, StrawWaffle 2026-11-10).
export const votingStyles = ["single", "ranked", "points"] as const;
export type VotingStyle = (typeof votingStyles)[number];
export const DEFAULT_VOTING_STYLE: VotingStyle = "single";

/** A category's style: its own if set, otherwise the site default. */
export function effectiveStyle(
  categoryStyle: VotingStyle | null | undefined,
  siteDefault: VotingStyle | null | undefined,
): VotingStyle {
  return categoryStyle ?? siteDefault ?? DEFAULT_VOTING_STYLE;
}

/**
 * Categories as sent to clients: `votingStyle` is the style that applies,
 * and `usesDefaultStyle` says whether it comes from the site default.
 */
export function withEffectiveStyles<T extends { votingStyle: VotingStyle | null }>(
  categories: T[],
  siteDefault: VotingStyle | null | undefined,
) {
  return categories.map((c) => ({
    ...c,
    votingStyle: effectiveStyle(c.votingStyle, siteDefault),
    usesDefaultStyle: c.votingStyle === null,
  }));
}

export type RunoffRound = {
  /** Votes per nominee still in the race, from each ballot's top choice left. */
  counts: Record<string, number>;
  /** Ballots with no choices left among the remaining nominees. */
  exhausted: number;
  /** Knocked out at the end of this round. Empty in the final round. */
  eliminated: string[];
};

export type RunoffResult = {
  rounds: RunoffRound[];
  /** One winner, several on an unbreakable tie, none without ballots. */
  winners: string[];
};

/**
 * Instant runoff. Each round counts every ballot for its highest-ranked
 * nominee still in the race. A nominee with more than half of the counted
 * ballots wins. Otherwise the last-placed nominee is eliminated and its
 * ballots move to their next choice.
 *
 * Ties for last place are broken by the earlier rounds' counts, latest first.
 * If still tied, all of them go out together, unless that would eliminate
 * everyone left, in which case those nominees share the win.
 */
export function instantRunoff(nominees: string[], ballots: string[][]): RunoffResult {
  const known = new Set(nominees);
  const clean = ballots
    .map((b) => b.filter((id, i) => known.has(id) && b.indexOf(id) === i))
    .filter((b) => b.length > 0);
  let remaining = [...nominees];
  const rounds: RunoffRound[] = [];

  while (remaining.length > 0) {
    const counts: Record<string, number> = Object.fromEntries(remaining.map((n) => [n, 0]));
    let exhausted = 0;
    for (const ballot of clean) {
      const top = ballot.find((id) => id in counts);
      if (top === undefined) exhausted++;
      else counts[top]!++;
    }
    const counted = clean.length - exhausted;
    const round: RunoffRound = { counts, exhausted, eliminated: [] };
    rounds.push(round);

    if (counted === 0) return { rounds, winners: [] };
    const leader = remaining.reduce((a, b) => (counts[b]! > counts[a]! ? b : a));
    if (counts[leader]! * 2 > counted) return { rounds, winners: [leader] };

    // Last place, with ties broken by earlier rounds (latest first).
    let tied = lowest(remaining, counts);
    for (let r = rounds.length - 2; r >= 0 && tied.length > 1; r--) {
      tied = lowest(tied, rounds[r]!.counts);
    }
    if (tied.length === remaining.length) return { rounds, winners: remaining };
    round.eliminated = tied;
    remaining = remaining.filter((n) => !tied.includes(n));
  }
  return { rounds, winners: [] };
}

function lowest(ids: string[], counts: Record<string, number>) {
  const min = Math.min(...ids.map((id) => counts[id] ?? 0));
  return ids.filter((id) => (counts[id] ?? 0) === min);
}

/** How many places a points ballot has, and the points for first. */
export const POINTS_TOP = 10;

/** A points ballot, best first: each entry a group of equals. */
export type Places = string[][];

/**
 * Stored, each nominee on a points ballot gets its place, shared by equals:
 * [[a], [b, c], [d]] is a 1, b 2, c 2, d 4.
 */
export function placesToRanks(places: Places): { id: string; rank: number }[] {
  const rows: { id: string; rank: number }[] = [];
  let rank = 1;
  for (const group of places) {
    for (const id of group) rows.push({ id, rank });
    rank += group.length;
  }
  return rows;
}

/** Back from stored places to groups of equals, best first. */
export function ranksToPlaces(rows: { id: string; rank: number }[]): Places {
  const byRank = new Map<number, string[]>();
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) byRank.set(r.rank, [...(byRank.get(r.rank) ?? []), r.id]);
  return [...byRank.values()];
}

/** A points ballot is up to `top` nominees in groups, none empty or named twice. */
export function validPlaces(places: Places, top = POINTS_TOP) {
  const ids = places.flat();
  return places.length > 0 && places.every((g) => g.length > 0) && ids.length <= top && new Set(ids).size === ids.length;
}

/**
 * Points per nominee on one ballot: `top` for first place down to 1, and
 * equals share the points of the places they take (tied for 3rd and 4th of
 * ten: (8 + 7) / 2 = 7.5 each). The same as the lab's ranker (src/lab/rank.ts).
 */
export function pointsForPlaces(places: Places, top = POINTS_TOP) {
  const out: { place: number; group: string[]; points: number }[] = [];
  let place = 1;
  for (const group of places) {
    const taken = Array.from({ length: group.length }, (_, i) => Math.max(0, top + 1 - (place + i)));
    out.push({ place, group, points: taken.reduce((a, b) => a + b, 0) / group.length });
    place += group.length;
  }
  return out;
}

export type PointsResult = {
  /** Points per nominee, summed over the ballots. */
  points: Record<string, number>;
  /** How many ballots placed each nominee at all, and first. */
  placed: Record<string, number>;
  firsts: Record<string, number>;
  /** Ballots counted. */
  ballots: number;
  /** Most points; a tie goes to more first places, then more ballots placing them, else it's shared. */
  winners: string[];
  /** Everyone, best first, by the same order as the winner. */
  order: string[];
};

/** Add up points ballots. Unknown nominees and repeats on a ballot are ignored. */
export function countPoints(nominees: string[], ballots: Places[], top = POINTS_TOP): PointsResult {
  const known = new Set(nominees);
  const zero = () => Object.fromEntries(nominees.map((n) => [n, 0])) as Record<string, number>;
  const points = zero();
  const placed = zero();
  const firsts = zero();
  let counted = 0;
  for (const ballot of ballots) {
    const seen = new Set<string>();
    const clean = ballot
      .map((g) => g.filter((id) => known.has(id) && !seen.has(id) && (seen.add(id), true)))
      .filter((g) => g.length > 0);
    if (!clean.length) continue;
    counted++;
    for (const row of pointsForPlaces(clean, top)) {
      for (const id of row.group) {
        points[id]! += row.points;
        placed[id]!++;
        if (row.place === 1) firsts[id]!++;
      }
    }
  }
  const better = (a: string, b: string) => points[b]! - points[a]! || firsts[b]! - firsts[a]! || placed[b]! - placed[a]!;
  const order = [...nominees].sort(better);
  const best = order[0];
  const winners = best !== undefined && points[best]! > 0 ? order.filter((id) => better(id, best) === 0) : [];
  return { points, placed, firsts, ballots: counted, winners, order };
}
