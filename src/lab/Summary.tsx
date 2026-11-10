import { type ReactNode, useEffect, useRef, useState } from "react";
import { PlayIcon } from "@radix-ui/react-icons";
import { Dialog } from "radix-ui";
import { type Clip, ClipPlayer, nomineeClip } from "@/lab/ClipPlayer";
import { Emote } from "@/lab/Emote";
import archive2025 from "@/archive/2025.json";

type Standing = {
  id: string;
  title: string;
  /** Null when only percentages are known (2025, from the wiki). */
  count: number | null;
  percentage: number;
  isWinner: boolean;
  image: string | null;
  /** An emote to show in place of a picture (New Emote of the Year). */
  emote?: string;
  clip: Clip | null;
};
type Round = { counts: Record<string, number>; exhausted: number; eliminated: string[] };
export type AwardResult = {
  id: string;
  title: string;
  description: string;
  /** Null when not known. */
  ranked: boolean | null;
  /** Voters in the award; null when only percentages are known. */
  total: number | null;
  /** Shown under the title, e.g. where the numbers are off. */
  note?: string;
  /** The stream at this award's reveal. */
  stream?: string | null;
  /** Best first. */
  standings: Standing[];
  rounds: Round[] | null;
};

/**
 * 2025's results, from the wiki (src/archive/2025.json): winners and
 * percentages, no counts. Replace the file with real numbers when they turn up.
 */
export async function loadArchive2025(): Promise<AwardResult[]> {
  return archive2025.awards.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    ranked: null,
    total: a.count,
    note: "note" in a ? (a.note as string) : undefined,
    stream: a.stream,
    standings: a.nominees.map((n, i) => ({
      id: `${a.id}-${i}`,
      title: n.title,
      count: null,
      percentage: n.percentage,
      isWinner: n.winner,
      image: n.image,
      emote: a.id === "emote" ? n.title : undefined,
      clip: n.url ? nomineeClip({ url: n.url }, `${n.title} · ${a.title}`) : null,
    })),
    rounds: null,
  }));
}

/**
 * Made-up results for this year's nominees, for admins to preview the page
 * before there are votes: per award, a few hundred voters shared out at
 * random (the same each time for an award). Never saved, never public.
 */
export async function loadSimulated(): Promise<AwardResult[]> {
  const data: any[] = await fetch("/api/admin/nominees").then((r) => (r.ok ? r.json() : []));
  return data
    .filter((c) => !c.hidden && c.options.length > 0)
    .map((c) => {
      let seed = [...String(c.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 11) || 1;
      const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const total = 250 + Math.floor(random() * 400);
      const weights = c.options.map(() => random() ** 2.2 + 0.02);
      const sum = weights.reduce((a: number, b: number) => a + b, 0);
      const counts: number[] = weights.map((w: number) => Math.round((w / sum) * total));
      const most = Math.max(...counts);
      const counted = counts.reduce((a, b) => a + b, 0) || 1;
      const standings = c.options
        .map((o: any, i: number) => ({
          id: o.id,
          title: o.title,
          count: counts[i]!,
          percentage: Number(((counts[i]! / counted) * 100).toFixed(1)),
          isWinner: counts[i] === most,
          image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
          emote: o.emote ?? undefined,
          clip: nomineeClip(o, `${o.title} · ${c.title}`),
        }))
        .sort((a: Standing, b: Standing) => b.count! - a.count!);
      return { id: c.id, title: c.title, description: c.description ?? "", ranked: c.votingStyle === "ranked", total: counted, standings, rounds: null };
    });
}

export async function loadSummary(): Promise<AwardResult[]> {
  const data: any[] = await fetch("/api/vote/results?preview=1").then((r) => (r.ok ? r.json() : []));
  return data.map((c) => ({
    id: c.categoryId,
    title: c.categoryTitle,
    description: c.categoryDescription ?? "",
    ranked: c.votingStyle === "ranked",
    total: c.totalVotes,
    // The API lists last place first.
    standings: [...c.options].reverse().map((o: any) => ({
      id: o.id,
      title: o.title,
      count: o.count,
      percentage: o.percentage,
      isWinner: o.isWinner,
      image: o.payload?.thumbnailUrl ?? (o.payload?.imageId ? `/Media/${o.payload.imageId}` : null),
      emote: o.payload?.emote ?? undefined,
      clip: o.payload ? nomineeClip(o.payload, `${o.title} · ${c.categoryTitle}`) : null,
    })),
    rounds: c.runoff?.rounds ?? null,
  }));
}

/**
 * How decisively an award was won. For ranked awards that's the final
 * runoff round; otherwise first choices. In points of the votes counted.
 */
function margin(a: AwardResult): { winner: Standing; runnerUp: Standing; votes: number | null; points: number } | null {
  const winner = a.standings.find((s) => s.isWinner) ?? a.standings[0];
  if (!winner || a.total === 0) return null;
  // Only percentages: the margin is the gap between them.
  if (a.total === null || winner.count === null) {
    const runnerUp = [...a.standings].filter((s) => s !== winner).sort((x, y) => y.percentage - x.percentage)[0];
    return runnerUp ? { winner, runnerUp, votes: null, points: winner.percentage - runnerUp.percentage } : null;
  }
  let counts: [string, number][];
  if (a.ranked && a.rounds?.length) {
    const last = a.rounds[a.rounds.length - 1]!;
    counts = Object.entries(last.counts);
  } else counts = a.standings.map((s) => [s.id, s.count ?? 0]);
  const sorted = counts.sort((x, y) => y[1] - x[1]);
  const top = sorted.find(([id]) => id === winner.id)?.[1] ?? 0;
  const next = sorted.find(([id]) => id !== winner.id);
  if (!next) return null;
  const counted = counts.reduce((n, [, c]) => n + c, 0) || 1;
  const runnerUp = a.standings.find((s) => s.id === next[0])!;
  return { winner, runnerUp, votes: top - next[1], points: ((top - next[1]) / counted) * 100 };
}

const votes = (n: number) => `${n.toLocaleString()} vote${n === 1 ? "" : "s"}`;
/** "by 34 votes", or "by 8.1 points" when there are no counts. */
const by = (m: { votes: number | null; points: number }) => (m.votes === null ? `${m.points.toFixed(1)} points` : votes(m.votes));

/**
 * The results to look over after the show: an overview with the closest
 * races and the biggest wins, then every award in turn with its winner,
 * full standings and, for ranked awards, the runoff round by round.
 * The live reveal is on the big screen.
 *
 * `load` gives the awards (by default this year's, from the admin preview);
 * with only percentages known (2025), counts and ballots are left out.
 */
export function Summary({
  load = loadSummary,
  title = "The results",
  footer,
  extra,
}: {
  load?: () => Promise<AwardResult[]>;
  title?: string;
  footer?: ReactNode;
  /** More for the overview, under the highlights (the tally). */
  extra?: ReactNode;
} = {}) {
  const [awards, setAwards] = useState<AwardResult[] | null>(null);
  const [watching, setWatching] = useState<Clip | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    load()
      .then(setAwards)
      .catch(() => setAwards([]));
  }, [load]);

  // Keep the highlighted award in view in the side list, which scrolls on its
  // own: when it gets near an edge, bring it to a third of the way down.
  const sideList = useRef<HTMLElement>(null);
  useEffect(() => {
    const list = sideList.current;
    if (!list) return;
    if (!current) return list.scrollTo({ top: 0, behavior: "smooth" });
    const item = list.querySelector<HTMLElement>(`[data-award="${CSS.escape(current)}"]`);
    if (!item) return;
    const box = list.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top < box.top + 48 || r.bottom > box.bottom - 16) {
      list.scrollTo({ top: list.scrollTop + (r.top - box.top) - box.height / 3, behavior: "smooth" });
    }
  }, [current]);

  // Which award is on screen, for the list on the side: the last one whose
  // heading has passed the upper third of the window; none above the first
  // (the overview); the last one at the very bottom of the page, where the
  // short final awards can't reach that line.
  useEffect(() => {
    if (!awards) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
      let found: string | null = null;
      for (const a of awards) {
        const el = document.getElementById(`award-${a.id}`);
        if (el && el.getBoundingClientRect().top <= innerHeight / 3) found = a.id;
      }
      setCurrent(atBottom && found ? awards[awards.length - 1]!.id : found);
    };
    const onScroll = () => void (frame ||= requestAnimationFrame(update));
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [awards]);

  if (awards === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (awards.length === 0) return <div className="cozy-panel p-8">No results to show.</div>;

  const decided = awards.map((a) => ({ a, m: margin(a) })).filter((x) => x.m !== null) as { a: AwardResult; m: NonNullable<ReturnType<typeof margin>> }[];
  const closest = [...decided].sort((x, y) => x.m.points - y.m.points).slice(0, 3);
  const biggest = [...decided].sort((x, y) => y.m.points - x.m.points).slice(0, 3);
  const counted = awards.every((a) => a.total !== null);
  const busiest = counted
    ? [...awards].sort((x, y) => y.total! - x.total!).slice(0, 3)
    : [...awards].sort((x, y) => y.standings.length - x.standings.length).slice(0, 3);
  const ballots = awards.reduce((n, a) => n + (a.total ?? 0), 0);
  const nominees = awards.reduce((n, a) => n + a.standings.length, 0);
  const jump = (id: string) => document.getElementById(`award-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
      <Dialog.Root open={!!watching} onOpenChange={(open) => !open && setWatching(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            className="cozy-panel lab-pop fixed top-1/2 left-1/2 z-50 w-[min(880px,94vw)] -translate-x-1/2 -translate-y-1/2 space-y-3 p-5"
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-xl font-black">{watching?.title}</Dialog.Title>
              <Dialog.Close className="cozy-btn">Close</Dialog.Close>
            </div>
            {watching && <ClipPlayer clip={watching} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Every award, with its winner, to jump to. */}
      <nav
        ref={sideList}
        aria-label="Awards"
        className="cozy-panel hidden h-fit max-h-[calc(100dvh-var(--lab-header,64px)-2rem)] overflow-y-auto p-3 lg:sticky lg:top-[calc(var(--lab-header,64px)+1rem)] lg:block"
      >
        <a href="#summary-top" onClick={(e) => (e.preventDefault(), scrollTo({ top: 0, behavior: "smooth" }))} className="block px-3 pb-2 font-black">
          Overview
        </a>
        <ol className="space-y-0.5">
          {awards.map((a) => {
            const winner = a.standings.find((s) => s.isWinner);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => jump(a.id)}
                  data-award={a.id}
                  className="cozy-row block w-full rounded-2xl px-3 py-1.5 text-left text-sm"
                  style={current === a.id ? { background: "var(--highlight)" } : undefined}
                  aria-current={current === a.id ? "true" : undefined}
                >
                  <span className="block font-bold">{a.title}</span>
                  {winner && (
                    <span className="block truncate text-xs font-semibold" style={{ color: "var(--muted)" }}>
                      {winner.title}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div id="summary-top" className="min-w-0 space-y-5">
        {/* The overview. */}
        <section className="cozy-panel space-y-5 p-6">
          <h2 className="flex items-center gap-3 text-3xl font-black">
            <Emote name="PepoG" size={1.2} title="" /> {title}
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Awards" value={awards.length.toLocaleString()} />
            {counted ? (
              <Figure label="Ballots cast" value={ballots.toLocaleString()} />
            ) : (
              <Figure label="Nominees" value={nominees.toLocaleString()} />
            )}
            <Figure label="Closest race" value={closest[0] ? `${closest[0].m.points.toFixed(1)} pts` : "–"} note={closest[0]?.a.title} />
            <Figure label="Biggest win" value={biggest[0] ? `${biggest[0].m.points.toFixed(1)} pts` : "–"} note={biggest[0]?.a.title} />
          </dl>
          <div className="grid gap-4 md:grid-cols-3">
            <Highlights title="Closest races" items={closest.map(({ a, m }) => ({ a, text: `${m.winner.title} over ${m.runnerUp.title} by ${by(m)}` }))} onJump={jump} />
            <Highlights title="Biggest wins" items={biggest.map(({ a, m }) => ({ a, text: `${m.winner.title}, ${m.points.toFixed(1)} points clear` }))} onJump={jump} />
            {counted ? (
              <Highlights title="Most votes" items={busiest.map((a) => ({ a, text: votes(a.total!) }))} onJump={jump} />
            ) : (
              <Highlights title="Most nominees" items={busiest.map((a) => ({ a, text: `${a.standings.length} nominees` }))} onJump={jump} />
            )}
          </div>
          {extra}
        </section>

        {awards.map((a) => (
          <AwardSection key={a.id} award={a} onWatch={setWatching} />
        ))}
        <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
          {footer ?? "Percentages are of first choices. For ranked awards, the winner is decided by the runoff below each one."}
        </p>
      </div>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border-2 px-4 py-3" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
      <dt className="text-sm font-bold" style={{ color: "var(--muted)" }}>
        {label}
      </dt>
      <dd className="hand text-3xl font-bold">{value}</dd>
      {note && (
        <dd className="truncate text-xs font-bold" style={{ color: "var(--muted)" }}>
          {note}
        </dd>
      )}
    </div>
  );
}

function Highlights({
  title,
  items,
  onJump,
}: {
  title: string;
  items: { a: AwardResult; text: string }[];
  onJump: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-1.5 font-black">{title}</h3>
      <ol className="space-y-1">
        {items.map(({ a, text }) => (
          <li key={a.id}>
            <button type="button" className="cozy-row w-full rounded-xl px-2 py-1 text-left" onClick={() => onJump(a.id)}>
              <span className="block text-sm font-bold">{a.title}</span>
              <span className="block text-xs font-semibold" style={{ color: "var(--muted)" }}>
                {text}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One award: its winner, the standings (bars grow as it scrolls into view), and the runoff. */
function AwardSection({ award, onWatch }: { award: AwardResult; onWatch: (clip: Clip) => void }) {
  const el = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const observer = new IntersectionObserver(([e]) => e?.isIntersecting && (setSeen(true), observer.disconnect()), { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const m = margin(award);
  const winners = award.standings.filter((s) => s.isWinner);
  const winner = winners[0];
  // Bars by count, or by percentage when there are no counts.
  const value = (s: Standing) => s.count ?? s.percentage;
  const most = Math.max(1, ...award.standings.map(value));

  return (
    <section ref={el} id={`award-${award.id}`} className="cozy-panel scroll-mt-[calc(var(--lab-header,64px)+1rem)] space-y-5 p-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-2xl font-black">{award.title}</h2>
          {award.total !== null && <span className="cozy-chip">{votes(award.total)}</span>}
          {award.ranked !== null && <span className="cozy-chip">{award.ranked ? "Ranked choice" : "Single pick"}</span>}
          {award.stream && (
            <a className="cozy-chip" href={award.stream} target="_blank" rel="noopener noreferrer">
              ↗ The reveal on stream
            </a>
          )}
        </div>
        {award.description && (
          <p className="font-semibold" style={{ color: "var(--muted)" }}>
            {award.description}
          </p>
        )}
        {award.note && (
          <p className="text-sm font-semibold" style={{ color: "var(--coral)" }}>
            {award.note}
          </p>
        )}
      </header>

      {winner && (
        <div className="flex flex-wrap items-center gap-5 rounded-[20px] border-2 p-3" style={{ background: "var(--highlight)", borderColor: "var(--panel-border)" }}>
          {winner.image ? (
            <img src={winner.image} alt="" className="aspect-video w-56 rounded-[14px] object-cover" loading="lazy" />
          ) : (
            winner.emote && (
              <span className="flex aspect-video w-56 items-center justify-center rounded-[14px]" style={{ background: "var(--cream)" }}>
                <Emote name={winner.emote} size={2.4} />
              </span>
            )
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <span className="cozy-chip coral">{winners.length > 1 ? "Tied winners" : "Winner"}</span>
            <p className="text-2xl font-black">{winners.map((w) => w.title).join(" & ")}</p>
            <p className="font-semibold">
              {winner.count === null
                ? `${winner.percentage}% of the vote`
                : `${votes(winner.count)} · ${winner.percentage}% of first choices`}
            </p>
            {m && winners.length === 1 && (
              <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                {m.votes === null
                  ? `Won by ${m.points.toFixed(1)} points over ${m.runnerUp.title}.`
                  : `Won by ${votes(m.votes)} over ${m.runnerUp.title} (${m.points.toFixed(1)} points${
                      award.ranked && award.rounds && award.rounds.length > 1 ? ` in the final round of ${award.rounds.length}` : ""
                    }).`}
              </p>
            )}
          </div>
          {winner.clip && (
            <button type="button" className="cozy-btn primary" onClick={() => onWatch(winner.clip!)}>
              <PlayIcon /> Watch the clip
            </button>
          )}
        </div>
      )}

      <ol className="space-y-1.5">
        {award.standings.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[1.5rem_2.75rem_minmax(7rem,14rem)_1fr_auto] items-center gap-3">
            <span className="hand text-right text-xl font-bold" style={{ color: "var(--muted)" }}>
              {i + 1}
            </span>
            <span className="block h-7 w-11 overflow-hidden rounded-md" style={{ background: "var(--panel-border)" }}>
              {s.image ? (
                <img src={s.image} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                s.emote && (
                  <span className="flex h-full w-full items-center justify-center" style={{ background: "var(--cream)" }}>
                    <Emote name={s.emote} size={0.85} />
                  </span>
                )
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 font-bold">
              <span className="truncate">{s.title}</span>
              {s.clip && (
                <button
                  type="button"
                  className="cozy-row shrink-0 rounded-full p-1"
                  style={{ color: "var(--coral)" }}
                  onClick={() => onWatch(s.clip!)}
                  aria-label={`Watch the clip of ${s.title}`}
                  title="Watch the clip"
                >
                  <PlayIcon />
                </button>
              )}
            </span>
            <span className="h-5 overflow-hidden rounded-full" style={{ background: "var(--cream)" }}>
              <span
                className="block h-full rounded-full"
                style={{
                  width: seen ? `${(value(s) / most) * 100}%` : "0%",
                  background: s.isWinner ? "var(--coral)" : "var(--primary)",
                  transition: `width 900ms cubic-bezier(0.3, 0.7, 0.3, 1) ${i * 60}ms`,
                }}
              />
            </span>
            <span className="hand w-28 text-right text-lg font-bold tabular-nums">
              {s.count === null ? `${s.percentage}%` : `${s.count.toLocaleString()} · ${s.percentage}%`}
            </span>
          </li>
        ))}
      </ol>

      {award.ranked && award.rounds && award.rounds.length > 0 && <Runoff award={award} />}
    </section>
  );
}

/** The instant runoff, round by round: who had how many, and who went out. */
function Runoff({ award }: { award: AwardResult }) {
  const rounds = award.rounds!;
  const name = (id: string) => award.standings.find((s) => s.id === id)?.title ?? id;
  return (
    <details className="rounded-2xl border-2 p-4" style={{ borderColor: "var(--panel-border)" }}>
      <summary className="cursor-pointer font-black">
        The runoff, round by round ({rounds.length} round{rounds.length === 1 ? "" : "s"})
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th className="py-1 pr-3 text-left font-bold">Nominee</th>
              {rounds.map((_, i) => (
                <th key={i} className="px-2 py-1 text-right font-bold">
                  Round {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {award.standings.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--panel-border)" }}>
                <td className="py-1 pr-3 font-bold">{name(s.id)}</td>
                {rounds.map((r, i) => {
                  const count = r.counts[s.id];
                  const out = r.eliminated.includes(s.id);
                  return (
                    <td key={i} className="hand px-2 py-1 text-right text-base font-bold tabular-nums" style={out ? { color: "var(--coral)" } : undefined}>
                      {count === undefined ? "" : count.toLocaleString()}
                      {out && <span className="ml-1 text-xs">out</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t" style={{ borderColor: "var(--panel-border)", color: "var(--muted)" }}>
              <td className="py-1 pr-3 font-bold">No choices left</td>
              {rounds.map((r, i) => (
                <td key={i} className="hand px-2 py-1 text-right text-base font-bold tabular-nums">
                  {r.exhausted.toLocaleString()}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
