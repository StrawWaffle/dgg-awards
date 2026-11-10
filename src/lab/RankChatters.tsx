import { useEffect, useMemo, useState } from "react";
import { Emote } from "@/lab/Emote";
import { type Choice, type Ranking, type RankState, choose, currentBatch, mostLeft, rankBatch, start } from "@/lab/rank";

/** A wildcard chatter: the DGGer nominee, its name without the list number. */
type Chatter = { id: string; name: string; emote: string | null; image: string | null };
type Profile = {
  name: string;
  url: string;
  photoUrl: string | null;
  tier: string | null;
  team: string | null;
  memberSince: string | null;
  bio: string | null;
  signatureSvg: string | null;
};
/** What's saved: the order dealt, and every answer, replayed to get back to where you were. */
type Saved = { order: string[]; steps: (Ranking | Choice)[] };

const KEY = "lab.rank.wildcards";
const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = (s: Saved | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
};
const shuffled = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
function replay({ order, steps }: Saved): RankState {
  let s = start(order);
  for (const step of steps) s = typeof step === "string" ? choose(s, step) : rankBatch(s, step);
  return s;
}

/** The wildcards from the DGGer award (their description says "Wildcards"). */
function useWildcards() {
  const [chatters, setChatters] = useState<Chatter[] | null | "missing">(null);
  useEffect(() => {
    fetch("/api/admin/nominees")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        const options: any[] = data.find((c) => c.id === "dgger")?.options ?? [];
        const list = options
          .filter((o) => /wildcard/i.test(o.description ?? ""))
          .map((o) => ({
            id: o.id,
            name: o.title.replace(/^\d+\.\s*/, "").trim(),
            emote: o.emote ?? null,
            image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
          }))
          .filter((c) => c.name);
        setChatters(list.length ? list : "missing");
      })
      .catch(() => setChatters("missing"));
  }, []);
  return chatters;
}

/** destiny.gg profiles, loaded once each, by name. */
const profiles = new Map<string, Promise<Profile | null>>();
function profileOf(name: string) {
  if (!profiles.has(name)) {
    profiles.set(
      name,
      fetch(`/api/admin/dgg-profile/${encodeURIComponent(name)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return profiles.get(name)!;
}
function useProfile(name: string) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setP(undefined);
    profileOf(name).then((x) => live && setP(x));
    return () => {
      live = false;
    };
  }, [name]);
  return p;
}

/**
 * Experiment: ranking the 67 DGGer wildcards by hand, with ties. First small
 * batches, each ranked (equal numbers tie); then the batches are merged two at
 * a time, by picking the better of two, or "equal" (src/lab/rank.ts). Ties stay
 * together from then on. Saved in this browser as you go; nothing is a vote.
 */
export function RankChatters() {
  const chatters = useWildcards();
  const [saved, setSaved] = useState<Saved | null>(load);
  const byId = useMemo(() => new Map(chatters && chatters !== "missing" ? chatters.map((c) => [c.id, c]) : []), [chatters]);

  // A saved run whose chatters changed since is started again.
  useEffect(() => {
    if (!chatters || chatters === "missing") return;
    const ids = chatters.map((c) => c.id);
    if (!saved || saved.order.length !== ids.length || !saved.order.every((id) => byId.has(id))) {
      const fresh = { order: shuffled(ids), steps: [] };
      setSaved(fresh);
      save(fresh);
    }
  }, [chatters, byId]);

  const state = useMemo(() => {
    if (!saved || !byId.size || !saved.order.every((id) => byId.has(id))) return null;
    try {
      return replay(saved);
    } catch {
      return null;
    }
  }, [saved, byId]);

  const step = (s: Ranking | Choice) => {
    const nextSaved = { ...saved!, steps: [...saved!.steps, s] };
    setSaved(nextSaved);
    save(nextSaved);
  };
  const back = () => {
    if (!saved?.steps.length) return;
    const nextSaved = { ...saved, steps: saved.steps.slice(0, -1) };
    setSaved(nextSaved);
    save(nextSaved);
  };
  const restart = () => {
    if (!chatters || chatters === "missing") return;
    if (!confirm("Start over? Your answers so far are cleared.")) return;
    const fresh = { order: shuffled(chatters.map((c) => c.id)), steps: [] };
    setSaved(fresh);
    save(fresh);
  };

  if (chatters === null) return <Shell>Loading the wildcards…</Shell>;
  if (chatters === "missing") return <Shell>No wildcards found in DGGer of the Year.</Shell>;
  if (!state) return <Shell>Loading…</Shell>;

  const left = mostLeft(state);
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="cozy-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <h1 className="text-2xl font-black">Rank the wildcards</h1>
        <span className="cozy-chip">{chatters.length} chatters</span>
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          {state.phase === "done"
            ? `Done in ${state.asked} answers.`
            : `Answer ${state.asked + 1} · at most ${left} to go${state.phase === "batches" ? " (fewer with ties)" : ""}`}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="cozy-btn" onClick={back} disabled={!saved?.steps.length}>
            Back
          </button>
          <button type="button" className="cozy-btn" onClick={restart}>
            Start over
          </button>
        </span>
      </header>
      {state.phase === "batches" && <Batch key={state.ranked.length} ids={currentBatch(state)!} byId={byId} total={state.batches.length} n={state.ranked.length} onDone={step} />}
      {state.phase === "merge" && <Compare state={state} byId={byId} onChoose={step} />}
      {state.phase === "done" && <Final result={state.result} byId={byId} />}
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="cozy-panel p-8 font-semibold">{children}</div>
    </main>
  );
}

function Face({ chatter, size }: { chatter: Chatter; size: number }) {
  if (chatter.image) return <img src={chatter.image} alt="" className="h-full w-full object-cover" />;
  if (chatter.emote) return <Emote name={chatter.emote} size={size} />;
  return null;
}

/** Phase one: rank a batch of up to five. Equal numbers tie. */
function Batch({
  ids,
  byId,
  total,
  n,
  onDone,
}: {
  ids: string[];
  byId: Map<string, Chatter>;
  total: number;
  n: number;
  onDone: (r: Ranking) => void;
}) {
  const [rank, setRank] = useState<Record<string, number>>({});
  const all = ids.every((id) => rank[id]);
  const submit = () => {
    const values = [...new Set(ids.map((id) => rank[id]!))].sort((a, b) => a - b);
    onDone(values.map((v) => ids.filter((id) => rank[id] === v)));
  };
  return (
    <section className="cozy-panel space-y-4 p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-black">
          Batch {n + 1} of {total}
        </h2>
        <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          Give each a place, 1 the best. The same number for two means they're equal.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ids.map((id) => (
          <div key={id} className="space-y-2 rounded-[18px] border-2 p-2" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
            <ProfileCard chatter={byId.get(id)!} compact />
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>
                Place
              </span>
              {ids.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`cozy-btn round ${rank[id] === i + 1 ? "primary" : ""}`}
                  aria-pressed={rank[id] === i + 1}
                  onClick={() => setRank((r) => ({ ...r, [id]: i + 1 }))}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="cozy-btn primary" disabled={!all} onClick={submit}>
        {all ? "Next" : `Place all ${ids.length} to go on`}
      </button>
    </section>
  );
}

/** Phase two: which of two is better (each may be a group of equals). */
function Compare({ state, byId, onChoose }: { state: Extract<RankState, { phase: "merge" }>; byId: Map<string, Chatter>; onChoose: (c: Choice) => void }) {
  const a = state.left[0]!;
  const b = state.right[0]!;
  // Load the next profiles while this question is up.
  useEffect(() => {
    for (const g of [state.left[1], state.right[1]]) for (const id of g ?? []) profileOf(byId.get(id)!.name);
  }, [state, byId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") onChoose("left");
      else if (e.key === "ArrowRight") onChoose("right");
      else if (e.key === "ArrowDown" || e.key === "=") onChoose("tie");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onChoose]);
  const side = (g: string[], c: Choice) => (
    <button
      type="button"
      onClick={() => onChoose(c)}
      className="cozy-card block w-full space-y-2 rounded-[20px] border-2 p-2 text-left"
      style={{ background: "var(--cream)", borderColor: "var(--panel-border)", boxShadow: "0 5px 0 var(--cream-shadow)" }}
    >
      {g.length > 1 && (
        <span className="cozy-chip green ml-1">
          {g.length} ranked equal
        </span>
      )}
      {g.map((id) => (
        <ProfileCard key={id} chatter={byId.get(id)!} compact={g.length > 1} />
      ))}
    </button>
  );
  return (
    <section className="space-y-4">
      <p className="text-center text-lg font-black">Who deserves it more?</p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {side(a, "left")}
        {side(b, "right")}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="cozy-btn" onClick={() => onChoose("left")}>
          ← Left
        </button>
        <button type="button" className="cozy-btn primary" onClick={() => onChoose("tie")}>
          Equal
        </button>
        <button type="button" className="cozy-btn" onClick={() => onChoose("right")}>
          Right →
        </button>
      </div>
      <p className="text-center text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Keys: ← and → pick a side, ↓ or = for equal. Equal ones stay together from here on.
      </p>
    </section>
  );
}

/** A chatter with their destiny.gg profile card: tier, team, member since, bio, signature. */
function ProfileCard({ chatter, compact = false }: { chatter: Chatter; compact?: boolean }) {
  const p = useProfile(chatter.name);
  return (
    <div className="flex gap-3">
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] ${compact ? "h-16 w-16" : "h-28 w-28"}`}
        style={{ background: "var(--panel-border)" }}
      >
        {p?.photoUrl && !chatter.image && !chatter.emote ? (
          <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Face chatter={chatter} size={compact ? 1.4 : 2.4} />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`${compact ? "text-lg" : "text-2xl"} font-black`}>{chatter.name}</span>
          {p?.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline" onClick={(e) => e.stopPropagation()}>
              profile ↗
            </a>
          )}
        </div>
        {p === undefined && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading the profile…</p>}
        {p === null && <p className="text-sm" style={{ color: "var(--muted)" }}>No destiny.gg profile found.</p>}
        {p && (
          <>
            <p className="flex flex-wrap gap-1.5">
              {p.tier && <span className="cozy-chip green">{p.tier}</span>}
              {p.team && <span className="cozy-chip">{/^team /i.test(p.team) ? p.team : `Team ${p.team}`}</span>}
              {p.memberSince && <span className="cozy-chip">since {p.memberSince}</span>}
              {!p.tier && !p.team && !p.memberSince && !p.bio && (
                <span className="text-sm" style={{ color: "var(--muted)" }}>Private profile.</span>
              )}
            </p>
            {p.bio && <p className={`text-sm font-semibold ${compact ? "line-clamp-2" : ""}`}>{p.bio}</p>}
            {!compact && p.signatureSvg && (
              <div
                className="h-14 max-w-60 [&_svg]:h-full [&_svg]:w-auto"
                style={{ color: "var(--text)" }}
                // Rebuilt by the server from path data only (src/server/dgg-profile.ts).
                dangerouslySetInnerHTML={{ __html: p.signatureSvg }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The final list: places shared by equals (1, 2, 2, 4), the top five marked. */
function Final({ result, byId }: { result: Ranking; byId: Map<string, Chatter> }) {
  const rows: { place: number; ids: string[] }[] = [];
  let place = 1;
  for (const g of result) {
    rows.push({ place, ids: g });
    place += g.length;
  }
  const text = rows.map((r) => `${r.place}. ${r.ids.map((id) => byId.get(id)!.name).join(" = ")}`).join("\n");
  const [copied, setCopied] = useState(false);
  return (
    <section className="cozy-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black">Your ranking</h2>
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          The top 5 advance.
        </span>
        <button
          type="button"
          className="cozy-btn ml-auto"
          onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy as text"}
        </button>
      </div>
      <ol className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.ids[0]}
            className="grid grid-cols-[2.5rem_1fr] items-center gap-3 rounded-[14px] px-2 py-1.5"
            style={{ background: r.place <= 5 ? "var(--highlight)" : undefined }}
          >
            <span className="hand text-right text-2xl font-bold" style={{ color: "var(--muted)" }}>
              {r.place}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {r.ids.map((id, i) => {
                const c = byId.get(id)!;
                return (
                  <span key={id} className="flex items-center gap-2">
                    {i > 0 && <span className="font-black" style={{ color: "var(--muted)" }}>=</span>}
                    <span className="flex h-8 w-11 items-center justify-center overflow-hidden rounded-md" style={{ background: "var(--cream)" }}>
                      <Face chatter={c} size={0.85} />
                    </span>
                    <span className="font-extrabold">{c.name}</span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
