import { useState } from "react";
import { Emote } from "@/lab/Emote";

/**
 * The steps before the first ranked award and the first top 10 (StrawWaffle: part
 * of the vote, not a pop-up for first-timers). Everyone passes them once per
 * visit; "Skip" goes straight to the award, and "How does this work?" on the
 * award brings them back. Nothing here is a vote.
 */

const muted = { color: "var(--muted)" };

/** The practice award's made-up nominees. */
const PRACTICE = [
  { id: "omegalul", title: "OMEGALUL", emote: "OMEGALUL" },
  { id: "pepog", title: "PepoG", emote: "PepoG" },
  { id: "mmmm", title: "MMMM", emote: "MMMM" },
  { id: "gigachad", title: "GIGACHAD", emote: "GIGACHAD" },
];
const named = (id: string) => PRACTICE.find((p) => p.id === id)!;

type Round = { counts: Record<string, number>; out: string | null; winner: string | null; note: string };

/**
 * A pretend count of 100 ballots, written so the voter's first choice goes
 * out first and their vote carries their second choice to the win.
 */
function rounds(ranking: string[]): Round[] {
  const [first, second] = ranking as [string, string];
  const [x, y] = PRACTICE.map((p) => p.id).filter((id) => id !== first && id !== second) as [string, string];
  const n = (id: string) => named(id).title;
  return [
    {
      counts: { [x]: 38, [second]: 30, [y]: 20, [first]: 12 },
      out: first,
      winner: null,
      note: `Everyone's first choices are counted. Yours goes to ${n(first)}. Nobody has more than half (51 of 100), so the one with the fewest, ${n(first)}, goes out.`,
    },
    {
      counts: { [second]: 42, [x]: 38, [y]: 20 },
      out: y,
      winner: null,
      note: `Your vote isn't wasted: it moves to your #2, ${n(second)}, along with everyone else who put ${n(first)} first. Still nobody past half, so ${n(y)} goes out.`,
    },
    {
      counts: { [second]: 54, [x]: 46 },
      out: null,
      winner: second,
      note: `${n(y)}'s votes move to their next choices. ${n(second)} passes half and wins, with your vote helping all the way.`,
    },
  ];
}

export function RankedTutorial({ onDone }: { onDone: () => void }) {
  const [ranking, setRanking] = useState<string[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const toggle = (id: string) => setRanking((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const all = ranking.length >= 2 ? rounds(ranking) : [];
  const shown = round !== null ? all[round] : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <span className="cozy-chip coral">Before the next award</span>
        <span className="cozy-chip">Practice: nothing here counts</span>
      </div>
      <div>
        <h2 className="text-3xl font-black">How ranked voting works</h2>
        <p className="mt-1 max-w-3xl font-semibold" style={muted}>
          Some awards are ranked. Instead of one pick, you put nominees in the order you'd want them to win: your favourite
          first, then your next, as many as you like. If your favourite can't win, your vote moves to your next choice
          instead of going to waste.
        </p>
      </div>

      {round === null ? (
        <>
          <p className="font-black">Try it: rank the emotes for "Emote of the Year (practice)". Click them in order, your favourite first.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {PRACTICE.map((p) => {
              const rank = ranking.indexOf(p.id);
              const on = rank >= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-pressed={on}
                  className="cozy-card relative flex flex-col items-center gap-2 rounded-[20px] border-2 p-4 active:translate-y-[3px]"
                  style={{
                    background: "var(--cream)",
                    borderColor: on ? "var(--primary-shadow)" : "var(--panel-border)",
                    boxShadow: `0 5px 0 ${on ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
                  }}
                >
                  {on && (
                    <span
                      className="hand absolute top-2 left-2 flex h-9 w-9 items-center justify-center rounded-full text-2xl font-bold"
                      style={{ background: "var(--primary)", color: "var(--primary-text)" }}
                    >
                      {rank + 1}
                    </span>
                  )}
                  <Emote name={p.emote} size={1.4} title="" />
                  <span className="font-extrabold">{p.title}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="cozy-btn primary" disabled={ranking.length < 2} onClick={() => setRound(0)}>
              Count the votes
            </button>
            <span className="text-sm font-semibold" style={muted}>
              {ranking.length < 2 ? "Rank at least two to see how the count works." : `Your ranking: ${ranking.map((id, i) => `${i + 1}. ${named(id).title}`).join(", ")}.`}
            </span>
          </div>
        </>
      ) : (
        shown && (
          <>
            <div>
              <p className="font-black">
                Round {round + 1} of {all.length}: 100 made-up voters
              </p>
              <p className="mt-1 max-w-3xl font-semibold" style={muted}>
                {shown.note}
              </p>
            </div>
            <ol className="max-w-2xl space-y-2">
              {Object.entries(shown.counts).map(([id, count]) => {
                const yours = ranking.indexOf(id);
                return (
                  <li key={id}>
                    <div className="flex items-center justify-between gap-3 text-sm font-bold">
                      <span className="flex items-center gap-2">
                        <Emote name={named(id).emote} size={0.5} title="" />
                        {named(id).title}
                        {yours >= 0 && <span className="cozy-chip">your #{yours + 1}</span>}
                        {shown.out === id && <span className="cozy-chip coral">out</span>}
                        {shown.winner === id && <span className="cozy-chip green">wins</span>}
                      </span>
                      <span className="hand text-lg tabular-nums">{count}</span>
                    </div>
                    <div className="relative mt-0.5 h-3 overflow-hidden rounded-full" style={{ background: "var(--cream)" }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{
                          width: `${count}%`,
                          background: shown.winner === id ? "var(--primary)" : shown.out === id ? "var(--coral)" : "var(--panel-border)",
                        }}
                      />
                      {/* Half of the votes: past this line wins. */}
                      <span className="absolute top-0 bottom-0 left-1/2 w-0.5" style={{ background: "var(--text)" }} aria-hidden />
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs font-semibold" style={muted}>
              The line is half the votes.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="cozy-btn" onClick={() => setRound(round === 0 ? null : round - 1)}>
                Back
              </button>
              {round < all.length - 1 ? (
                <button type="button" className="cozy-btn primary" onClick={() => setRound(round + 1)}>
                  Next round
                </button>
              ) : (
                <button type="button" className="cozy-btn primary" onClick={onDone}>
                  Got it, on to the vote
                </button>
              )}
            </div>
          </>
        )
      )}

      <button type="button" className="text-sm font-bold underline" style={muted} onClick={onDone}>
        Skip, I know how it works
      </button>
    </div>
  );
}

export function PointsTutorial({ onDone }: { onDone: () => void }) {
  const steps = [
    {
      emote: "PepoG",
      title: "1. Swipe through everyone",
      text: "One card at a time: yes, maybe or no. Use the buttons, the arrow keys, or drag the card left or right.",
    },
    {
      emote: "Stare",
      title: "2. Pick between your yeses",
      text: "Two at a time: who's better? Or call them equal. Each answer narrows down where they belong, so it doesn't take long.",
    },
    {
      emote: "GIGACHAD",
      title: "3. Your top 10 gets points",
      text: "10 points for first, 9 for second, down to 1 for tenth. Everyone's points are added up and the most points wins.",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <span className="cozy-chip coral">Before the next award</span>
      </div>
      <div>
        <h2 className="text-3xl font-black">How your top 10 works</h2>
        <p className="mt-1 max-w-3xl font-semibold" style={muted}>
          This award has a lot of nominees, so instead of one pick you make your own top 10, and it's scored by points.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.title} className="rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
            <Emote name={s.emote} size={0.9} title="" />
            <h3 className="mt-2 font-black">{s.title}</h3>
            <p className="mt-1 text-sm font-semibold" style={muted}>
              {s.text}
            </p>
          </div>
        ))}
      </div>
      <div className="max-w-2xl rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
        <p className="font-black">An example</p>
        <p className="mt-1 text-sm font-semibold" style={muted}>
          You put OMEGALUL first, and PepoG and MMMM equal second. OMEGALUL gets 10 points. PepoG and MMMM share second and
          third place (9 + 8), so they get 8.5 each. If you only have a top 3, that's fine: the rest just get nothing from you.
        </p>
      </div>
      <p className="text-sm font-semibold" style={muted}>
        Your progress is kept in this browser until you cast it, so you can stop and come back.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="cozy-btn primary" onClick={onDone}>
          Got it, on to the vote
        </button>
      </div>
    </div>
  );
}
