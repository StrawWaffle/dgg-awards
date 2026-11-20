// Which awards can be voted on now. Pure, shared by the server and the site.
//
// Most awards follow the site's voting dates (Settings). An award can have
// its own (`opensAt`/`closesAt`), and awards can belong to a round (`round`,
// a name such as "DGGer group stage"). While a round is open, only that
// round's awards can be voted on, on a page of their own (rinlux,
// 2026-11-20: the DGGer wildcards and group stage come before the main vote,
// with no voting on anything else). Awards with no nominees yet (the final,
// before the groups advance) can't be voted on.

export type Timing = {
  id: string;
  round?: string | null;
  opensAt?: number | null;
  closesAt?: number | null;
  /** How many nominees it has; an empty award is never open. */
  nominees?: number;
};
export type SiteTimes = { startTime?: string | number | null; endTime?: string | number | null; viewingMode?: string | null };
export type Round = { name: string; opensAt: number; closesAt: number };

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v) || null);

/** An award's voting window in seconds: its own, or the site's. */
export function windowOf(award: Timing, site: SiteTimes) {
  return { opensAt: award.opensAt ?? num(site.startTime), closesAt: award.closesAt ?? num(site.endTime) };
}

/** Within its window, the site in voting mode, and with nominees. */
export function awardOpen(award: Timing, site: SiteTimes, now: number) {
  if (site.viewingMode !== "voting" || award.nominees === 0) return false;
  const { opensAt, closesAt } = windowOf(award, site);
  return opensAt !== null && closesAt !== null && now >= opensAt && now <= closesAt;
}

/**
 * The awards that can be voted on now: the open ones, except that while any
 * round is open, only the awards of open rounds.
 */
export function votableNow<T extends Timing>(awards: T[], site: SiteTimes, now: number): T[] {
  const open = awards.filter((a) => awardOpen(a, site, now));
  const inRound = open.filter((a) => a.round);
  return inRound.length > 0 ? inRound : open;
}

/** Each round with its dates (the earliest opening and latest closing of its awards). */
export function roundsOf(awards: Timing[]): Round[] {
  const rounds = new Map<string, Round>();
  for (const a of awards) {
    if (!a.round || a.opensAt == null || a.closesAt == null) continue;
    const r = rounds.get(a.round);
    rounds.set(a.round, r ? { name: a.round, opensAt: Math.min(r.opensAt, a.opensAt), closesAt: Math.max(r.closesAt, a.closesAt) } : { name: a.round, opensAt: a.opensAt, closesAt: a.closesAt });
  }
  return [...rounds.values()].sort((a, b) => a.opensAt - b.opensAt);
}

/** The round open now, if any. */
export const roundNow = (rounds: Round[], now: number) => rounds.find((r) => now >= r.opensAt && now <= r.closesAt);

/** When voting first opens: the earliest of the site's start and the rounds'. */
export function firstOpening(site: SiteTimes, rounds: Round[]) {
  const times = [num(site.startTime), ...rounds.map((r) => r.opensAt)].filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}

/** The next time voting opens after `now` (a round, or the main vote), if any. */
export function nextOpening(site: SiteTimes, rounds: Round[], now: number) {
  const times = [num(site.startTime), ...rounds.map((r) => r.opensAt)].filter((t): t is number => t !== null && t > now);
  if (!times.length) return null;
  const at = Math.min(...times);
  return { at, name: rounds.find((r) => r.opensAt === at)?.name ?? null };
}
