import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChatBubbleIcon } from "@radix-ui/react-icons";
import archive2025 from "@/archive/2025.json";
import { EmoteBackdrop } from "@/lab/EmoteBackdrop";
import { HeaderTools } from "@/lab/HeaderTools";
import { Summary, loadArchive2025 } from "@/lab/Summary";
import { Countdown } from "@/site/Countdown";
import { LabPage, type LabView, labViews } from "@/site/LabPage";
import { ResultsPage } from "@/site/ResultsPage";
import { UserMenu } from "@/site/UserMenu";
import { VotePage } from "@/site/VotePage";

/** The settings the public pages read (`/api/config`). */
export type SiteConfig = {
  startTime?: string;
  endTime?: string;
  viewingMode?: "idle" | "locked" | "voting" | "reviewing";
  awardYear?: string;
};
export type Me = { uid: number; name: string; admin: boolean } | null;

type Page = "home" | "2025" | "vote" | "results" | "lab";
const order: Page[] = ["home", "vote", "results", "2025", "lab"];
const paths: Record<Page, string> = { home: "/", "2025": "/2025", vote: "/vote", results: "/results", lab: "/lab" };

/** The site's stages through the year, which admins can preview. */
export type Stage = "before" | "voting" | "closed" | "results";
export const stages: { id: Stage; label: string }[] = [
  { id: "before", label: "Before voting" },
  { id: "voting", label: "Voting open" },
  { id: "closed", label: "Voting closed" },
  { id: "results", label: "Results out" },
];

/**
 * Where an address leads. Previews live under `/preview/<stage>/<page>`
 * (`/preview/<stage>` is the front page). `/preview` and `/lab` alone preview
 * the stage the site is in now (`stage: null` until the settings are in).
 * The old `?preview=` addresses still lead to their preview.
 */
type Route = { page: Page; preview: boolean; stage: Stage | null };
function routeOf(loc: Location): Route {
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  const asked = new URLSearchParams(loc.search).get("preview");
  if (path === "/vote" && asked === "voting") return { page: "vote", preview: true, stage: "voting" };
  if ((path === "/vote" && asked === "results") || (path === "/results" && asked === "1")) return { page: "results", preview: true, stage: "results" };
  if (path === "/lab") return { page: "lab", preview: true, stage: null };
  const m = path.match(/^\/preview(?:\/([a-z]+))?(?:\/([0-9a-z]+))?$/);
  if (m) {
    const stage = stages.find((x) => x.id === m[1])?.id ?? null;
    const page = m[2] === "home" ? "home" : (order.find((p) => p === m[2]) ?? "home");
    return { page, preview: true, stage };
  }
  return { page: (Object.entries(paths).find(([, p]) => p === path)?.[0] as Page | undefined) ?? "home", preview: false, stage: null };
}

const pathOf = (page: Page, stage: Stage | null) =>
  stage ? `/preview/${stage}${page === "home" ? "" : `/${page}`}` : paths[page];

/** The stage the site is in now, by its settings. */
function stageNow(config: SiteConfig): Stage {
  const now = Date.now() / 1000;
  const start = Number(config.startTime) || 0;
  const end = Number(config.endTime) || 0;
  if (config.viewingMode === "reviewing") return "results";
  if (end && now >= end) return "closed";
  if (config.viewingMode === "voting" && start && now >= start) return "voting";
  return "before";
}

/**
 * The settings as visitors would have them at a stage. The real dates are
 * kept where they fit the stage; otherwise made-up ones that do.
 */
function stageConfig(config: SiteConfig, stage: Stage): SiteConfig {
  const DAY = 86400;
  const now = Math.floor(Date.now() / 1000);
  const start = Number(config.startTime) || 0;
  const end = Number(config.endTime) || 0;
  const dates = (s: number, e: number) => ({ startTime: String(s), endTime: String(e) });
  switch (stage) {
    case "before": {
      const s = start > now ? start : now + 7 * DAY;
      return { ...config, viewingMode: "locked", ...dates(s, end > s ? end : s + 11 * DAY) };
    }
    case "voting": {
      const e = end > now ? end : now + 11 * DAY;
      return { ...config, viewingMode: "voting", ...dates(start && start <= now ? start : now - DAY, e) };
    }
    case "closed": {
      const e = end && end < now ? end : now - 3600;
      return { ...config, viewingMode: "idle", ...dates(start && start < e ? start : e - 11 * DAY, e) };
    }
    case "results":
      return { ...config, viewingMode: "reviewing" };
  }
}

/**
 * The whole public site, in the approved look: the front page (countdown),
 * voting, this year's results, last year's results, and the lab (admins'
 * experiments, built from the same pieces). One page: switching doesn't
 * reload, so the music keeps playing, and pages slide like the lab's tabs.
 */
export function Site() {
  const [route, setRoute] = useState<Route>(() => routeOf(location));
  const { page, preview } = route;
  const [leaving, setLeaving] = useState<{ page: Page; dir: number } | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [labView, setLabView] = useState<LabView>(() => {
    const hash = location.hash.slice(1);
    return labViews.some((v) => v.id === hash) ? (hash as LabView) : "stage";
  });
  const [chatOpen, setChatOpen] = useState(() => {
    try {
      return localStorage.getItem("lab.chat") !== "off";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({}));
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
    const back = () => setRoute(routeOf(location));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    const year = config?.awardYear ? ` ${config.awardYear}` : "";
    document.title = {
      home: `DGG Awards${year}`,
      vote: `Vote | DGG Awards${year}`,
      results: `Results | DGG Awards${year}`,
      "2025": "2025 results | DGG Awards",
      lab: "Lab | DGG Awards",
    }[page];
  }, [page, config]);

  // The header's height, for the big screen to fill the rest of the window.
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty("--lab-header", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A preview without a stage previews the one the site is in now. Only
  // admins get one; everyone else's links stay on the real pages.
  const stage = preview && me?.admin ? (route.stage ?? (config ? stageNow(config) : null)) : null;
  // Put the full preview address in the bar (also for `/lab` and the old
  // `?preview=` addresses).
  useEffect(() => {
    if (!stage) return;
    const path = pathOf(page, stage);
    if (location.pathname !== path || location.search) history.replaceState(null, "", path + location.hash);
    if (route.stage !== stage) setRoute({ page, preview, stage });
  }, [stage, page, preview, route.stage]);
  // What the pages see: the real settings, or the previewed stage's.
  const shown = useMemo(() => (config && stage ? stageConfig(config, stage) : config), [config, stage]);

  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const go = (next: Page) => (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab etc.
    e?.preventDefault();
    if (next === page) return;
    history.pushState(null, "", pathOf(next, stage));
    setLeaving({ page, dir: order.indexOf(next) > order.indexOf(page) ? 1 : -1 });
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setLeaving(null), 400);
    setRoute({ ...route, page: next, stage });
    scrollTo({ top: 0 });
  };
  const goStage = (next: Stage) => {
    if (next === stage) return;
    history.pushState(null, "", pathOf(page, next) + location.hash);
    setRoute({ page, preview: true, stage: next });
  };
  const showLab = (v: LabView) => {
    setLabView(v);
    history.replaceState(null, "", `${pathOf("lab", stage)}#${v}`);
  };
  /** Out of the preview, to the same page as visitors have it (the lab has no such page). */
  const leavePreview = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const next = page === "lab" ? "home" : page;
    history.pushState(null, "", paths[next]);
    setRoute({ page: next, preview: false, stage: null });
    scrollTo({ top: 0 });
  };
  const toggleChat = () => {
    setChatOpen(!chatOpen);
    try {
      localStorage.setItem("lab.chat", chatOpen ? "off" : "on");
    } catch {}
  };

  const admin = !!me?.admin;
  const previewing = preview && admin;
  const mode = shown?.viewingMode;
  // Tabs as visitors see them (at the previewed stage, in a preview): Vote
  // while voting, Results once they're out, and the page being looked at.
  // The lab only in a preview.
  const tabs: { page: Page; label: string }[] = [
    { page: "home", label: "Home" },
    ...(mode === "voting" || page === "vote" ? [{ page: "vote" as Page, label: "Vote" }] : []),
    ...(mode === "reviewing" || page === "results" ? [{ page: "results" as Page, label: "Results" }] : []),
    { page: "2025", label: "2025 results" },
    ...(previewing ? [{ page: "lab" as Page, label: "Lab" }] : []),
  ];

  const render = (p: Page): ReactNode => {
    if (preview && !admin) {
      return me === undefined ? null : (
        <main className="mx-auto mt-16 max-w-md px-4">
          <div className="cozy-panel space-y-4 p-8 text-center">
            <p className="font-bold">Previews are for admins.</p>
            {me ? (
              <a className="cozy-btn primary" href="/" onClick={leavePreview}>
                Go to the front page
              </a>
            ) : (
              <a className="cozy-btn primary" href={`/signin?next=${encodeURIComponent(location.pathname)}`}>
                Sign in
              </a>
            )}
          </div>
        </main>
      );
    }
    if (p === "lab") {
      return me === undefined ? null : <LabPage admin={admin} view={labView} chatOpen={chatOpen} />;
    }
    return (
      <>
        {p === "home" && (
          <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
            <Countdown config={shown} onArchive={go("2025")} onVote={go("vote")} onResults={go("results")} />
          </main>
        )}
        {p === "vote" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <VotePage me={me} config={shown} preview={previewing && stage === "voting"} onHome={go("home")} onResults={go("results")} />
          </main>
        )}
        {p === "results" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <ResultsPage me={me} config={shown} preview={previewing && stage === "results"} onHome={go("home")} />
          </main>
        )}
        {p === "2025" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
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
  };

  return (
    <>
      <EmoteBackdrop />
      <header ref={header} className="sticky top-0 z-30 px-4 py-2.5" style={{ background: "var(--header)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={pathOf("home", stage)}
            onClick={go("home")}
            className="cozy-logo rounded-xl border-2 px-4 py-1 text-lg font-black tracking-widest uppercase"
            style={{ background: "var(--cream)", borderColor: "var(--panel-border)", color: "var(--text)", boxShadow: "0 3px 0 rgb(0 0 0 / 0.15)" }}
          >
            DGG Awards
          </a>
          <nav aria-label="Pages" className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <a key={t.page} href={pathOf(t.page, stage)} onClick={go(t.page)} className="cozy-tab" aria-current={page === t.page ? "page" : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {page === "lab" && previewing && labView === "stage" && (
              <button
                type="button"
                className={`cozy-btn round h-10 w-10 ${chatOpen ? "primary" : ""}`}
                onClick={toggleChat}
                aria-pressed={chatOpen}
                aria-label="Chat column"
                title={chatOpen ? "Hide the chat column" : "Show the chat column"}
              >
                <ChatBubbleIcon />
              </button>
            )}
            <HeaderTools />
            <UserMenu me={me} />
          </div>
        </div>
        {/* In a preview: which stage of the year, and the way out. */}
        {previewing && (
          <nav aria-label="Preview" className="mt-2 flex flex-wrap items-center gap-1">
            <span className="cozy-chip coral mr-2">Preview</span>
            {stages.map((x) => (
              <a
                key={x.id}
                href={pathOf(page, x.id)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  goStage(x.id);
                }}
                className="cozy-tab text-sm"
                aria-current={stage === x.id ? "page" : undefined}
              >
                {x.label}
              </a>
            ))}
            <a className="cozy-tab ml-auto text-sm" href={paths[page === "lab" ? "home" : page]} onClick={leavePreview}>
              Leave preview
            </a>
          </nav>
        )}
        {/* The lab's own tabs: its experiments. */}
        {page === "lab" && previewing && (
          <nav aria-label="Lab experiments" className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-2 text-sm font-bold" style={{ color: "var(--header-text)" }}>
              Lab:
            </span>
            {labViews.map((v) => (
              <button key={v.id} type="button" className="cozy-tab text-sm" aria-selected={labView === v.id} onClick={() => showLab(v.id)}>
                {v.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Pages slide sideways; the old one stays a moment to slide out. */}
      <div className="relative overflow-x-clip" style={{ "--dir": leaving?.dir ?? 1 } as React.CSSProperties}>
        {order.map((p) =>
          p === page ? (
            <div key={p} className={leaving ? "lab-page-in" : ""}>
              <Fragment key={stage ?? "live"}>{render(p)}</Fragment>
            </div>
          ) : leaving?.page === p ? (
            <div key={p} className="lab-page-out pointer-events-none absolute inset-x-0 top-0" aria-hidden>
              {render(p)}
            </div>
          ) : null,
        )}
      </div>
    </>
  );
}
