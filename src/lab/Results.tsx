import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs";
import { annotate } from "rough-notation";
import { useBursts } from "@/lab/Bursts";
import { cssVar, useDrawnLook } from "@/lab/sketch";

export type Result = { id: string; title: string; count: number; percentage: number; isWinner: boolean };
export type Award = { id: string; title: string; total: number; results: Result[] };

/** Every award's results, from the admin preview (so it works before voting closes). */
export function loadResults(): Promise<Award[]> {
  return fetch("/api/vote/results?preview=1")
    .then((r) => (r.ok ? r.json() : []))
    .then((data: any[]) =>
      data.map((c) => ({
        id: c.categoryId,
        title: c.categoryTitle,
        total: c.totalVotes,
        results: c.options.map((o: any) => ({
          id: o.id,
          title: o.title,
          count: o.count,
          percentage: o.percentage,
          isWinner: o.isWinner,
        })),
      })),
    );
}

const ROW_H = 46;
const BAR_H = 26;
/** The box drawn round a bar once its scribble is done. */
const BOX_MS = 650;
/** A beat between one bar finishing (and sliding into place) and the next starting. */
const PAUSE_MS = 900;

/**
 * The results reveal, drawn like a person would:
 * - The rows start in a scrambled order (seeded by the award, so the preview
 *   and the stream match) and nominees are revealed from last place up.
 * - Each bar is scribbled in from left to right, then a box is drawn round it,
 *   then the row slides into its ranked place, so it ends sorted.
 * - The longest bar so far fills the width, so earlier bars squish as bigger
 *   ones come in, and the winner's length is no giveaway.
 * - The winner's scribble races to just short of second place, creeps past
 *   it, then finishes quickly.
 * Uses the admin results preview, so it works before voting closes.
 */
export function Results() {
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [index, setIndex] = useState(0);
  /** How many to reveal (from last place up); the board works its way there. */
  const [target, setTarget] = useState(0);
  /** Bumped to start an award over. */
  const [run, setRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();

  useEffect(() => {
    loadResults()
      .then(setAwards)
      .catch(() => setAwards([]));
  }, []);

  const cheer = useCallback(
    (el: HTMLElement) => {
      const frame = box.current?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!frame) return;
      fire("CHEERSTINY", r.left - frame.left + 40, r.top - frame.top, 8);
      setTimeout(() => fire("Klappa", r.left - frame.left + 180, r.top - frame.top, 8), 200);
    },
    [fire],
  );

  if (awards === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (awards.length === 0) return <div className="cozy-panel p-8">No results to show.</div>;
  const award = awards[index]!;
  const n = award.results.length;
  const go = (i: number) => {
    setIndex((i + awards.length) % awards.length);
    setTarget(0);
    setRun((r) => r + 1);
  };

  return (
    <div className="space-y-5">
      <div ref={box} className="cozy-panel relative overflow-hidden p-6 sm:p-8">
        {layer}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="cozy-chip coral">Results</span>
          <span className="cozy-chip">
            Award {index + 1} of {awards.length}
          </span>
          <span className="cozy-chip green hand text-base!">{award.total.toLocaleString()} votes</span>
        </div>
        <Title key={award.id} text={award.title} />
        <Board key={`${award.id}-${run}`} award={award} target={target} onWinner={cheer} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="cozy-btn" onClick={() => go(index - 1)}>
          ← Previous award
        </button>
        <button type="button" className="cozy-btn primary" onClick={() => setTarget((t) => Math.min(n, t + 1))} disabled={target >= n}>
          Reveal next
        </button>
        <button type="button" className="cozy-btn" onClick={() => setTarget((t) => Math.max(t, n - 3))} disabled={target >= n - 3}>
          Reveal all but the last three
        </button>
        <button type="button" className="cozy-btn" onClick={() => setTarget(n)} disabled={target >= n}>
          Reveal everything
        </button>
        <button
          type="button"
          className="cozy-btn"
          onClick={() => {
            setTarget(0);
            setRun((r) => r + 1);
          }}
        >
          Start over
        </button>
        <button type="button" className="cozy-btn" onClick={() => go(index + 1)}>
          Next award →
        </button>
      </div>
    </div>
  );
}

/** The award title, underlined by hand as it appears. */
function Title({ text }: { text: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const drawn = useDrawnLook();
  useEffect(() => {
    if (!el.current || !drawn) return;
    const a = annotate(el.current, { type: "underline", color: cssVar("--primary-shadow"), strokeWidth: 3, padding: 2, animationDuration: 700 });
    const timer = setTimeout(() => a.show(), 150);
    return () => {
      clearTimeout(timer);
      a.remove();
    };
  }, [text, drawn]);
  return (
    <h2 className="inline-block text-4xl font-black">
      <span ref={el}>{text}</span>
    </h2>
  );
}

// ---- Timing of one bar's scribble.

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * How a bar's value grows over time. Most bars: a quick scribble that eases
 * out. The winner: races to just short of the runner-up, creeps past it,
 * then finishes quickly.
 */
function plan(count: number, rival: number | null): { ms: number; at: (ms: number) => number } {
  if (rival === null || rival <= 0 || count <= rival) {
    const ms = 1100 + Math.min(900, count * 4);
    return { ms, at: (t) => count * easeOut(Math.min(1, t / ms)) };
  }
  const a = rival * 0.9;
  const b = Math.min(count, rival * 1.04);
  const [ta, tb, tc] = [1100, 2800, count > b ? 900 : 0];
  return {
    ms: ta + tb + tc,
    at: (t) => {
      if (t < ta) return a * easeOut(t / ta);
      if (t < ta + tb) return a + (b - a) * easeInOut((t - ta) / tb);
      return b + (count - b) * easeInOut(Math.min(1, (t - ta - tb) / Math.max(1, tc)));
    },
  };
}

/** Shuffle with a seed from the award, so the order is the same every time. */
function scrambled<T>(items: T[], seedText: string) {
  let seed = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

type Phase = "hidden" | "scribble" | "box" | "done";
type RowState = { v: number; phase: Phase };
type RowEls = {
  clip: SVGRectElement | null;
  fill: SVGGElement | null;
  outline: SVGGElement | null;
  count: HTMLSpanElement | null;
  name: HTMLSpanElement | null;
};

/** One award's rows, revealed up to `target`, one bar at a time. */
export function Board({
  award,
  target,
  onWinner,
  onFinished,
}: {
  award: Award;
  target: number;
  onWinner: (el: HTMLElement) => void;
  /** Once every row is drawn and in place. */
  onFinished?: () => void;
}) {
  const drawn = useDrawnLook();
  const n = award.results.length;
  // Last place first: the order they're revealed in.
  const [byRank] = useState(() => [...award.results].sort((a, b) => a.count - b.count));
  const [start] = useState(() => scrambled(award.results.map((r) => r.id), award.id));
  /** How many have finished (drawn, boxed and slid into place). */
  const [done, setDone] = useState(0);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    if (n > 0 && done === n) finishedRef.current?.();
  }, [done, n]);
  const state = useRef(new Map(award.results.map((r) => [r.id, { v: 0, phase: "hidden" } as RowState])));
  const els = useRef(new Map<string, RowEls>());
  const [barW, setBarW] = useState(0);
  const measure = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  /** Bumped when a pause ends, to start the next reveal. */
  const [wake, setWake] = useState(0);
  /** The row being scribbled, so its placeholder dashes go as it starts. */
  const [active, setActive] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBarW(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Slots: finished rows sorted best first at the top; the rest keep their
  // scrambled order underneath.
  const finished = byRank.slice(0, done);
  const finishedIds = new Set(finished.map((r) => r.id));
  const slots = [
    ...[...finished].sort((a, b) => b.count - a.count).map((r) => r.id),
    ...start.filter((id) => !finishedIds.has(id)),
  ];

  /** Draw every bar at its current value; the longest so far fills the width. */
  const paint = useCallback(() => {
    if (barW === 0) return;
    const values = [...state.current.values()].filter((s) => s.phase !== "hidden").map((s) => s.v);
    const most = Math.max(1, ...values);
    for (const r of award.results) {
      const s = state.current.get(r.id)!;
      const e = els.current.get(r.id);
      if (!e) continue;
      const w = s.phase === "hidden" ? 0 : Math.max(s.v > 0 ? 4 : 0, (s.v / most) * (barW - 8));
      e.clip?.setAttribute("width", String(w));
      if (e.count) {
        e.count.textContent =
          s.phase === "hidden" ? "?" : `${Math.round(s.v).toLocaleString()} · ${((s.v / Math.max(1, award.total)) * 100).toFixed(1)}%`;
      }
      // The box follows the bar's length as later bars squish it.
      if (e.outline && (s.phase === "box" || s.phase === "done") && drawn) {
        const last = Number(e.outline.dataset.w ?? -1);
        if (Math.abs(last - w) > 0.5) {
          e.outline.replaceChildren(
            rough.svg(e.outline.ownerSVGElement!).rectangle(3, 4, Math.max(4, w), BAR_H, {
              seed: r.id.length * 7 + 3,
              roughness: 1.2,
              bowing: 1,
              strokeWidth: 2.2,
              stroke: "currentColor",
            }),
          );
          e.outline.dataset.w = String(w);
        }
      }
    }
  }, [award, barW, drawn]);

  // The scribble fill of every bar, drawn once at full width and revealed
  // through a clip as the bar grows.
  useEffect(() => {
    if (barW === 0) return;
    for (const r of award.results) {
      const e = els.current.get(r.id);
      if (!e?.fill) continue;
      const svg = e.fill.ownerSVGElement!;
      e.fill.replaceChildren(
        drawn
          ? rough.svg(svg).rectangle(3, 4, barW - 8, BAR_H, {
              seed: r.id.length * 13 + r.count,
              roughness: 1.3,
              stroke: "none",
              fill: "currentColor",
              fillStyle: r.isWinner ? "cross-hatch" : "hachure",
              hachureGap: 6,
              fillWeight: 1.6,
            })
          : Object.assign(document.createElementNS("http://www.w3.org/2000/svg", "rect"), {}),
      );
      if (!drawn) {
        const rect = e.fill.firstChild as SVGRectElement;
        Object.entries({ x: 3, y: 4, width: barW - 8, height: BAR_H, rx: 8, fill: "currentColor" }).forEach(([k, v]) =>
          rect.setAttribute(k, String(v)),
        );
      }
      if (e.outline) delete e.outline.dataset.w;
    }
    paint();
  }, [award, barW, drawn, paint]);

  // Work through the reveals one at a time until `target` are done.
  useEffect(() => {
    if (busy.current || done >= target || barW === 0) return;
    busy.current = true;
    const r = byRank[done]!;
    const s = state.current.get(r.id)!;
    const final = done === n - 1;
    // The winner's race is against the best of the rest.
    const rival = final && done > 0 ? Math.max(...byRank.slice(0, done).map((x) => x.count)) : null;
    const { ms, at } = plan(r.count, rival);
    s.phase = "scribble";
    setActive(r.id);
    let raf = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = now - began;
      s.v = at(t);
      paint();
      if (t < ms) {
        raf = requestAnimationFrame(tick);
        return;
      }
      s.v = r.count;
      s.phase = "box";
      paint();
      // Then the box round it, drawn like a pen.
      const outline = els.current.get(r.id)?.outline;
      outline?.querySelectorAll("path").forEach((p) => {
        const length = p.getTotalLength();
        p.style.strokeDasharray = `${length}`;
        p.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: BOX_MS, easing: "ease-in-out" });
      });
      timers.push(
        setTimeout(() => {
          s.phase = "done";
          setDone((d) => d + 1);
          const name = els.current.get(r.id)?.name;
          if (final && r.isWinner && name) {
            const a = annotate(name, { type: drawn ? "circle" : "highlight", color: cssVar("--coral"), strokeWidth: 3, padding: drawn ? 10 : 2, animationDuration: 800 });
            timers.push(setTimeout(() => {
              a.show();
              onWinner(name);
            }, 700));
          }
          // After a pause, on to the next one (if there's one to reveal).
          timers.push(
            setTimeout(() => {
              busy.current = false;
              setWake((w) => w + 1);
            }, PAUSE_MS),
          );
        }, BOX_MS),
      );
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    raf = requestAnimationFrame(tick);
    // A reveal runs to the end; only a new Board (Start over, another award)
    // stops one midway, and that throws this one's elements away.
    void raf;
  }, [done, target, barW, byRank, n, paint, drawn, onWinner, wake]);

  return (
    <div className="relative mt-8" style={{ height: n * ROW_H }}>
      {award.results.map((r) => {
        const slot = slots.indexOf(r.id);
        const colour = r.isWinner ? "var(--coral)" : "var(--primary-shadow)";
        const e = els.current.get(r.id) ?? { clip: null, fill: null, outline: null, count: null, name: null };
        els.current.set(r.id, e);
        const hidden = state.current.get(r.id)!.phase === "hidden" && active !== r.id;
        return (
          <div
            key={r.id}
            className="absolute inset-x-0 grid grid-cols-[minmax(8rem,14rem)_1fr_8rem] items-center gap-4"
            style={{ height: ROW_H, transform: `translateY(${slot * ROW_H}px)`, transition: "transform 700ms cubic-bezier(.3,.7,.3,1)" }}
          >
            <span className="truncate text-right font-extrabold">
              <span ref={(el) => void (e.name = el)} className="inline-block">
                {r.title}
              </span>
            </span>
            <div ref={slot === 0 ? measure : undefined} className="relative" style={{ height: BAR_H + 8 }}>
              {hidden && (
                <div className="absolute top-1/2 left-1 right-4 border-t-2 border-dashed opacity-40" style={{ borderColor: "var(--muted)" }} />
              )}
              <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" style={{ color: colour }}>
                <defs>
                  <clipPath id={`clip-${award.id}-${r.id}`}>
                    <rect ref={(el) => void (e.clip = el)} x={0} y={-4} width={0} height={BAR_H + 16} />
                  </clipPath>
                </defs>
                <g ref={(el) => void (e.fill = el)} clipPath={`url(#clip-${award.id}-${r.id})`} />
                <g ref={(el) => void (e.outline = el)} />
              </svg>
            </div>
            <span ref={(el) => void (e.count = el)} className="hand text-xl font-bold tabular-nums">
              ?
            </span>
          </div>
        );
      })}
    </div>
  );
}
