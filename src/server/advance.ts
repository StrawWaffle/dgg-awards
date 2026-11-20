// Advancing DGGer from round to round (rinlux, 2026-11-20): the wildcards'
// top 5 by points are drawn at random into Groups A–E, one each; then each
// group's top 2 by instant runoff (eliminating until two are left) go to the
// final, DGG Chatter of the Year. Nothing moves until an admin confirms the
// plan (with their own picks for any tie at the cut), and each advance is one
// history entry: undo removes the nominees it added, unless they have votes.
//
// Specific to DGGer on purpose: it's the only award with rounds.
import { getCategory, getCategoryNominees, getCategoryBallots, insertNominee } from "@/lib/data/driver";
import { countPoints, ranksToPlaces, runoffTop } from "@/lib/voting";
import { type Actor, record } from "@/server/history";

export const DGGER = {
  wildcards: "dgger_wildcards",
  groups: ["dgger_group_a", "dgger_group_b", "dgger_group_c", "dgger_group_d", "dgger_group_e"],
  final: "dgger",
  /** Wildcards through: one per group. */
  wildcardsThrough: 5,
  /** Through from each group. */
  groupThrough: 2,
};

export type AdvanceStep = "groups" | "final";
type Nominee = { id: string; title: string };
/** One award's count: everyone best first, those clearly through, and a tie at the cut for an admin to settle. */
export type Standing = {
  award: { id: string; title: string };
  rows: (Nominee & { score: string })[];
  through: string[];
  tied: string[];
  /** How many go through from it. */
  places: number;
  ballots: number;
};
export type Plan = {
  step: AdvanceStep;
  standings: Standing[];
  /** Where they go: for the groups, one each; for the final, all to it. */
  targets: { id: string; title: string; has: string[] }[];
  /** Already done: the targets hold nominees from the source awards. */
  done: boolean;
};

async function award(id: string) {
  const c = await getCategory(id);
  if (!c) throw new Error(`No award "${id}". Has DGGer been split into its groups?`);
  return { id: c.id, title: c.title, nominees: (await getCategoryNominees(id)).map((o) => ({ id: o.id, title: o.title })) };
}

async function wildcardStanding(): Promise<Standing> {
  const a = await award(DGGER.wildcards);
  const ballots = [...(await getCategoryBallots(a.id)).values()].map(ranksToPlaces);
  const t = countPoints(
    a.nominees.map((n) => n.id),
    ballots,
  );
  const k = DGGER.wildcardsThrough;
  // A tie at the cut: level with the 5th on points, first places and ballots placing them.
  const same = (x: string, y: string) => t.points[x] === t.points[y] && t.firsts[x] === t.firsts[y] && t.placed[x] === t.placed[y];
  const edge = t.order[k - 1];
  const level = edge && t.points[edge]! > 0 ? t.order.filter((id) => same(id, edge)) : [];
  const tied = level.length > 1 && t.order.indexOf(level[level.length - 1]!) >= k ? level : [];
  const through = t.order.slice(0, k).filter((id) => !tied.includes(id) && t.points[id]! > 0);
  const title = new Map(a.nominees.map((n) => [n.id, n.title]));
  return {
    award: { id: a.id, title: a.title },
    rows: t.order.slice(0, Math.max(10, k + tied.length)).map((id) => ({ id, title: title.get(id) ?? id, score: `${t.points[id]} pts` })),
    through,
    tied,
    places: k,
    ballots: t.ballots,
  };
}

async function groupStanding(id: string): Promise<Standing> {
  const a = await award(id);
  const ballots = [...(await getCategoryBallots(id)).values()].map((b) => b.sort((x, y) => x.rank - y.rank).map((v) => v.id));
  const k = DGGER.groupThrough;
  const r = ballots.length ? runoffTop(a.nominees.map((n) => n.id), ballots, k) : { top: [], tied: [], rounds: [] };
  const last = r.rounds[r.rounds.length - 1]?.counts ?? {};
  const first = r.rounds[0]?.counts ?? {};
  const title = new Map(a.nominees.map((n) => [n.id, n.title]));
  const rest = a.nominees.map((n) => n.id).filter((n) => !r.top.includes(n) && !r.tied.includes(n));
  rest.sort((x, y) => (first[y] ?? 0) - (first[x] ?? 0));
  const rows = [...r.top, ...r.tied, ...rest].map((n) => ({
    id: n,
    title: title.get(n) ?? n,
    score: n in last ? `${last[n]} in the last round` : `${first[n] ?? 0} first choices`,
  }));
  return { award: { id: a.id, title: a.title }, rows, through: r.top, tied: r.tied, places: k, ballots: ballots.length };
}

export async function advancePlan(step: AdvanceStep): Promise<Plan> {
  if (step === "groups") {
    const standing = await wildcardStanding();
    const targets = await Promise.all(DGGER.groups.map(award));
    const from = new Set((await award(DGGER.wildcards)).nominees.map((n) => n.id));
    return {
      step,
      standings: [standing],
      targets: targets.map((t) => ({ id: t.id, title: t.title, has: t.nominees.filter((n) => from.has(n.id)).map((n) => n.title) })),
      done: targets.some((t) => t.nominees.some((n) => from.has(n.id))),
    };
  }
  const standings = await Promise.all(DGGER.groups.map(groupStanding));
  const final = await award(DGGER.final);
  return {
    step,
    standings,
    targets: [{ id: final.id, title: final.title, has: final.nominees.map((n) => n.title) }],
    done: final.nominees.length > 0,
  };
}

export class AdvanceRefused extends Error {}

/**
 * Copy the picked nominees into their targets: `picks` is [source award,
 * nominee, target award]. The originals stay where they are (their round's
 * results keep them). Checked against the plan's rules, not its picks: an
 * admin settles ties and the draw.
 */
export async function advance(step: AdvanceStep, picks: { from: string; id: string; to: string }[], actor: Actor) {
  const plan = await advancePlan(step);
  if (plan.done) throw new AdvanceRefused("This has been done already. Undo it in the History first to do it again.");
  const sources = step === "groups" ? [DGGER.wildcards] : DGGER.groups;
  const targets = step === "groups" ? DGGER.groups : [DGGER.final];
  const seen = new Set<string>();
  for (const p of picks) {
    if (!sources.includes(p.from) || !targets.includes(p.to)) throw new AdvanceRefused("Those aren't this round's awards.");
    if (seen.has(`${p.from}/${p.id}`)) throw new AdvanceRefused("Someone is picked twice.");
    seen.add(`${p.from}/${p.id}`);
  }
  // How many go through, per source and per target.
  for (const s of plan.standings) {
    const mine = picks.filter((p) => p.from === s.award.id);
    if (mine.length !== s.places) throw new AdvanceRefused(`${s.award.title} needs exactly ${s.places} going through.`);
    const allowed = new Set([...s.through, ...s.tied]);
    if (!s.through.every((id) => mine.some((p) => p.id === id)) || !mine.every((p) => allowed.has(p.id))) {
      throw new AdvanceRefused(`${s.award.title}: pick everyone who's through, and only settle the tie among those tied.`);
    }
  }
  if (step === "groups" && targets.some((t) => picks.filter((p) => p.to === t).length !== 1)) {
    throw new AdvanceRefused("Each group gets exactly one wildcard.");
  }

  const added: { categoryId: string; id: string }[] = [];
  try {
    for (const p of picks) {
      const source = (await getCategoryNominees(p.from)).find((o) => o.id === p.id);
      if (!source) throw new AdvanceRefused(`"${p.id}" isn't in ${p.from}.`);
      // A copy, new to the target, without the source's place in its list.
      const { position: _position, ...row } = source;
      await insertNominee({ ...row, categoryId: p.to, position: 1000 + added.length });
      added.push({ categoryId: p.to, id: p.id });
    }
  } finally {
    if (added.length) {
      await record(actor, {
        kind: "import",
        action: "create",
        label:
          step === "groups"
            ? `Advanced the top ${added.length} DGGer wildcards into the groups, one each by draw`
            : `Advanced the top ${DGGER.groupThrough} of each DGGer group into DGG Chatter of the Year (${added.length})`,
        categoryId: step === "groups" ? DGGER.wildcards : DGGER.final,
        after: { categories: [], added, nominees: added.length, pictures: [], emotes: [] },
      });
    }
  }
  return added.length;
}
