import { useEffect, useState } from "react";
import { DesktopIcon, MoonIcon, Pencil1Icon, SunIcon } from "@radix-ui/react-icons";
import { Emote } from "@/lab/Emote";
import { EmoteBackdrop } from "@/lab/EmoteBackdrop";
import { MusicBar } from "@/lab/MusicBar";
import { useSourceChoice, useStartOnFirstGesture } from "@/lab/music";
import { Stage } from "@/lab/Stage";
import { type Theme, useLabTheme } from "@/lab/theme";
import { Visualizer } from "@/lab/Visualizer";
import { Results } from "@/lab/Results";
import { setDrawnLook, useDrawnLook } from "@/lab/sketch";
import { VoteDemo } from "@/lab/VoteDemo";

const views = [
  { id: "voting", label: "Voting" },
  { id: "stage", label: "Big screen" },
  { id: "results", label: "Results" },
  { id: "sound", label: "Sound check" },
] as const;
type View = (typeof views)[number]["id"];

const themeCycle: Record<Theme, { next: Theme; icon: React.ReactNode; label: string }> = {
  system: { next: "light", icon: <DesktopIcon />, label: "Theme: system" },
  light: { next: "dark", icon: <SunIcon />, label: "Theme: light" },
  dark: { next: "system", icon: <MoonIcon />, label: "Theme: dark" },
};

/**
 * The lab: a cozier voting page and presentation, tried out here before they
 * go anywhere real. Admins only for now.
 */
export function Lab() {
  const [me, setMe] = useState<{ admin: boolean } | null | undefined>(undefined);
  const [emotes, setEmotes] = useState<string[]>([]);
  const [source, setSource] = useSourceChoice();
  const [view, setView] = useState<View>(() => {
    const hash = location.hash.slice(1);
    return views.some((v) => v.id === hash) ? (hash as View) : "voting";
  });
  const { theme, setTheme } = useLabTheme();
  const drawn = useDrawnLook();
  useStartOnFirstGesture();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  useEffect(() => {
    if (!me?.admin) return;
    fetch("/api/lab/emotes")
      .then((r) => r.json())
      .then(setEmotes)
      .catch(() => setEmotes([]));
  }, [me]);

  const show = (next: View) => {
    setView(next);
    history.replaceState(null, "", `#${next}`);
  };
  const cycle = themeCycle[theme];

  return (
    <>
      <EmoteBackdrop />
      <header
        className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
        style={{ background: "var(--header)" }}
      >
        <a
          href="/"
          className="rounded-xl border-2 px-4 py-1 text-lg font-black tracking-widest uppercase"
          style={{ background: "var(--cream)", borderColor: "var(--panel-border)", color: "var(--text)", boxShadow: "0 3px 0 rgb(0 0 0 / 0.15)" }}
        >
          DGG Awards
        </a>
        {me?.admin && (
          <nav role="tablist" aria-label="Lab pages" className="flex flex-wrap gap-1">
            {views.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className="cozy-tab" onClick={() => show(v.id)}>
                {v.label}
              </button>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          <MusicBar />
          <button
            type="button"
            className={`cozy-btn round h-10 w-10 ${drawn ? "primary" : ""}`}
            onClick={() => setDrawnLook(!drawn)}
            aria-pressed={drawn}
            aria-label="Drawn look"
            title={drawn ? "Drawn look on: hand-drawn frames, bars and notes" : "Drawn look off: plain cozy panels"}
          >
            <Pencil1Icon />
          </button>
          <button
            type="button"
            className="cozy-btn round h-10 w-10"
            onClick={() => setTheme(cycle.next)}
            aria-label={`${cycle.label}. Click for ${cycle.next}.`}
            title={`${cycle.label}. Click for ${cycle.next}.`}
          >
            {cycle.icon}
          </button>
        </div>
      </header>

      {me === undefined && <p className="p-6">Loading…</p>}
      {me !== undefined && !me?.admin && (
        <main className="mx-auto mt-16 max-w-md px-4">
          <div className="cozy-panel space-y-4 p-8 text-center">
            <Emote name="PepoG" size={2} />
            <p className="font-bold">The lab is for admins while we try things out.</p>
            <a className="cozy-btn primary" href="/signin">
              Sign in
            </a>
          </div>
        </main>
      )}

      {me?.admin && (
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
          {view === "voting" && <VoteDemo />}
          {view === "stage" && <Stage source={source} emotes={emotes} />}
          {view === "results" && <Results />}
          {view === "sound" && <Visualizer source={source} setSource={setSource} />}
          <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
            The lab: ideas being tried out, separate from the real site. Look inspired by a community destiny.gg skin.
            Music:{" "}
            <a
              className="underline"
              href="https://soundcloud.com/tinyghoststudios/black-lover-instrumental-only"
              target="_blank"
              rel="noopener noreferrer"
            >
              black lover (instrumental) by Tiny Ghost Studios
            </a>
            .
          </p>
        </main>
      )}
    </>
  );
}
