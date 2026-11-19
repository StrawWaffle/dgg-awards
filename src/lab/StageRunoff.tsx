import { useEffect, useRef } from "react";
import { annotate } from "rough-notation";
import { type Award, Board, boardOf, decidedByRunoff } from "@/lab/Results";
import { cssVar } from "@/lab/sketch";

const ROW_H = 44;
/** A row for someone already out: smaller, so the rounds fit on a short screen. */
const OUT_H = 26;

/**
 * The results scene's board. A ranked award decided over several rounds
 * goes on, once its first choices are revealed, to the runoff, which the
 * presenter steps through round by round from the show's controls (`round`:
 * null for the board, else the runoff's round). Long awards show their top
 * 10 and a line for the rest. `onBoardDone` comes when the board's last row
 * is in; `onFinished` when there's nothing left to show: the board's last
 * row, or the runoff's last round.
 */
export function ResultsBoard({
  award,
  target,
  instant = false,
  round,
  onWinner,
  onBoardDone,
  onFinished,
}: {
  award: Award;
  target: number;
  /** Start the board finished (after an announcer video). */
  instant?: boolean;
  round: number | null;
  onWinner: (el: HTMLElement) => void;
  onBoardDone: () => void;
  onFinished: () => void;
}) {
  const runoff = decidedByRunoff(award);
  const { award: shown, rest } = boardOf(award);
  if (runoff && round !== null) return <Runoff award={award} k={round} onWinner={onWinner} onFinished={onFinished} />;
  return (
    <>
      <Board
        award={shown}
        target={target}
        instant={instant}
        onWinner={onWinner}
        onFinished={() => {
          onBoardDone();
          if (!runoff) onFinished();
        }}
      />
      {rest > 0 && (
        <p className="mt-3 text-center font-bold" style={{ color: "var(--muted)" }}>
          {rest} more with fewer {award.unit === "points" ? "points" : "votes"}
        </p>
      )}
      {runoff && (
        <p className="mt-5 border-t-2 pt-4 font-bold" style={{ borderColor: "var(--panel-border)", color: "var(--muted)" }}>
          First choices only. Nobody has more than half, so it goes to an instant runoff ({award.rounds!.length} rounds).
        </p>
      )}
    </>
  );
}

/**
 * The instant runoff, a round at a time. Each bar is a nominee's share of
 * the ballots still counting, against a line at half: over it wins. Whoever
 * goes out at the end of a round turns coral, then grey with their name
 * struck through, and their ballots move on to the next choice.
 */
function Runoff({ award, k, onWinner, onFinished }: { award: Award; k: number; onWinner: (el: HTMLElement) => void; onFinished: () => void }) {
  const rounds = award.rounds!;
  const round = rounds[k]!;
  const last = k === rounds.length - 1;
  const name = (id: string) => award.results.find((r) => r.id === id)?.title ?? id;
  const counted = Object.values(round.counts).reduce((a, b) => a + b, 0);
  /** The round each nominee went out in, if they have. */
  const outIn = new Map<string, number>();
  rounds.forEach((r, i) => r.eliminated.forEach((id) => outIn.set(id, i)));
  const goneBefore = (id: string) => (outIn.get(id) ?? Infinity) < k;
  const winners = award.results.filter((r) => r.isWinner).map((r) => r.id);

  // Still in, most first; then those out, the latest out first.
  const order = [...award.results]
    .sort((a, b) => {
      const ga = goneBefore(a.id);
      const gb = goneBefore(b.id);
      if (ga !== gb) return ga ? 1 : -1;
      if (ga) return outIn.get(b.id)! - outIn.get(a.id)!;
      return (round.counts[b.id] ?? 0) - (round.counts[a.id] ?? 0);
    })
    .map((r) => r.id);

  // Long titles shortened, so the caption stays a line or two.
  const short = (t: string) => (t.length > 36 ? `${t.slice(0, 34).trimEnd()}…` : t);
  // Each row's top: those still in at full height, those out squeezed below.
  const tops = new Map<string, number>();
  order.reduce((y, id) => (tops.set(id, y), y + (goneBefore(id) ? OUT_H : ROW_H)), 0);
  const height = order.reduce((h, id) => h + (goneBefore(id) ? OUT_H : ROW_H), 0);
  const names = (ids: string[]) => ids.map((id) => short(name(id))).join(" and ");
  const moved = k > 0 ? rounds[k - 1]!.eliminated : [];
  const newlyExhausted = k > 0 ? round.exhausted - rounds[k - 1]!.exhausted : 0;
  const caption = [
    k === 0
      ? "First choices."
      : `${names(moved)}'s ballots moved to their next choice${newlyExhausted > 0 ? ` (${newlyExhausted.toLocaleString()} had none left)` : ""}.`,
    last
      ? winners.length > 1
        ? `${names(winners)} share the win.`
        : `${names(winners)} has more than half: the winner.`
      : `Still nobody over half, so ${names(round.eliminated)} ${round.eliminated.length > 1 ? "go" : "goes"} out.`,
  ].join(" ");

  // The winner, circled and cheered once the last round is up.
  const nameEls = useRef(new Map<string, HTMLElement>());
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => {
    if (!last) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const notes = winners.map((id) => nameEls.current.get(id)).filter((el): el is HTMLElement => !!el);
    const shown = notes.map((el) => annotate(el, { type: "circle", color: cssVar("--coral"), strokeWidth: 3, padding: 10, animationDuration: 800 }));
    timers.push(
      setTimeout(() => {
        shown.forEach((a) => a.show());
        notes.forEach((el) => onWinner(el));
        finished.current();
      }, 1000),
    );
    return () => {
      timers.forEach(clearTimeout);
      shown.forEach((a) => a.remove());
    };
    // Once per arriving at the last round.
  }, [last]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="cozy-chip coral">Instant runoff</span>
        <span className="text-2xl font-black">
          Round {k + 1} of {rounds.length}
        </span>
      </div>
      <p key={k} className="lab-pop text-lg font-bold">
        {caption}
      </p>
      <div className="relative" style={{ height: height + 22, transition: "height 500ms" }}>
        {/* The line to beat: more than half of the ballots still counting. */}
        <div className="pointer-events-none absolute top-0 bottom-0 grid w-full grid-cols-[minmax(8rem,14rem)_1fr_10.5rem] gap-4">
          <span />
          <span className="relative">
            <span className="absolute top-0 bottom-0 left-1/2 border-l-2 border-dashed" style={{ borderColor: "var(--coral)" }} />
            <span className="absolute top-0 left-1/2 ml-1.5 text-xs font-black" style={{ color: "var(--coral)" }}>
              half
            </span>
          </span>
        </div>
        {award.results.map((r) => {
          const gone = goneBefore(r.id);
          const goingOut = round.eliminated.includes(r.id);
          const won = last && winners.includes(r.id);
          const count = gone ? 0 : (round.counts[r.id] ?? 0);
          const share = counted ? (count / counted) * 100 : 0;
          const colour = won || goingOut ? "var(--coral)" : gone ? "var(--muted)" : "var(--primary-shadow)";
          return (
            <div
              key={r.id}
              className="absolute inset-x-0 grid grid-cols-[minmax(8rem,14rem)_1fr_10.5rem] items-center gap-4"
              style={{
                height: gone ? OUT_H : ROW_H,
                top: 22,
                transform: `translateY(${tops.get(r.id)}px)`,
                transition: "transform 700ms cubic-bezier(.3,.7,.3,1), height 500ms, opacity 500ms",
                opacity: gone ? 0.45 : 1,
              }}
            >
              <span className={`truncate text-right font-extrabold ${gone ? "text-sm line-through" : ""}`}>
                <span ref={(el) => void (el ? nameEls.current.set(r.id, el) : nameEls.current.delete(r.id))} className="inline-block">
                  {r.title}
                </span>
              </span>
              <span className={`relative ${gone ? "h-2" : "h-7"}`} style={{ color: colour }}>
                <span
                  className="absolute top-0 left-0 h-full rounded-[4px] border-2"
                  style={{
                    width: `${share}%`,
                    borderColor: "currentColor",
                    background: `repeating-linear-gradient(${won ? "45deg" : "-45deg"}, currentColor 0 2.5px, transparent 2.5px 7px)`,
                    transition: "width 900ms cubic-bezier(.3,.7,.3,1), color 400ms",
                  }}
                />
              </span>
              <span className="flex flex-col leading-none">
                {gone ? (
                  <span className="text-sm font-bold">out in round {outIn.get(r.id)! + 1}</span>
                ) : (
                  <>
                    <span className="hand text-xl font-bold tabular-nums">
                      {count.toLocaleString()} {count === 1 ? "vote" : "votes"}
                      {goingOut && (
                        <span className="ml-1.5 text-sm font-black" style={{ color: "var(--coral)" }}>
                          out
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: "var(--muted)" }}>
                      {share.toFixed(1)}% of ballots still in
                    </span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-sm font-bold" style={{ color: "var(--muted)" }}>
        {counted.toLocaleString()} ballots still counting
        {round.exhausted > 0 && ` · ${round.exhausted.toLocaleString()} with no choices left`}
      </p>
    </div>
  );
}
