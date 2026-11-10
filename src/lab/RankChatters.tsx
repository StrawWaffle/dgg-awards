import { useEffect, useMemo, useState } from "react";
import { Emote } from "@/lab/Emote";
import { type Choice, type Ranking, type RankState, type Step, apply, crossing, current, expectedLeft, mostLeft, phase, points, start } from "@/lab/rank";

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
type Saved = { order: string[]; steps: Step[] };

// v3, insertion, from 2026-11-10 (v1 started from batches of five; v2 was merge sort).
const keyOf = (top: number | null) => (top ? `lab.rank.wildcards.v3.top${top}` : "lab.rank.wildcards.v3");
const load = (key: string): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
const save = (key: string, s: Saved | null) => {
  try {
    if (s) localStorage.setItem(key, JSON.stringify(s));
    else localStorage.removeItem(key);
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
function replay({ order, steps }: Saved, top: number | null): RankState {
  let s = start(order, top);
  for (const step of steps) s = apply(s, step);
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
 * Experiment: ranking the 67 DGGer wildcards by hand, with ties. Chatters are
 * placed one at a time into the list so far: the newcomer on the left, and on
 * the right whoever holds the midpoint of where they could still land, so each
 * choice halves what's left to learn (src/lab/rank.ts). "Equal" puts them in
 * that group. Everything on the destiny.gg profile is shown, since more to go
 * on makes the choice easier. Saved in this browser as you go; nothing is a
 * vote.
 *
 * With `top` (10), only your best ten: a newcomer is first measured against
 * your current 10th, and if worse drops out after that one choice, never asked
 * about again. The ten get points (10 down to 1, shared by equals). If a group
 * of equals crosses the line, you pick exactly the ones that fit.
 */
export function RankChatters({ top = null }: { top?: number | null }) {
  const key = keyOf(top);
  const chatters = useWildcards();
  const [saved, setSaved] = useState<Saved | null>(() => load(key));
  const byId = useMemo(() => new Map(chatters && chatters !== "missing" ? chatters.map((c) => [c.id, c]) : []), [chatters]);

  // A saved run whose chatters changed since is started again.
  useEffect(() => {
    if (!chatters || chatters === "missing") return;
    const ids = chatters.map((c) => c.id);
    if (!saved || saved.order.length !== ids.length || !saved.order.every((id) => byId.has(id))) {
      const fresh = { order: shuffled(ids), steps: [] };
      setSaved(fresh);
      save(key, fresh);
    }
  }, [chatters, byId]);

  const state = useMemo(() => {
    if (!saved || !byId.size || !saved.order.every((id) => byId.has(id))) return null;
    try {
      return replay(saved, top);
    } catch {
      return null;
    }
  }, [saved, byId, top]);

  const step = (s: Step) => {
    const nextSaved = { ...saved!, steps: [...saved!.steps, s] };
    setSaved(nextSaved);
    save(key, nextSaved);
  };
  const back = () => {
    if (!saved?.steps.length) return;
    const nextSaved = { ...saved, steps: saved.steps.slice(0, -1) };
    setSaved(nextSaved);
    save(key, nextSaved);
  };
  const restart = () => {
    if (!chatters || chatters === "missing") return;
    if (!confirm("Start over? Your answers so far are cleared.")) return;
    const fresh = { order: shuffled(chatters.map((c) => c.id)), steps: [] };
    setSaved(fresh);
    save(key, fresh);
  };

  if (chatters === null) return <Shell>Loading the wildcards…</Shell>;
  if (chatters === "missing") return <Shell>No wildcards found in DGGer of the Year.</Shell>;
  if (!state) return <Shell>Loading…</Shell>;

  const left = mostLeft(state);
  const at = phase(state);
  const question = current(state);
  const cross = crossing(state);
  return (
    <main className="mx-auto max-w-[110rem] space-y-5 px-4 py-6">
      <header className="cozy-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <h1 className="text-2xl font-black">{top ? `Your top ${top} of the wildcards` : "Rank the wildcards"}</h1>
        <span className="cozy-chip">{chatters.length} chatters</span>
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          {at === "done"
            ? `Done in ${state.asked} choices.`
            : at === "pick"
              ? `Choice ${state.asked + 1} · the last one`
              : `Choice ${state.asked + 1} · about ${expectedLeft(state)} to go, at most ${left} · every Equal means fewer`}
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
      {question && <Compare state={state} id={question.id} group={question.group} place={question.place} byId={byId} onChoose={step} />}
      {at === "pick" && cross && <Pick group={cross.group} need={cross.need} place={cross.place} top={top!} byId={byId} onKeep={(ids) => step({ keep: ids })} />}
      {at === "done" && <Final result={state.ranked} byId={byId} top={top} />}
      {at !== "done" && <Standings state={state} byId={byId} />}
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

/**
 * The newcomer (left) against the group holding the place they're measured
 * at (right): pick one, or equal. A group of equals spreads into columns.
 */
function Compare({
  state,
  id,
  group,
  place,
  byId,
  onChoose,
}: {
  state: RankState;
  id: string;
  group: string[];
  place: number;
  byId: Map<string, Chatter>;
  onChoose: (c: Choice) => void;
}) {
  // Load the next newcomer's profile while this question is up.
  useEffect(() => {
    const nextId = state.queue[0];
    if (nextId) profileOf(byId.get(nextId)!.name);
  }, [state.queue[0], byId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // One choice per press: holding a key down doesn't keep answering.
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") onChoose("left");
      else if (e.key === "ArrowRight") onChoose("right");
      else if (e.key === "ArrowDown" || e.key === "=") onChoose("tie");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onChoose]);
  const cols = Math.min(group.length, 3);
  const last = place + group.length - 1;
  const atCutoff = state.top !== null && place <= state.top && last >= state.top;
  const where =
    group.length === 1 ? `Currently ${ordinal(place)}` : `Currently equal, places ${place} to ${last}`;
  const side = (ids: string[], c: Choice, label: string, strong: boolean) => (
    <button
      type="button"
      onClick={() => onChoose(c)}
      className="cozy-card block w-full space-y-2 rounded-[20px] border-2 p-3 text-left"
      style={{ background: "var(--cream)", borderColor: "var(--panel-border)", boxShadow: "0 5px 0 var(--cream-shadow)" }}
    >
      <span className={`cozy-chip ${strong ? "coral" : ""}`}>{label}</span>
      <div className="grid gap-x-5 gap-y-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
        {ids.map((x) => (
          <ProfileCard key={x} chatter={byId.get(x)!} />
        ))}
      </div>
    </button>
  );
  return (
    <section className="space-y-4">
      <p className="text-center text-lg font-black">
        {atCutoff ? `Does ${byId.get(id)!.name} make your top ${state.top}?` : `Where does ${byId.get(id)!.name} go?`}
      </p>
      <div
        className="rank-pair mx-auto grid items-start gap-4"
        // As wide as the chatters showing need: two alone stay readable, groups spread out.
        style={{ ["--cols" as string]: `1fr ${cols}fr`, maxWidth: `${(1 + cols) * 24}rem` }}
      >
        {side([id], "left", "Placing", false)}
        {side(group, "right", atCutoff ? `${where} · the cutoff` : where, atCutoff)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="cozy-btn" onClick={() => onChoose("left")}>
          ← Left is better
        </button>
        <button type="button" className="cozy-btn primary" onClick={() => onChoose("tie")}>
          Equal
        </button>
        <button type="button" className="cozy-btn" onClick={() => onChoose("right")}>
          Right is better →
        </button>
      </div>
      <p className="text-center text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Keys: ← and → pick a side, ↓ or = for equal. Equal ones stay together from here on, so every Equal means fewer
        choices later.
      </p>
    </section>
  );
}

const ordinal = (n: number) => {
  const r = n % 100;
  const suffix = r >= 11 && r <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
};

/** A group of equals crossing the top line: keep exactly the ones that fit. They stay equal. */
function Pick({
  group,
  need,
  place,
  top,
  byId,
  onKeep,
}: {
  group: string[];
  need: number;
  place: number;
  top: number;
  byId: Map<string, Chatter>;
  onKeep: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < need ? [...p, id] : p));
  return (
    <section className="space-y-4">
      <p className="cozy-panel px-5 py-3 font-bold" style={{ background: "var(--highlight)" }}>
        {group.length} are ranked equal for places {place} to {place + group.length - 1}, but only {need === 1 ? "one" : need} of them{" "}
        {need === 1 ? "fits" : "fit"} in your top {top}.{" "}
        {need === 1
          ? `Pick the one who stays, in ${ordinal(place)} place; the other${group.length > 2 ? "s" : ""} drop out.`
          : `Pick the ${need} who stay. They stay equal, sharing places ${place} to ${place + need - 1}; the others drop out.`}
      </p>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))" }}>
        {group.map((id) => {
          const on = picked.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={on}
              className="cozy-card block w-full space-y-2 rounded-[20px] border-2 p-3 text-left"
              style={{
                background: "var(--cream)",
                borderColor: on ? "var(--primary-shadow)" : "var(--panel-border)",
                boxShadow: `0 5px 0 ${on ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
              }}
            >
              <span className={`cozy-chip ${on ? "green" : ""}`}>{on ? "Stays" : "Pick"}</span>
              <ProfileCard chatter={byId.get(id)!} />
            </button>
          );
        })}
      </div>
      <div className="flex justify-center">
        <button type="button" className="cozy-btn primary" disabled={picked.length !== need} onClick={() => onKeep(picked)}>
          {picked.length === need ? `Keep these ${need}` : `Pick ${need - picked.length} more`}
        </button>
      </div>
    </section>
  );
}

/** The list so far, small, with the cutoff marked and who's out. */
function Standings({ state, byId }: { state: RankState; byId: Map<string, Chatter> }) {
  const { top } = state;
  let place = 1;
  const rows = state.ranked.map((g) => {
    const row = { place, ids: g };
    place += g.length;
    return row;
  });
  return (
    <section className="cozy-panel space-y-2 p-4">
      <p className="text-sm font-black">
        So far: {state.ranked.flat().length} placed, {state.queue.length + (state.cur ? 1 : 0)} to go
        {top !== null && state.out.length > 0 && `, ${state.out.length} out`}
      </p>
      <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <li
            key={r.ids[0]}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
            style={{ background: top !== null && r.place <= top && r.place + r.ids.length - 1 >= top ? "var(--highlight)" : undefined }}
          >
            <span className="hand font-bold" style={{ color: "var(--muted)" }}>
              {r.place}
            </span>
            {r.ids.map((id, i) => (
              <span key={id} className="flex items-center gap-1">
                {i > 0 && <span style={{ color: "var(--muted)" }}>=</span>}
                <span className="flex h-6 w-8 items-center justify-center overflow-hidden rounded" style={{ background: "var(--cream)" }}>
                  <Face chatter={byId.get(id)!} size={0.65} />
                </span>
                <span className="font-bold">{byId.get(id)!.name}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A chatter with everything their destiny.gg profile shows (bar nationality,
 * gender and age, which the site never reads): their picture or emote, the
 * profile photo, tier, team, member since, bio and signature.
 */
function ProfileCard({ chatter }: { chatter: Chatter }) {
  const p = useProfile(chatter.name);
  const face = chatter.image || chatter.emote;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {face && (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[14px]" style={{ background: "var(--panel-border)" }}>
            <Face chatter={chatter} size={1.9} />
          </div>
        )}
        {p?.photoUrl && <img src={p.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-[14px] object-cover" />}
        <div className="min-w-[9rem] flex-1">
          <div className="break-words text-2xl font-black leading-tight">{chatter.name}</div>
          {p?.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline" onClick={(e) => e.stopPropagation()}>
              destiny.gg profile ↗
            </a>
          )}
        </div>
      </div>
      {p === undefined && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading the profile…</p>}
      {p === null && <p className="text-sm" style={{ color: "var(--muted)" }}>No destiny.gg profile found.</p>}
      {p && (
        <>
          <p className="flex flex-wrap gap-1.5">
            {p.tier && <span className="cozy-chip green">{p.tier}</span>}
            {p.team && <span className="cozy-chip">{/^team /i.test(p.team) ? p.team : `Team ${p.team}`}</span>}
            {p.memberSince && <span className="cozy-chip">Member since {p.memberSince}</span>}
            {!p.tier && !p.team && !p.memberSince && !p.bio && !p.signatureSvg && (
              <span className="text-sm" style={{ color: "var(--muted)" }}>Private profile.</span>
            )}
          </p>
          {p.bio && <p className="whitespace-pre-line break-words font-semibold">{p.bio}</p>}
          {p.signatureSvg && (
            <div
              className="h-16 max-w-full [&_svg]:h-full [&_svg]:max-w-full [&_svg]:w-auto"
              style={{ color: "var(--text)" }}
              // Rebuilt by the server from path data only (src/server/dgg-profile.ts).
              dangerouslySetInnerHTML={{ __html: p.signatureSvg }}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The final list: places shared by equals (1, 2, 2, 4). The whole ranking marks
 * the top five; a top ten shows each one's points, and who didn't make it.
 */
function Final({ result, byId, top }: { result: Ranking; byId: Map<string, Chatter>; top: number | null }) {
  const rows = points(result, top ?? 0).map((r) => ({ place: r.place, ids: r.group, points: top ? r.points : null }));
  const shown = new Set(result.flat());
  const rest = [...byId.values()].filter((c) => !shown.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} point${n === 1 ? "" : "s"}`;
  const text = rows
    .map((r) => `${r.place}. ${r.ids.map((id) => byId.get(id)!.name).join(" = ")}${r.points !== null ? ` (${pts(r.points)}${r.ids.length > 1 ? " each" : ""})` : ""}`)
    .join("\n");
  const [copied, setCopied] = useState(false);
  return (
    <section className="cozy-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black">{top ? `Your top ${top}` : "Your ranking"}</h2>
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          {top ? `Points: ${top} for 1st down to 1 for ${top}th. Equals share the points of the places they take.` : "The top 5 advance."}
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
            className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-[14px] px-2 py-1.5"
            style={{ background: !top && r.place <= 5 ? "var(--highlight)" : undefined }}
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
            <span className="text-sm font-bold tabular-nums" style={{ color: "var(--muted)" }}>
              {r.points !== null && `${pts(r.points)}${r.ids.length > 1 ? " each" : ""}`}
            </span>
          </li>
        ))}
      </ol>
      {top && rest.length > 0 && (
        <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          Not in your top {top} ({rest.length}): {rest.map((c) => c.name).join(", ")}.
        </p>
      )}
    </section>
  );
}
