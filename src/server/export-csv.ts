// The results and the ballots as spreadsheets (CSV), for admins (rinlux,
// 2026-11-20: "a csv that can be exported by the admins"). The ballots carry
// no names or times: each voter is a number, shuffled for every download, the
// same across awards so a voter's ballots can be read together.
import { getAllBallots, getVotingResults } from "@/lib/data/driver";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** Every award's standings, best first. */
export async function resultsCsv() {
  const rows: unknown[][] = [
    ["award", "award_id", "style", "place", "nominee", "nominee_id", "first_choices", "points", "ballots_placing", "final_round_votes", "share_percent", "winner", "ballots"],
  ];
  for (const award of await getVotingResults()) {
    const last = award.runoff?.rounds[award.runoff.rounds.length - 1]?.counts ?? {};
    // The results come last place first.
    [...award.options].reverse().forEach((o, i) => {
      rows.push([
        award.categoryTitle,
        award.categoryId,
        award.votingStyle,
        i + 1,
        o.title,
        o.id,
        o.count,
        o.points ?? "",
        o.placed ?? "",
        award.votingStyle === "ranked" ? (last[o.id] ?? "") : "",
        o.percentage,
        o.isWinner ? "yes" : "",
        award.totalVotes,
      ]);
    });
  }
  return csv(rows);
}

/** Every ballot: one row per choice, by anonymous voter number. */
export async function ballotsCsv() {
  const votes = await getAllBallots();
  const uids = [...new Set(votes.map((v) => v.uid))];
  for (let i = uids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uids[i], uids[j]] = [uids[j]!, uids[i]!];
  }
  const voter = new Map(uids.map((uid, i) => [uid, i + 1]));
  const rows: unknown[][] = [["voter", "award", "award_id", "rank", "nominee", "nominee_id"]];
  const sorted = [...votes].sort((a, b) => voter.get(a.uid)! - voter.get(b.uid)! || a.position - b.position || a.rank - b.rank);
  for (const v of sorted) rows.push([voter.get(v.uid), v.award, v.categoryId, v.rank, v.nominee, v.optionId]);
  return csv(rows);
}
