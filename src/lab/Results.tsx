import { useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs";
import { annotate } from "rough-notation";
import { useBursts } from "@/lab/Bursts";
import { cssVar, drawIn, useDrawnLook } from "@/lab/sketch";

type Result = { id: string; title: string; count: number; percentage: number; isWinner: boolean };
type Award = { id: string; title: string; total: number; results: Result[] };

/**
 * The results reveal, hand-drawn: sorted bars from zero, each labelled with
 * name, count and share, the total shown, and one emphasis for the winner
 * (per StrawWaffle's visualisation article). Bars are revealed from last place up;
 * each draws itself in and its numbers count up; the winner gets circled.
 * Uses the admin results preview, so it works before voting closes.
 */
export function Results() {
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();

  useEffect(() => {
    fetch("/api/vote/results?preview=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) =>
        setAwards(
          data.map((c) => ({
            id: c.categoryId,
            title: c.categoryTitle,
            total: c.totalVotes,
            // Most votes first, for reading; revealed from the bottom.
            results: [...c.options]
              .map((o: any) => ({ id: o.id, title: o.title, count: o.count, percentage: o.percentage, isWinner: o.isWinner }))
              .sort((a, b) => b.count - a.count),
          })),
        ),
      )
      .catch(() => setAwards([]));
  }, []);

  if (awards === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (awards.length === 0) return <div className="cozy-panel p-8">No results to show.</div>;
  const award = awards[index]!;
  const n = award.results.length;
  const max = Math.max(1, ...award.results.map((r) => r.count));
  const go = (i: number) => {
    setIndex((i + awards.length) % awards.length);
    setShown(0);
  };
  const reveal = (count: number) => {
    const next = Math.min(n, count);
    setShown(next);
    if (next === n && box.current) {
      // The winner: a cheer from over their row, once its bar has drawn.
      setTimeout(() => {
        const w = box.current?.querySelector<HTMLElement>("[data-winner]");
        const frame = box.current!.getBoundingClientRect();
        const r = w?.getBoundingClientRect();
        if (r) {
          fire("CHEERSTINY", r.left - frame.left + 60, r.top - frame.top, 8);
          setTimeout(() => fire("Klappa", r.left - frame.left + 200, r.top - frame.top, 8), 200);
        }
      }, 900);
    }
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
        <div className="mt-8 space-y-3">
          {award.results.map((r, i) => {
            // Row i is revealed once the bottom `shown` rows are.
            const revealed = i >= n - shown;
            return <Row key={`${award.id}-${r.id}`} result={r} max={max} revealed={revealed} />;
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="cozy-btn" onClick={() => go(index - 1)}>
          ← Previous award
        </button>
        <button type="button" className="cozy-btn primary" onClick={() => reveal(shown + 1)} disabled={shown >= n}>
          Reveal next
        </button>
        <button type="button" className="cozy-btn" onClick={() => reveal(Math.max(shown, n - 3))} disabled={shown >= n - 3}>
          Reveal all but the last three
        </button>
        <button type="button" className="cozy-btn" onClick={() => reveal(n)} disabled={shown >= n}>
          Reveal everything
        </button>
        <button type="button" className="cozy-btn" onClick={() => setShown(0)}>
          Hide again
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
  const el = useRef<HTMLHeadingElement>(null);
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

/** One nominee's row: name, a hand-drawn bar from zero, count and share. */
function Row({ result, max, revealed }: { result: Result; max: number; revealed: boolean }) {
  const drawn = useDrawnLook();
  const bar = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const count = useCountUp(revealed ? result.count : 0, revealed);
  const colour = result.isWinner ? "var(--coral)" : "var(--primary-shadow)";

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Draw the bar: hatched fill and outline, drawn in when it's revealed.
  const wasRevealed = useRef(false);
  useEffect(() => {
    const el = svg.current;
    if (!el || width === 0) return;
    el.replaceChildren();
    if (!revealed) {
      wasRevealed.current = false;
      return;
    }
    const w = Math.max(6, (result.count / max) * (width - 8));
    if (drawn) {
      const rc = rough.svg(el);
      const seed = result.id.length + result.count;
      const node = rc.rectangle(3, 4, w, 26, {
        seed,
        roughness: 1.3,
        bowing: 1.2,
        stroke: "currentColor",
        strokeWidth: 2,
        fill: "currentColor",
        fillStyle: result.isWinner ? "cross-hatch" : "hachure",
        hachureGap: 6,
        fillWeight: 1.6,
      });
      el.appendChild(node);
      if (!wasRevealed.current) drawIn(el, 800);
    } else {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      Object.entries({ x: 3, y: 4, width: w, height: 26, rx: 8, fill: "currentColor" }).forEach(([k, v]) => rect.setAttribute(k, String(v)));
      el.appendChild(rect);
      rect.animate([{ width: 0 }, { width: w }], { duration: 600, easing: "ease-out" });
    }
    wasRevealed.current = true;
  }, [revealed, width, max, result, drawn]);

  // Circle the winner's name once their bar is in.
  useEffect(() => {
    if (!revealed || !result.isWinner || !name.current) return;
    const a = annotate(name.current, {
      type: drawn ? "circle" : "highlight",
      color: drawn ? cssVar("--coral") : `color-mix(in oklab, ${cssVar("--coral")} 30%, transparent)`,
      strokeWidth: 3,
      padding: drawn ? 10 : 2,
      animationDuration: 800,
    });
    const timer = setTimeout(() => a.show(), 850);
    return () => {
      clearTimeout(timer);
      a.remove();
    };
  }, [revealed, result.isWinner, drawn]);

  return (
    <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_7rem] items-center gap-4" data-winner={result.isWinner && revealed ? "" : undefined}>
      <span className="truncate text-right font-extrabold">
        <span ref={name} className="inline-block">
          {result.title}
        </span>
      </span>
      <div ref={bar} className="relative h-[34px]">
        {!revealed && (
          // A pencilled dashed line where the bar will be.
          <div className="absolute top-1/2 left-1 right-4 border-t-2 border-dashed opacity-40" style={{ borderColor: "var(--muted)" }} />
        )}
        <svg ref={svg} aria-hidden className="absolute inset-0 h-full w-full overflow-visible" style={{ color: colour }} />
      </div>
      <span className="hand text-xl font-bold tabular-nums" aria-live="polite">
        {revealed ? (
          <>
            {count.toLocaleString()} <span style={{ color: "var(--muted)" }}>· {result.percentage}%</span>
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>?</span>
        )}
      </span>
    </div>
  );
}

/** A number that counts up to `target` when `run` turns on. */
function useCountUp(target: number, run: boolean, ms = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return setValue(0);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, ms]);
  return value;
}
