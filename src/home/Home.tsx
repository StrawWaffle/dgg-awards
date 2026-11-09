import { useEffect, useRef, useState } from "react";
import { useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { EmoteBackdrop } from "@/lab/EmoteBackdrop";
import { HeaderTools } from "@/lab/HeaderTools";
import { Sketch, useDrawnLook } from "@/lab/sketch";
import { Summary, loadArchive2025 } from "@/lab/Summary";
import archive2025 from "@/archive/2025.json";

type Page = "home" | "2025";
const pageOf = (path: string): Page => (path.replace(/\/+$/, "") === "/2025" ? "2025" : "home");
const pathOf = (page: Page) => (page === "2025" ? "/2025" : "/");

/** Where voters go once voting opens. The old page, until the new voting page replaces it. */
const VOTE_PATH = "/vote";

type Config = { startTime?: string; endTime?: string; awardYear?: string };

/**
 * The public site, in the lab's look: the front page (a countdown to when
 * voting opens, set in the admin Settings) and last year's results.
 * Switching pages doesn't reload, so the music keeps playing.
 */
export function Home() {
  const [page, setPage] = useState<Page>(() => pageOf(location.pathname));
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({}));
    const back = () => setPage(pageOf(location.pathname));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    document.title = page === "2025" ? "2025 results | DGG Awards" : "DGG Awards";
  }, [page]);

  const go = (next: Page) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab etc.
    e.preventDefault();
    if (next !== page) history.pushState(null, "", pathOf(next));
    setPage(next);
    scrollTo({ top: 0 });
  };

  return (
    <>
      <EmoteBackdrop />
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5" style={{ background: "var(--header)" }}>
        <a
          href="/"
          onClick={go("home")}
          className="cozy-logo rounded-xl border-2 px-4 py-1 text-lg font-black tracking-widest uppercase"
          style={{ background: "var(--cream)", borderColor: "var(--panel-border)", color: "var(--text)", boxShadow: "0 3px 0 rgb(0 0 0 / 0.15)" }}
        >
          DGG Awards
        </a>
        <nav aria-label="Pages" className="flex flex-wrap gap-1">
          <a href="/" onClick={go("home")} className="cozy-tab" aria-current={page === "home" ? "page" : undefined}>
            Home
          </a>
          <a href="/2025" onClick={go("2025")} className="cozy-tab" aria-current={page === "2025" ? "page" : undefined}>
            2025 results
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <HeaderTools />
        </div>
      </header>

      {page === "home" ? (
        <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
          <Countdown config={config} onArchive={go("2025")} />
        </main>
      ) : (
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
          <Summary
            load={loadArchive2025}
            title="The 2025 results"
            footer={
              <>
                From the{" "}
                <a className="underline" href={archive2025.sourceUrl} target="_blank" rel="noopener noreferrer">
                  destiny.gg wiki
                </a>
                : percentages only, as no vote counts were published. The{" "}
                <a className="underline" href={archive2025.stream} target="_blank" rel="noopener noreferrer">
                  2025 stream
                </a>{" "}
                has the reveals.
              </>
            }
          />
        </main>
      )}
      <p className="pb-6 text-center text-xs" style={{ color: "var(--muted)" }}>
        Music:{" "}
        <a className="underline" href="https://soundcloud.com/tinyghoststudios/black-lover-instrumental-only" target="_blank" rel="noopener noreferrer">
          black lover (instrumental) by Tiny Ghost Studios
        </a>
        . Look inspired by a community destiny.gg skin.
      </p>
    </>
  );
}

type Phase = "unknown" | "before" | "open" | "closed";

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
function Countdown({ config, onArchive }: { config: Config | null; onArchive: (e: React.MouseEvent) => void }) {
  const [now, setNow] = useState(Date.now());
  const drawn = useDrawnLook();
  const box = useRef<HTMLDivElement>(null);
  const [bursts, fire] = useBursts();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = timeOf(config?.startTime);
  const end = timeOf(config?.endTime);
  const year = config?.awardYear;
  const phase: Phase = !config || !start ? "unknown" : now < start ? "before" : end && now >= end ? "closed" : "open";

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
      <div ref={box} className={`${drawn ? "rounded-[24px]" : "cozy-panel"} relative space-y-6 overflow-hidden px-6 py-10 text-center sm:px-10`} style={drawn ? { background: "var(--panel)" } : undefined}>
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
            <a className="cozy-btn primary text-lg" href={VOTE_PATH}>
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

        {phase === "closed" && (
          <p className="flex items-center justify-center gap-3 text-xl font-bold">
            <Emote name="Klappa" size={1.1} title="" /> Voting has closed. The winners are revealed on stream.
          </p>
        )}

        <div className="pt-2">
          <a href="/2025" onClick={onArchive} className={`cozy-btn ${phase === "open" ? "" : "primary"}`}>
            {phase === "open" ? "Last year's results" : "Meanwhile, check out last year's results →"}
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
