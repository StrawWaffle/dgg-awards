import { useEffect, useState } from "react";
import { Emote } from "@/lab/Emote";
import { Summary, loadSimulated, loadSummary } from "@/lab/Summary";
import type { Me, SiteConfig } from "@/site/Site";

type Tally = { voters: number; ballots: number; days: { day: string; voters: number; ballots: number }[] };

/**
 * This year's results, to read through after the show: public once the site
 * is in reviewing mode. Admins can preview them any time, with real votes or
 * simulated ones (made up in the browser, never saved) while there are none.
 * With them, the tally: how many voted, and per day (counts only).
 */
export function ResultsPage({ me, config, onHome }: { me: Me | undefined; config: SiteConfig | null; onHome: (e: React.MouseEvent) => void }) {
  const admin = !!me?.admin;
  const published = config?.viewingMode === "reviewing";
  const [tally, setTally] = useState<Tally | null>(null);
  const [simulated, setSimulated] = useState<boolean | null>(null);

  useEffect(() => {
    if (!config || me === undefined || (!published && !admin)) return;
    fetch(`/api/vote/tally${published ? "" : "?preview=1"}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: Tally | null) => {
        setTally(t);
        // An admin preview without any votes starts on simulated results.
        setSimulated(!published && (t?.ballots ?? 0) === 0);
      })
      .catch(() => setSimulated(!published));
  }, [config, me, published, admin]);

  if (!config || me === undefined) return <div className="cozy-panel p-8">Loading…</div>;
  if (!published && !admin) {
    return (
      <div className="cozy-panel mx-auto max-w-2xl space-y-4 p-8 text-center">
        <Emote name="PepoG" size={1.6} title="" />
        <p className="text-2xl font-black">The results come out after the show.</p>
        <a className="cozy-btn primary" href="/" onClick={onHome}>
          Back to the front page
        </a>
      </div>
    );
  }
  if (simulated === null) return <div className="cozy-panel p-8">Loading…</div>;

  return (
    <div className="space-y-4">
      {!published && (
        <div className="cozy-panel flex flex-wrap items-center gap-3 px-5 py-3" style={{ background: "var(--highlight)" }}>
          <span className="cozy-chip coral">Preview</span>
          <span className="font-semibold">The results page as it'll look once results are out.</span>
          <label className="ml-auto flex items-center gap-2 font-bold">
            <input type="checkbox" checked={simulated} onChange={(e) => setSimulated(e.currentTarget.checked)} />
            Simulated votes
          </label>
        </div>
      )}
      <Summary
        key={simulated ? "simulated" : "real"}
        load={simulated ? loadSimulated : loadSummary}
        title={`The ${config.awardYear ?? ""} results`.replace("  ", " ")}
        footer={
          simulated
            ? "Simulated votes: made up for this preview, never saved."
            : "Percentages are of first choices. For ranked awards, the winner is decided by the runoff below each one."
        }
        extra={!simulated && tally && tally.voters > 0 ? <TallyBox tally={tally} /> : undefined}
      />
    </div>
  );
}

/** How many voted, and per day. */
function TallyBox({ tally }: { tally: Tally }) {
  const most = Math.max(1, ...tally.days.map((d) => d.voters));
  return (
    <div className="space-y-2">
      <h3 className="font-black">
        {tally.voters.toLocaleString()} people voted, casting {tally.ballots.toLocaleString()} ballots
      </h3>
      <ol className="space-y-1">
        {tally.days.map((d) => (
          <li key={d.day} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="font-semibold" style={{ color: "var(--muted)" }}>
              {new Date(`${d.day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}
            </span>
            <span className="h-3 overflow-hidden rounded-full" style={{ background: "var(--cream)" }}>
              <span className="block h-full rounded-full" style={{ width: `${(d.voters / most) * 100}%`, background: "var(--primary)" }} />
            </span>
            <span className="hand w-24 text-right text-base font-bold tabular-nums">{d.voters.toLocaleString()} voters</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
