import { useEffect, useRef, useState } from "react";
import { useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { Sketch } from "@/lab/sketch";
import type { SiteConfig } from "@/site/Site";

type Phase = "unknown" | "before" | "open" | "closed" | "results";

/** Seconds since 1970 (the settings' format) to a time, or null. */
const timeOf = (s?: string) => (s && Number(s) > 0 ? Number(s) * 1000 : null);

/** Days, hours, minutes and seconds until `ms`. */
function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { n: Math.floor(s / 86400), unit: "days" },
    { n: Math.floor((s % 86400) / 3600), unit: "hours" },
    { n: Math.floor((s % 3600) / 60), unit: "minutes" },
    { n: s % 60, unit: "seconds" },
  ];
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

/**
 * The front page's panel: how long until voting opens (the start time in
 * Settings), then that voting is open and for how long, then that it's closed.
 * It moves on by itself at the start, with a cheer.
 */
export function Countdown({
  config,
  onArchive,
  onVote,
  onResults,
}: {
  config: SiteConfig | null;
  onArchive: (e: React.MouseEvent) => void;
  onVote: (e: React.MouseEvent) => void;
  onResults: (e: React.MouseEvent) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const box = useRef<HTMLDivElement>(null);
  const [bursts, fire] = useBursts();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = timeOf(config?.startTime);
  const end = timeOf(config?.endTime);
  const year = config?.awardYear;
  const phase: Phase =
    config?.viewingMode === "reviewing"
      ? "results"
      : !config || !start
        ? "unknown"
        : now < start
          ? "before"
          : end && now >= end
            ? "closed"
            : "open";

  // A cheer when the countdown runs out with the page open.
  const last = useRef<Phase | null>(null);
  useEffect(() => {
    if (last.current === "before" && phase === "open" && box.current) {
      const w = box.current.clientWidth;
      fire("CHEERSTINY", w / 2 - 60, 120, 10);
      setTimeout(() => fire("Klappa", w / 2 + 40, 120, 8), 250);
    }
    last.current = phase;
  }, [phase, fire]);

  return (
    <Sketch pad={5} radius={26} strokeWidth={3} boil roughness={1.5}>
      <div ref={box} className="relative space-y-6 overflow-hidden rounded-[24px] px-6 py-10 text-center sm:px-10" style={{ background: "var(--panel)" }}>
        {bursts}
        <h1 className="text-4xl font-black sm:text-5xl">The DGG Awards{year ? ` ${year}` : ""}</h1>

        {config === null && <p className="font-semibold">Loading…</p>}

        {config && phase === "unknown" && (
          <p className="flex items-center justify-center gap-3 text-xl font-bold">
            <Emote name="PepoG" size={1.1} title="" /> Voting dates are coming soon.
          </p>
        )}

        {phase === "before" && start && (
          <div className="space-y-4">
            <p className="text-xl font-bold">Voting opens in</p>
            <Clock ms={start - now} />
            <p className="font-semibold" style={{ color: "var(--muted)" }}>
              {when(start)}
            </p>
          </div>
        )}

        {phase === "open" && (
          <div className="space-y-4">
            <p className="flex items-center justify-center gap-3 text-2xl font-black">
              <Emote name="CHEERSTINY" size={1.1} title="" /> Voting is open!
            </p>
            <a className="cozy-btn primary text-lg" href="/vote" onClick={onVote}>
              Vote now
            </a>
            {end && (
              <div className="space-y-2 pt-2">
                <p className="font-bold">Voting closes in</p>
                <Clock ms={end - now} small />
              </div>
            )}
          </div>
        )}

        {phase === "results" && (
          <div className="space-y-4">
            <p className="flex items-center justify-center gap-3 text-2xl font-black">
              <Emote name="CHEERSTINY" size={1.1} title="" /> The winners are in!
            </p>
            <a className="cozy-btn primary text-lg" href="/results" onClick={onResults}>
              See the results
            </a>
          </div>
        )}

        {phase === "closed" && (
          <p className="flex items-center justify-center gap-3 text-xl font-bold">
            <Emote name="Klappa" size={1.1} title="" /> Voting has closed. The winners are revealed on stream.
          </p>
        )}

        <div className="pt-2">
          <a href="/2025" onClick={onArchive} className={`cozy-btn ${phase === "open" || phase === "results" ? "" : "primary"}`}>
            {phase === "open" || phase === "results" ? "Last year's results" : "Meanwhile, check out last year's results →"}
          </a>
        </div>
      </div>
    </Sketch>
  );
}

/** The countdown digits, in handwriting, a box per unit. */
function Clock({ ms, small = false }: { ms: number; small?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-3" role="timer" aria-live="off">
      {split(ms).map(({ n, unit }) => (
        <div
          key={unit}
          className={`rounded-2xl border-2 ${small ? "w-20 py-2" : "w-24 py-3 sm:w-28"}`}
          style={{ background: "var(--cream)", borderColor: "var(--panel-border)", boxShadow: "0 4px 0 var(--cream-shadow)" }}
        >
          <div className={`hand font-bold tabular-nums ${small ? "text-3xl" : "text-5xl"}`}>{String(n).padStart(2, "0")}</div>
          <div className="text-xs font-bold" style={{ color: "var(--muted)" }}>
            {unit}
          </div>
        </div>
      ))}
    </div>
  );
}
