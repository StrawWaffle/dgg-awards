import { useEffect, useMemo, useRef, useState } from "react";
import { useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { sfx } from "@/lab/sfx";
import { reducedMotion } from "@/lab/sketch";
import { type Choice, type Ranking, type RankState, choicesLeft, crossing, current, inPlay, points } from "@/lab/rank";
import { type Step, type TriageState, type Verdict, apply, card, comparisonsFor, phase, result, start } from "@/lab/triage";

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

// v5, swipe then compare, from 2026-11-10 (v1 ranked batches, v2 merge sort, v3 insertion, v4 knockout only).
const KEY = "lab.rank.wildcards.v5";
const TOP = 10;
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
function replay({ order, steps }: Saved): TriageState {
  let s = start(order, TOP);
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
 * Experiment: your top ten of the 67 DGGer wildcards with the least effort
 * (src/lab/triage.ts). First a swipe through everyone: yes, no or maybe, one
 * card at a time. Then only the finalists are compared, two at a time, as a
 * knockout (src/lab/rank.ts): equals share places and points (10 down to 1),
 * and a group crossing the line is one pick of exactly those who fit.
 * Everything on the destiny.gg profile is shown. Saved in this browser as you
 * go; nothing is a vote.
 */
export function RankChatters() {
  const key = KEY;
  const top = TOP;
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
      return replay(saved);
    } catch {
      return null;
    }
  }, [saved, byId]);

  const step = (s: Step) => {
    const nextSaved = { ...saved!, steps: [...saved!.steps, s] };
    setSaved(nextSaved);
    save(key, nextSaved);
  };
  const back = () => {
    if (!saved?.steps.length) return;
    sfx.back();
    const nextSaved = { ...saved, steps: saved.steps.slice(0, -1) };
    setSaved(nextSaved);
    save(key, nextSaved);
  };
  // Backspace steps back, like the button.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" || e.repeat || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      back();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const restart = () => {
    if (!chatters || chatters === "missing") return;
    if (!confirm("Start over? Your answers so far are cleared.")) return;
    const fresh = { order: shuffled(chatters.map((c) => c.id)), steps: [] };
    setSaved(fresh);
    save(key, fresh);
  };

  // A little fanfare when the last answer finishes the top ten (not on loading a finished run).
  const wasDone = useRef<boolean | null>(null);
  const isDone = state ? phase(state) === "done" : null;
  useEffect(() => {
    if (isDone === null) return;
    if (isDone && wasDone.current === false) sfx.done();
    wasDone.current = isDone;
  }, [isDone]);

  if (chatters === null) return <Shell>Loading the wildcards…</Shell>;
  if (chatters === "missing") return <Shell>No wildcards found in DGGer of the Year.</Shell>;
  if (!state) return <Shell>Loading…</Shell>;

  const at = phase(state);
  const bracket = state.bracket;
  const match = bracket && current(bracket);
  const cross = bracket && crossing(bracket);
  const swiping = card(state);
  const left = bracket ? choicesLeft(bracket) : null;
  const compared = bracket?.asked ?? 0;
  return (
    <main className="mx-auto max-w-[110rem] space-y-5 px-4 py-6">
      <header className="cozy-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <h1 className="text-2xl font-black">Your top {top} of the wildcards</h1>
        <span className="cozy-chip">{chatters.length} chatters</span>
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          {at === "done"
            ? `Done: ${state.swipes} swipes, ${compared} comparisons.`
            : swiping
              ? at === "again"
                ? `Still a yes? ${swiping.n} of ${swiping.of} · ${swiping.kept} kept`
                : `Swipe ${swiping.n} of ${swiping.of} · ${swiping.yes} yes, ${swiping.maybe} maybe · then about ${comparisonsFor(Math.max(swiping.yes ?? 0, 10), 10)} comparisons`
              : at === "pick"
                ? `${state.finalists!.length} finalists · comparison ${compared + 1}, the last one`
                : `${state.finalists!.length} finalists · comparison ${compared + 1} · about ${Math.max(1, left!.about)} to go, at most ${Math.max(1, left!.most)} · every Equal means fewer`}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="cozy-btn gap-2" onClick={back} disabled={!saved?.steps.length}>
            <Key name="backspace" label="Backspace" />
            Back
          </button>
          <button type="button" className="cozy-btn" onClick={restart}>
            Start over
          </button>
        </span>
      </header>
      {swiping && (
        <Swipe
          key={`${at}-${swiping.n}`}
          id={swiping.id}
          again={at === "again"}
          next={at === "again" ? state.again![swiping.n] : state.order[swiping.n]}
          byId={byId}
          onSwipe={(v) => step({ swipe: v })}
        />
      )}
      {bracket && match && <Compare key={bracket.asked} state={bracket} match={match} byId={byId} onChoose={step} />}
      {bracket && at === "pick" && cross && <Pick group={cross.group} need={cross.need} place={cross.place} top={top} byId={byId} onKeep={(ids) => step({ keep: ids })} />}
      {at === "done" && <Final result={result(state)} byId={byId} top={top} />}
      {bracket && at !== "done" && <Standings state={bracket} byId={byId} />}
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

/**
 * A keyboard key, on the button it presses, so the keys explain themselves.
 * Mr. Breakfast's Free Prompts (CC0), in src/media/key-*.svg. Hidden on
 * touch screens, which have no keys.
 */
function Key({ name, label }: { name: "left" | "right" | "down" | "equals" | "backspace"; label: string }) {
  return <img src={`/Media/key-${name}.svg`} alt={label} title={`Key: ${label}`} className="rank-key h-7 w-auto shrink-0" draggable={false} />;
}

function Face({ chatter, size }: { chatter: Chatter; size: number }) {
  if (chatter.image) return <img src={chatter.image} alt="" className="h-full w-full object-cover" />;
  if (chatter.emote) return <Emote name={chatter.emote} size={size} />;
  return (
    <span className="hand font-bold" style={{ fontSize: `${size * 1.3}rem`, color: "var(--muted)" }}>
      {chatter.name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * One card: yes (top ten material), no, or maybe. Keys ← ↓ →, the buttons, or
 * dragging the card. It flies off the way it went, with a sound; a yes throws
 * a few of their emote. The second pass, over too many yeses, is yes or no.
 */
function Swipe({
  id,
  again,
  next,
  byId,
  onSwipe,
}: {
  id: string;
  again: boolean;
  next: string | undefined;
  byId: Map<string, Chatter>;
  onSwipe: (v: Verdict) => void;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState<Verdict | null>(null);
  const from = useRef<number | null>(null);
  const box = useRef<HTMLElement>(null);
  const [layer, fire] = useBursts();
  const chatter = byId.get(id)!;
  // Load the next card's profile while this one is up.
  useEffect(() => {
    if (next) profileOf(byId.get(next)!.name);
  }, [next, byId]);
  const decide = (v: Verdict) => {
    if (gone) return;
    setGone(v);
    sfx[v]();
    if (v === "yes" && chatter.emote && box.current) fire(chatter.emote, box.current.clientWidth / 2 - 20, 160, 7);
    setTimeout(() => onSwipe(v), reducedMotion() ? 0 : 230);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") decide("no");
      else if (e.key === "ArrowRight") decide("yes");
      else if (!again && (e.key === "ArrowDown" || e.key === "m")) decide("maybe");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const lean = gone ?? (dx > 40 ? "yes" : dx < -40 ? "no" : null);
  const shown = (v: Verdict) => (gone === v ? 1 : v === "yes" ? Math.min(1, Math.max(0, (dx - 20) / 90)) : v === "no" ? Math.min(1, Math.max(0, (-dx - 20) / 90)) : 0);
  const transform =
    gone === "yes"
      ? "translateX(130%) rotate(14deg)"
      : gone === "no"
        ? "translateX(-130%) rotate(-14deg)"
        : gone === "maybe"
          ? "translateY(70px) scale(0.92)"
          : `translateX(${dx}px) rotate(${dx / 30}deg)`;
  return (
    <section ref={box} className="relative mx-auto max-w-3xl space-y-4">
      {layer}
      <p className="text-center text-lg font-black">{again ? "Too many yeses: still a yes?" : "Top 10 material?"}</p>
      <div className="rank-card-in">
        <div
          className="cozy-panel relative touch-pan-y select-none p-6 sm:min-h-[32rem] sm:p-8"
          style={{
            transform,
            opacity: gone ? 0 : 1,
            transition: from.current !== null ? "none" : gone ? "transform 230ms ease-in, opacity 230ms ease-in" : "transform 150ms ease",
            borderColor: lean === "yes" ? "var(--primary-shadow)" : lean === "no" ? "var(--coral)" : undefined,
            cursor: from.current !== null ? "grabbing" : "grab",
          }}
          onPointerDown={(e) => {
            if (gone || (e.target as HTMLElement).closest("a")) return;
            from.current = e.clientX;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => from.current !== null && setDx(e.clientX - from.current)}
          onPointerUp={() => {
            if (from.current === null) return;
            from.current = null;
            const d = dx;
            setDx(0);
            if (d > 100) decide("yes");
            else if (d < -100) decide("no");
          }}
          onPointerCancel={() => {
            from.current = null;
            setDx(0);
          }}
        >
          <span className="rank-stamp" style={{ left: "1.25rem", color: "var(--primary-shadow)", opacity: shown("yes"), transform: "rotate(-12deg)" }}>
            Yes!
          </span>
          <span className="rank-stamp" style={{ right: "1.25rem", color: "var(--coral)", opacity: shown("no"), transform: "rotate(12deg)" }}>
            Nope
          </span>
          {gone === "maybe" && (
            <span className="rank-stamp" style={{ left: "50%", translate: "-50% 0", color: "var(--muted)" }}>
              Maybe
            </span>
          )}
          <ProfileCard chatter={chatter} large />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="cozy-btn gap-2" onClick={() => decide("no")}>
          <Key name="left" label="Left arrow" />
          No
        </button>
        {!again && (
          <button type="button" className="cozy-btn gap-2" onClick={() => decide("maybe")}>
            <Key name="down" label="Down arrow" />
            Maybe
          </button>
        )}
        <button type="button" className="cozy-btn primary gap-2" onClick={() => decide("yes")}>
          Yes
          <Key name="right" label="Right arrow" />
        </button>
      </div>
      <p className="text-center text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {again
          ? "Only the ones you keep are compared."
          : "Or drag the card. Only the yeses get compared, two at a time, after this (the maybes too if there are fewer than ten yeses)."}
      </p>
    </section>
  );
}

/** A match: two sides still in the running (each may be a group of equals). Pick one, or equal. */
function Compare({
  state,
  match,
  byId,
  onChoose,
}: {
  state: RankState;
  match: NonNullable<ReturnType<typeof current>>;
  byId: Map<string, Chatter>;
  onChoose: (c: Choice) => void;
}) {
  // The pick shows for a moment (the winner pops, the other fades) before the next match.
  const [picked, setPicked] = useState<Choice | null>(null);
  const choose = (c: Choice) => {
    if (picked) return;
    setPicked(c);
    if (c === "tie") sfx.tie();
    else sfx.pick();
    setTimeout(() => onChoose(c), reducedMotion() ? 0 : 200);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // One choice per press: holding a key down doesn't keep answering.
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") choose("left");
      else if (e.key === "ArrowRight") choose("right");
      else if (e.key === "ArrowDown" || e.key === "=") choose("tie");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const placeOf = (id: string) => state.placed.findIndex((g) => g.includes(id)) + 1;
  /** "Unbeaten", or who they lost to, by place. */
  const record = (g: string[]) => {
    const beatenBy = [...new Set(g.flatMap((id) => state.lostTo[id] ?? []))];
    if (!beatenBy.length) return "Unbeaten";
    return `Lost to ${beatenBy.map((id) => `#${placeOf(id)} ${byId.get(id)!.name}`).join(", ")}`;
  };
  const cols = (g: string[]) => Math.min(g.length, 3);
  const side = (g: string[], c: Choice) => {
    const won = picked === c || picked === "tie";
    const lost = picked !== null && !won;
    return (
    <button
      type="button"
      onClick={() => choose(c)}
      className="cozy-card block w-full space-y-3 rounded-[20px] border-2 p-4 text-left"
      style={{
        background: "var(--cream)",
        borderColor: won ? "var(--primary-shadow)" : "var(--panel-border)",
        boxShadow: `0 5px 0 ${won ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
        transform: won ? "scale(1.025)" : lost ? "scale(0.97)" : undefined,
        opacity: lost ? 0.45 : 1,
        transition: "transform 150ms ease, opacity 150ms ease, border-color 150ms ease",
      }}
    >
      <span className="flex flex-wrap gap-1.5">
        <span className="cozy-chip">{record(g)}</span>
        {g.length > 1 && <span className="cozy-chip green">{g.length} equal</span>}
      </span>
      <div className="grid gap-x-5 gap-y-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
        {g.map((x) => (
          <ProfileCard key={x} chatter={byId.get(x)!} />
        ))}
      </div>
    </button>
    );
  };
  const heading =
    match.placing === 1
      ? `Round ${match.round} of ${match.rounds}: who's better?`
      : `Finding ${ordinal(match.placing)} place: who's better?`;
  return (
    <section className="rank-card-in space-y-4">
      <p className="text-center text-lg font-black">{heading}</p>
      <div
        className="rank-pair mx-auto grid items-start gap-4"
        // As wide as the chatters showing need: two alone stay readable, groups spread out.
        style={{ ["--cols" as string]: `${cols(match.left)}fr ${cols(match.right)}fr`, maxWidth: `${(cols(match.left) + cols(match.right)) * 24}rem` }}
      >
        {side(match.left, "left")}
        {side(match.right, "right")}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className="cozy-btn gap-2" onClick={() => choose("left")}>
          <Key name="left" label="Left arrow" />
          Left is better
        </button>
        <button type="button" className="cozy-btn primary gap-2" onClick={() => choose("tie")}>
          <Key name="down" label="Down arrow" />
          Equal
          <Key name="equals" label="Equals" />
        </button>
        <button type="button" className="cozy-btn gap-2" onClick={() => choose("right")}>
          Right is better
          <Key name="right" label="Right arrow" />
        </button>
      </div>
      <p className="text-center text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Equal ones go on together from here, so every Equal means fewer choices later. Whoever loses to a loser is never
        asked about again.
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
  const toggle = (id: string) => {
    sfx.maybe();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < need ? [...p, id] : p));
  };
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
        <button type="button" className="cozy-btn primary" disabled={picked.length !== need} onClick={() => (sfx.pick(), onKeep(picked))}>
          {picked.length === need ? `Keep these ${need}` : `Pick ${need - picked.length} more`}
        </button>
      </div>
    </section>
  );
}

/** Placed so far, small, and how many are still in the running. */
function Standings({ state, byId }: { state: RankState; byId: Map<string, Chatter> }) {
  let place = 1;
  const rows = state.placed.map((g) => {
    const row = { place, ids: g };
    place += g.length;
    return row;
  });
  const placedCount = state.placed.flat().length;
  const playing = inPlay(state).length;
  const out = byId.size - placedCount - playing;
  return (
    <section className="cozy-panel space-y-2 p-4">
      <p className="text-sm font-black">
        So far: {placedCount} placed, {playing} still in the running{out > 0 && `, ${out} out`}
      </p>
      {rows.length > 0 && (
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.ids[0]} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5">
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
      )}
    </section>
  );
}

/** "November 10, 2020" → "November 10, 2020 · 6 years". */
function since(memberSince: string) {
  const t = Date.parse(memberSince);
  if (Number.isNaN(t)) return memberSince;
  const years = Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
  return `${memberSince} · ${years < 1 ? "under a year" : `${years} year${years === 1 ? "" : "s"}`}`;
}

/**
 * A chatter, with everything their destiny.gg profile shows (bar nationality,
 * gender and age, which the site never reads), as a labelled list so it's
 * clear what's what. The emote is the big picture (most profile photos are
 * destiny.gg's default drawing); the photo is the small one by the link.
 * Missing values say so, in grey: destiny.gg's own "It's a secret..." bio
 * counts as no bio. `large` is the swipe card, with the room of one person.
 */
function ProfileCard({ chatter, large = false }: { chatter: Chatter; large?: boolean }) {
  const p = useProfile(chatter.name);
  const bio = p?.bio && !/^it'?s a secret/i.test(p.bio.trim()) ? p.bio : null;
  const none = (text: string) => <span style={{ color: "var(--muted)" }}>{text}</span>;
  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className={`${large ? "text-sm" : "text-xs"} pt-0.5 font-bold`} style={{ color: "var(--muted)" }}>
        {label}
      </dt>
      <dd className="min-w-0 break-words font-semibold">{value}</dd>
    </>
  );
  return (
    <div className={`min-w-0 ${large ? "space-y-6" : "space-y-4"}`}>
      <div className={`flex gap-4 ${large ? "flex-col items-start sm:flex-row sm:items-center" : "items-center"}`}>
        {/* Wide emotes widen the box rather than being cut off. */}
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[18px] px-2 ${large ? "h-28 min-w-28 max-w-80 sm:h-32 sm:min-w-32" : "h-20 min-w-20 max-w-52"}`}
          style={{ background: "var(--panel-border)" }}
        >
          <Face chatter={chatter} size={large ? 3 : 1.9} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className={`font-black leading-tight [overflow-wrap:anywhere] ${large ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{chatter.name}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {p?.photoUrl && <img src={p.photoUrl} alt="" title="Profile photo" className="h-7 w-7 rounded-full object-cover" />}
            {p?.url && (
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-bold underline" onClick={(e) => e.stopPropagation()}>
                destiny.gg profile ↗
              </a>
            )}
          </div>
          {chatter.emote && (
            <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              Emote: <b>{chatter.emote}</b>
            </div>
          )}
        </div>
      </div>
      {p === undefined && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading the profile…</p>}
      {p === null && <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>No destiny.gg profile found under this name.</p>}
      {p && (
        <dl className={`grid items-start gap-x-5 gap-y-2.5 ${large ? "grid-cols-[6.5rem_1fr] text-base sm:grid-cols-[8rem_1fr]" : "grid-cols-[6rem_1fr] text-sm"}`}>
          {row("Subscription", p.tier ? p.tier.replace(/\s*Subscriber$/i, "") : none("Not subscribed"))}
          {row("Team", p.team ? p.team.replace(/^Team\s+/i, "") : none("No team"))}
          {row("Member since", p.memberSince ? since(p.memberSince) : none("Unknown"))}
          {row("Bio", bio ? <span className="whitespace-pre-line">{bio}</span> : none("No bio"))}
          {row(
            "Signature",
            p.signatureSvg ? (
              <div
                className={`rounded-[12px] border-2 border-dashed p-2 [&_svg]:h-full [&_svg]:w-full ${large ? "h-28" : "h-20"}`}
                style={{ color: "var(--text)", borderColor: "var(--panel-border)", background: "var(--panel)" }}
                // Rebuilt by the server from path data only (src/server/dgg-profile.ts).
                dangerouslySetInnerHTML={{ __html: p.signatureSvg }}
              />
            ) : (
              none("No signature")
            ),
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * The final list: places shared by equals (1, 2, 2, 4), each one's points, and
 * who didn't make it.
 */
function Final({ result, byId, top }: { result: Ranking; byId: Map<string, Chatter>; top: number }) {
  const rows = points(result, top).map((r) => ({ place: r.place, ids: r.group, points: r.points }));
  const shown = new Set(result.flat());
  const rest = [...byId.values()].filter((c) => !shown.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} point${n === 1 ? "" : "s"}`;
  const text = rows
    .map((r) => `${r.place}. ${r.ids.map((id) => byId.get(id)!.name).join(" = ")} (${pts(r.points)}${r.ids.length > 1 ? " each" : ""})`)
    .join("\n");
  const [copied, setCopied] = useState(false);
  return (
    <section className="cozy-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black">Your top {top}</h2>
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          Points: {top} for 1st down to 1 for {top}th. Equals share the points of the places they take.
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
              {pts(r.points)}
              {r.ids.length > 1 && " each"}
            </span>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          Not in your top {top} ({rest.length}): {rest.map((c) => c.name).join(", ")}.
        </p>
      )}
    </section>
  );
}
