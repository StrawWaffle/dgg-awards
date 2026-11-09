// Voting styles and instant-runoff counting. Pure, shared by server and client.

export const votingStyles = ["single", "ranked"] as const;
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
