import { type ReactNode, useEffect, useRef, useState } from "react";
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

/** The page for an address. `/vote?preview=results` (the admin page's old link) is the results. */
function pageOf(loc: Location): Page {
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  if (path === "/vote" && new URLSearchParams(loc.search).get("preview") === "results") return "results";
  return (Object.entries(paths).find(([, p]) => p === path)?.[0] as Page | undefined) ?? "home";
}

/**
 * The whole public site, in the approved look: the front page (countdown),
 * voting, this year's results, last year's results, and the lab (admins'
 * experiments, built from the same pieces). One page: switching doesn't
 * reload, so the music keeps playing, and pages slide like the lab's tabs.
 */
export function Site() {
  const [page, setPage] = useState<Page>(() => pageOf(location));
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
    const back = () => setPage(pageOf(location));
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

  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const go = (next: Page) => (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab etc.
    e?.preventDefault();
    if (next === page) return;
    history.pushState(null, "", paths[next]);
    setLeaving({ page, dir: order.indexOf(next) > order.indexOf(page) ? 1 : -1 });
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setLeaving(null), 400);
    setPage(next);
    scrollTo({ top: 0 });
  };
  const showLab = (v: LabView) => {
    setLabView(v);
    history.replaceState(null, "", `/lab#${v}`);
  };
  const toggleChat = () => {
    setChatOpen(!chatOpen);
    try {
      localStorage.setItem("lab.chat", chatOpen ? "off" : "on");
    } catch {}
  };

  const admin = !!me?.admin;
  const mode = config?.viewingMode;
  // Tabs as visitors see them: Vote while voting, Results once they're out
  // (and the page being previewed, for an admin on a ?preview address), and
  // the lab for admins.
  const tabs: { page: Page; label: string }[] = [
    { page: "home", label: "Home" },
    ...(mode === "voting" || page === "vote" ? [{ page: "vote" as Page, label: "Vote" }] : []),
    ...(mode === "reviewing" || page === "results" ? [{ page: "results" as Page, label: "Results" }] : []),
    { page: "2025", label: "2025 results" },
    ...(admin ? [{ page: "lab" as Page, label: "Lab" }] : []),
  ];

  const render = (p: Page): ReactNode => {
    if (p === "lab") {
      return me === undefined ? null : <LabPage admin={admin} view={labView} chatOpen={chatOpen} />;
    }
    return (
      <>
        {p === "home" && (
          <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
            <Countdown config={config} onArchive={go("2025")} onVote={go("vote")} onResults={go("results")} />
          </main>
        )}
        {p === "vote" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <VotePage me={me} config={config} onHome={go("home")} />
          </main>
        )}
        {p === "results" && (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <ResultsPage me={me} config={config} onHome={go("home")} />
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
            href="/"
            onClick={go("home")}
            className="cozy-logo rounded-xl border-2 px-4 py-1 text-lg font-black tracking-widest uppercase"
            style={{ background: "var(--cream)", borderColor: "var(--panel-border)", color: "var(--text)", boxShadow: "0 3px 0 rgb(0 0 0 / 0.15)" }}
          >
            DGG Awards
          </a>
          <nav aria-label="Pages" className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <a key={t.page} href={paths[t.page]} onClick={go(t.page)} className="cozy-tab" aria-current={page === t.page ? "page" : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {page === "lab" && admin && labView === "stage" && (
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
        {/* The lab's own tabs: its experiments. */}
        {page === "lab" && admin && (
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
              {render(p)}
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
