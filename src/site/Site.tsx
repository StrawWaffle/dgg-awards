import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Round, firstOpening, roundNow } from "@/lib/rounds";
import { ChatBubbleIcon } from "@radix-ui/react-icons";
import archive2025 from "@/archive/2025.json";
import { EmoteBackdrop } from "@/lab/EmoteBackdrop";
import { HeaderTools } from "@/lab/HeaderTools";
import { type Stage, previewPath, stagePages, stages, votingStages } from "@/lib/previews";
import { useHoverMenu } from "@/lib/useHoverMenu";
import { Summary, loadArchive2025 } from "@/lab/Summary";
import { ChatReviewPage } from "@/site/ChatReviewPage";
import { ChatStoryPage } from "@/site/ChatStory";
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
  /** Rounds with their own dates (the DGGer wildcards and group stage), before the main vote. */
  rounds?: Round[];
  /** Every round's name in award order, dated or not (for the previews). */
  roundNames?: string[];
};
export type Me = { uid: number; name: string; admin: boolean } | null;

type Page = "home" | "2025" | "vote" | "results" | "chat" | "chat-all" | "lab";
const order: Page[] = ["home", "vote", "results", "chat", "chat-all", "2025", "lab"];
const paths: Record<Page, string> = {
  home: "/",
  "2025": "/2025",
  vote: "/vote",
  results: "/results",
  chat: "/chat",
  "chat-all": "/chat/all",
  lab: "/lab",
};

/**
 * Where an address leads. Previews live under `/preview/<stage>/<page>`
 * (`/preview/<stage>` is the front page). The lab, which has no stages, is
 * `/preview/lab`. `/preview` alone previews the stage the site is in now
 * (`stage: null` until the settings are in); in the lab, that stage is where
 * the tabs lead. `/lab`, `/preview/<stage>/lab` and the old `?preview=`
 * addresses still lead to their preview.
 */
type Route = { page: Page; preview: boolean; stage: Stage | null };
function routeOf(loc: Location): Route {
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  const asked = new URLSearchParams(loc.search).get("preview");
  if (path === "/vote" && asked === "voting") return { page: "vote", preview: true, stage: "voting" };
  if ((path === "/vote" && asked === "results") || (path === "/results" && asked === "1")) return { page: "results", preview: true, stage: "results" };
  if (path === "/lab") return { page: "lab", preview: true, stage: null };
  if (path === "/preview/lab") return { page: "lab", preview: true, stage: null };
  const m = path.match(/^\/preview(?:\/([a-z]+))?(?:\/([0-9a-z-]+))?$/);
  if (m) {
    const stage = stages.find((x) => x.id === m[1])?.id ?? null;
    const page = m[2] === "home" ? "home" : (order.find((p) => p === m[2]) ?? "home");
    return { page, preview: true, stage };
  }
  return { page: (Object.entries(paths).find(([, p]) => p === path)?.[0] as Page | undefined) ?? "home", preview: false, stage: null };
}

const pathOf = (page: Page, stage: Stage | null) => (page === "lab" || stage ? previewPath(page, stage ?? "before") : paths[page]);

/** The stage the site is in now, by its settings. */
function stageNow(config: SiteConfig): Stage {
  const now = Date.now() / 1000;
  // Voting starts with the first round, if one opens before the main vote.
  const start = firstOpening(config, config.rounds ?? []) ?? 0;
  const end = Number(config.endTime) || 0;
  if (config.viewingMode === "reviewing") return "results";
  if (end && now >= end) return "closed";
  // A round open now is its own stage.
  const open = config.viewingMode === "voting" ? roundNow(config.rounds ?? [], now) : undefined;
  const at = open ? (config.roundNames ?? []).indexOf(open.name) : -1;
  if (at === 0) return "wildcards";
  if (at === 1) return "groups";
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
  // The rounds, laid out around now so the previewed one is open (or, before
  // voting, all to come; once the main vote is on, all past).
  const names = config.roundNames ?? [];
  const laidOut = (first: number): Round[] =>
    names.map((name, i) => ({ name, opensAt: first + i * 7 * DAY, closesAt: first + i * 7 * DAY + (i === 0 ? 7 : 4) * DAY }));
  switch (stage) {
    case "wildcards":
      return { ...config, viewingMode: "voting", rounds: laidOut(now - DAY), ...dates(now + 11 * DAY, now + 12 * DAY) };
    case "groups":
      return { ...config, viewingMode: "voting", rounds: laidOut(now - 8 * DAY), ...dates(now + 4 * DAY, now + 5 * DAY) };
    case "before": {
      const s = start > now ? start : now + 7 * DAY;
      // With rounds, the main vote comes after them.
      if (names.length) return { ...config, viewingMode: "locked", rounds: laidOut(s), ...dates(s + 12 * DAY, s + 13 * DAY) };
      return { ...config, viewingMode: "locked", ...dates(s, end > s ? end : s + 11 * DAY) };
    }
    case "voting": {
      const e = end > now ? end : now + 11 * DAY;
      return { ...config, viewingMode: "voting", rounds: laidOut(now - 30 * DAY), ...dates(start && start <= now ? start : now - DAY, e) };
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
  /** The big screen in full screen: no header (src/lab/Stage.tsx). Not remembered: it starts off. */
  const [stageFull, setStageFull] = useState(false);
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
    // The lab's experiment is in the hash: follow it when it changes.
    const hash = () => {
      const v = location.hash.slice(1);
      if (labViews.some((x) => x.id === v)) setLabView(v as LabView);
    };
    addEventListener("popstate", back);
    addEventListener("hashchange", hash);
    return () => {
      removeEventListener("popstate", back);
      removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    const year = config?.awardYear ? ` ${config.awardYear}` : "";
    document.title = {
      home: `DGG Awards${year}`,
      vote: `Vote | DGG Awards${year}`,
      results: `Results | DGG Awards${year}`,
      chat: `The year in chat | DGG Awards${year}`,
      "chat-all": `The year in chat, every number | DGG Awards${year}`,
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
  const go = (next: Page) => (e?: React.MouseEvent, toStage = stage) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab etc.
    e?.preventDefault();
    if (next === page && toStage === stage) return;
    history.pushState(null, "", pathOf(next, toStage));
    setLeaving({ page, dir: order.indexOf(next) > order.indexOf(page) ? 1 : -1 });
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setLeaving(null), 400);
    setRoute({ ...route, page: next, stage: toStage });
    scrollTo({ top: 0 });
  };
  /** Another stage, on the same page; from the lab (which has none), its front page. */
  const goStage = (next: Stage) => {
    if (page === "lab") return go("home")(undefined, next);
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
  // The lab isn't a tab: it's in the logo's preview menu, and has its own row.
  const tabs: { page: Page; label: string }[] = [
    { page: "home", label: "Home" },
    ...(mode === "voting" || page === "vote" ? [{ page: "vote" as Page, label: "Vote" }] : []),
    ...(mode === "reviewing" || page === "results" ? [{ page: "results" as Page, label: "Results" }] : []),
    ...(mode === "reviewing" || page === "chat" || page === "chat-all" ? [{ page: "chat" as Page, label: "Year in chat" }] : []),
    { page: "2025", label: "2025 results" },
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
      return me === undefined ? null : <LabPage admin={admin} view={labView} chatOpen={chatOpen} onChat={toggleChat} full={stageFull} onFull={setStageFull} onView={showLab} />;
    }
    return (
      <>
        {p === "home" && (
          <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
            <Countdown config={shown} onArchive={go("2025")} onVote={go("vote")} onResults={go("results")} onChat={go("chat")} />
          </main>
        )}
        {p === "vote" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <VotePage
              me={me}
              config={shown}
              preview={previewing && !!stage && stage in votingStages}
              previewStage={previewing ? stage : null}
              onHome={go("home")}
              onResults={go("results")}
            />
          </main>
        )}
        {p === "results" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <ResultsPage me={me} config={shown} preview={previewing && stage === "results"} onHome={go("home")} />
          </main>
        )}
        {p === "chat" && (
          // The story fills the window under the header, one screen at a time.
          <ChatStoryPage
            me={me}
            config={shown}
            preview={previewing && stage === "results"}
            onHome={go("home")}
            allHref={pathOf("chat-all", stage)}
            onAll={go("chat-all")}
          />
        )}
        {p === "chat-all" && (
          <main className="mx-auto max-w-6xl px-4 py-6">
            <ChatReviewPage
              me={me}
              config={shown}
              preview={previewing && stage === "results"}
              onHome={go("home")}
              storyHref={pathOf("chat", stage)}
              onStory={go("chat")}
            />
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

  // In a preview, the logo opens a menu of every preview page.
  const jumpMenu = useHoverMenu();
  const pointer = useRef("mouse");
  const jump = (to: Page, toStage: Stage | null) => (e: React.MouseEvent) => {
    go(to)(e, toStage);
    jumpMenu.setOpen(false);
  };

  return (
    <>
      <EmoteBackdrop />
      <header
        ref={header}
        className={`sticky top-0 z-30 px-4 py-2.5 ${stageFull && page === "lab" && labView === "stage" ? "hidden" : ""}`}
        style={{ background: "var(--header)" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div ref={jumpMenu.box} className="relative" {...(previewing ? jumpMenu.hover : {})}>
            <a
              href={pathOf("home", stage)}
              onPointerDown={(e) => (pointer.current = e.pointerType)}
              onClick={(e) => {
                // On touch, the first tap opens the menu instead.
                if (previewing && !jumpMenu.open && pointer.current !== "mouse") {
                  e.preventDefault();
                  jumpMenu.setOpen(true);
                  return;
                }
                jump("home", stage)(e);
              }}
              className="cozy-logo block rounded-xl border-2 px-4 py-1 text-lg font-black tracking-widest uppercase"
              style={{ background: "var(--cream)", borderColor: "var(--panel-border)", color: "var(--text)", boxShadow: "0 3px 0 rgb(0 0 0 / 0.15)" }}
              aria-haspopup={previewing ? "menu" : undefined}
              aria-expanded={previewing ? jumpMenu.open : undefined}
            >
              DGG Awards
            </a>
            {previewing && jumpMenu.open && (
              <div role="menu" aria-label="Preview pages" className="cozy-panel absolute top-full left-0 z-40 mt-2 w-[min(44rem,calc(100vw-2rem))] p-4">
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
                  {stages.map((x) => (
                    <div key={x.id}>
                      <p className="px-2 pb-1 text-sm font-black">{x.label}</p>
                      <ul className="space-y-0.5">
                        {stagePages.map((p) => {
                          const here = page === p.page && stage === x.id;
                          return (
                            <li key={p.page}>
                              <a
                                role="menuitem"
                                href={previewPath(p.page, x.id)}
                                onClick={jump(p.page, x.id)}
                                className="cozy-row block rounded-xl px-2 py-1 text-sm font-bold"
                                style={here ? { background: "var(--highlight)" } : undefined}
                                aria-current={here ? "page" : undefined}
                              >
                                {p.label}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1 border-t-2 pt-3 text-sm font-bold" style={{ borderColor: "var(--panel-border)" }}>
                  <a
                    role="menuitem"
                    href="/preview/lab"
                    onClick={jump("lab", stage)}
                    className="cozy-row rounded-xl px-2 py-1"
                    style={page === "lab" ? { background: "var(--highlight)" } : undefined}
                    aria-current={page === "lab" ? "page" : undefined}
                  >
                    Lab
                  </a>
                  <a role="menuitem" href="/admin" className="cozy-row rounded-xl px-2 py-1">
                    Admin page
                  </a>
                  <a
                    role="menuitem"
                    href={paths[page === "lab" ? "home" : page]}
                    onClick={(e) => {
                      leavePreview(e);
                      jumpMenu.setOpen(false);
                    }}
                    className="cozy-row ml-auto rounded-xl px-2 py-1"
                  >
                    Leave preview
                  </a>
                </div>
              </div>
            )}
          </div>
          <nav aria-label="Pages" className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <a
                key={t.page}
                href={pathOf(t.page, stage)}
                onClick={go(t.page)}
                className="cozy-tab"
                aria-current={page === t.page || (t.page === "chat" && page === "chat-all") ? "page" : undefined}
              >
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
                href={pathOf(page === "lab" ? "home" : page, x.id)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  goStage(x.id);
                }}
                className="cozy-tab text-sm"
                aria-current={page !== "lab" && stage === x.id ? "page" : undefined}
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
            {/* An experiment's own tools go here (the big screen's Settings). */}
            <span id="lab-tools" className="ml-auto flex items-center gap-2" />
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
