// DGGer's awards (rinlux, 2026-11-20): the wildcards, the five groups and the
// final. Shared by the server (advancing, profiles) and the site (profiles on
// the vote page). Their nominees are chatters, named by destiny.gg username.
export const DGGER = {
  wildcards: "dgger_wildcards",
  groups: ["dgger_group_a", "dgger_group_b", "dgger_group_c", "dgger_group_d", "dgger_group_e"],
  final: "dgger",
  /** Wildcards through: one per group. */
  wildcardsThrough: 5,
  /** Through from each group. */
  groupThrough: 2,
};

/** An award whose nominees are chatters, so the vote can show their destiny.gg profile. */
export const isChatterAward = (id: string) => id === DGGER.wildcards || id === DGGER.final || DGGER.groups.includes(id);
