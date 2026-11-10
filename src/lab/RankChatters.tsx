import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { sfx } from "@/lab/sfx";
import { reducedMotion } from "@/lab/sketch";
import { type Choice, type Ranking, type RankState, choicesLeft, crossing, current, inPlay, points } from "@/lab/rank";
import { type Step, type TriageState, type Verdict, apply, card, comparisonsFor, phase, result, start } from "@/lab/triage";

/**
 * A chatter to rank: the nominee, its name without the list number, and
 * where to load its destiny.gg profile (the admin route in the lab, the
 * public one for nominees of a points award on the vote page).
 */
export type Chatter = { id: string; name: string; emote: string | null; image: string | null; profile: string | null };
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

/** The award the wildcards are voted in (scripts/split-wildcards.ts). */
export const WILDCARDS_ID = "dgger_wildcards";

/** A nominee as a chatter to rank. */
export const toChatter = (o: any, profile: (name: string) => string | null): Chatter => {
  const name = String(o.title).replace(/^\d+\.\s*/, "").trim();
  return {
    id: o.id,
    name,
    emote: o.emote ?? null,
    image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
    profile: name ? profile(name) : null,
  };
};

/**
 * The wildcards: the "DGGer wildcards" award, or before that existed, the
 * DGGer nominees whose description says "Wildcards".
 */
function useWildcards() {
  const [chatters, setChatters] = useState<Chatter[] | null | "missing">(null);
  useEffect(() => {
    fetch("/api/admin/nominees")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        const own: any[] | undefined = data.find((c) => c.id === WILDCARDS_ID)?.options;
        const options: any[] = own ?? (data.find((c) => c.id === "dgger")?.options ?? []).filter((o: any) => /wildcard/i.test(o.description ?? ""));
        const list = options.map((o) => toChatter(o, (name) => `/api/admin/dgg-profile/${encodeURIComponent(name)}`)).filter((c) => c.name);
        setChatters(list.length ? list : "missing");
      })
      .catch(() => setChatters("missing"));
  }, []);
  return chatters;
}

/** destiny.gg profiles, loaded once each, by address. */
const profiles = new Map<string, Promise<Profile | null>>();
function profileOf(url: string | null) {
  if (!url) return Promise.resolve(null);
  if (!profiles.has(url)) {
    profiles.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return profiles.get(url)!;
}
function useProfile(url: string | null) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setP(undefined);
    profileOf(url).then((x) => live && setP(x));
    return () => {
      live = false;
    };
  }, [url]);
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
  const chatters = useWildcards();
  if (chatters === null) return <Shell>Loading the wildcards…</Shell>;
  if (chatters === "missing") return <Shell>No wildcards found.</Shell>;
  return (
    <main className="mx-auto max-w-[110rem] px-4 py-6">
      <TopTen chatters={chatters} storageKey={KEY} title={`Your top ${TOP} of the wildcards`} />
    </main>
  );
}

/**
 * Your top ten of `chatters`, saved in this browser under `storageKey` as you
 * go: the swipe, then the comparisons, then the list with points. `done` is
 * shown under the finished list (the vote page puts its Cast button there).
 */
export function TopTen({
  chatters,
  storageKey,
  title,
  done,
}: {
  chatters: Chatter[];
  storageKey: string;
  title: string;
  done?: (result: Ranking) => React.ReactNode;
}) {
  const key = storageKey;
  const top = TOP;
  const [saved, setSaved] = useState<Saved | null>(() => load(key));
  const byId = useMemo(() => new Map(chatters.map((c) => [c.id, c])), [chatters]);

  // A saved run whose chatters changed since is started again.
  useEffect(() => {
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
  const held = useHeldKey();
  // A yes cheers with the chatter's emote in the strip under the controls:
  // out of the way of the card, and on the page, so it outlasts the card
  // (each card is a fresh Swipe).
  const [cheer, fire] = useBursts();
  const strip = useRef<HTMLDivElement>(null);
  const onYes = (emote: string) => {
    const el = strip.current;
    if (el) fire(emote, el.clientWidth / 2 - 20, el.clientHeight - 48, 7, 2600);
  };
  // Backspace steps back, like the button.
  useKeydown((e) => {
    if (e.key !== "Backspace" || e.repeat || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    back();
  });
  const restart = () => {
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

  if (!state) return <div className="cozy-panel p-8 font-semibold">Loading…</div>;

  const at = phase(state);
  const bracket = state.bracket;
  const match = bracket && current(bracket);
  const cross = bracket && crossing(bracket);
  const swiping = card(state);
  const left = bracket ? choicesLeft(bracket) : null;
  const compared = bracket?.asked ?? 0;
  return (
    <div className="space-y-5">
      <header className="cozy-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <h2 className="text-2xl font-black">{title}</h2>
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
          <button type="button" className={`cozy-btn gap-2${pressed(held, "Backspace")}`} onClick={back} disabled={!saved?.steps.length}>
            <Key name="backspace" label="Backspace" small />
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
          onYes={onYes}
        />
      )}
      {swiping && (
        <div ref={strip} className="relative mx-auto h-40 max-w-6xl">
          {cheer}
        </div>
      )}
      {bracket && match && <Compare key={bracket.asked} state={bracket} match={match} byId={byId} onChoose={step} />}
      {bracket && at === "pick" && cross && <Pick group={cross.group} need={cross.need} place={cross.place} top={top} byId={byId} onKeep={(ids) => step({ keep: ids })} />}
      {at === "done" && <Final result={result(state)} byId={byId} top={top} />}
      {at === "done" && done?.(result(state))}
      {bracket && at !== "done" && <Standings state={bracket} byId={byId} />}
    </div>
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
/** Spelt out in full, so tests/data.test.ts can check each file exists. */
const KEY_SVG = {
  left: "/Media/key-left.svg",
  right: "/Media/key-right.svg",
  down: "/Media/key-down.svg",
  equals: "/Media/key-equals.svg",
  backspace: "/Media/key-backspace.svg",
};
function Key({ name, label, small = false }: { name: "left" | "right" | "down" | "equals" | "backspace"; label: string; small?: boolean }) {
  return (
    <img
      src={KEY_SVG[name]}
      alt={label}
      title={`Key: ${label}`}
      className={`rank-key w-auto shrink-0 ${small ? "h-9" : "h-14"}`}
      draggable={false}
    />
  );
}

/**
 * A keydown handler, registered once and reading the latest render through a
 * ref. (Re-registering on every render dropped presses: holding a key
 * re-renders mid-press, and a listener swapped out during an event misses it.)
 */
function useKeydown(handler: (e: KeyboardEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const key = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}

/** The key held down right now, so its button can show it pressed. */
function useHeldKey() {
  const [held, setHeld] = useState<string | null>(null);
  useEffect(() => {
    const down = (e: KeyboardEvent) => setHeld(e.key);
    const up = () => setHeld(null);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", up);
    };
  }, []);
  return held;
}
const pressed = (held: string | null, ...keys: string[]) => (held && keys.includes(held) ? " is-pressed" : "");

/**
 * The label for a chatter's emote, which isn't their most used one (that's
 * OMEGALUL for most) but the one they use most out of proportion: see the
 * handoff ("Emotes redone"). Hover (or focus) explains.
 */
function Trademark() {
  return (
    <span
      tabIndex={0}
      className="cursor-help underline decoration-dotted underline-offset-2"
      title="The emote they use most out of proportion: how many times more often they post it than chat does overall, among emotes that are at least 1% of theirs. From this year's chat logs."
    >
      Trademark emote
    </span>
  );
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
  onYes,
}: {
  id: string;
  again: boolean;
  next: string | undefined;
  byId: Map<string, Chatter>;
  onSwipe: (v: Verdict) => void;
  onYes: (emote: string) => void;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState<Verdict | null>(null);
  const from = useRef<number | null>(null);
  const held = useHeldKey();
  const chatter = byId.get(id)!;
  // Load the next card's profile while this one is up.
  useEffect(() => {
    if (next) profileOf(byId.get(next)!.profile);
  }, [next, byId]);
  // One answer per card, even from two presses before the next render.
  const answered = useRef(false);
  const decide = (v: Verdict) => {
    if (gone || answered.current) return;
    answered.current = true;
    setGone(v);
    sfx[v]();
    if (v === "yes" && chatter.emote) onYes(chatter.emote);
    setTimeout(() => onSwipe(v), reducedMotion() ? 0 : 230);
  };
  useKeydown((e) => {
    if (e.repeat || e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowLeft") decide("no");
    else if (e.key === "ArrowRight") decide("yes");
    else if (!again && (e.key === "ArrowDown" || e.key === "m")) decide("maybe");
    else return;
    e.preventDefault();
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
    <section className="relative mx-auto max-w-6xl space-y-5">
      <p className="flex items-center justify-center gap-3 text-2xl font-black">
        <Emote name={again ? "Hmm" : "PepoThink"} size={1.2} title="" />
        {again ? "Too many yeses: still a yes?" : "Top 10 material?"}
      </p>
      <div className="rank-card-in">
        <div
          className="cozy-panel relative touch-pan-y select-none p-4 sm:p-5"
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
            Yes! <Emote name="Klappa" size={1} title="" />
          </span>
          <span className="rank-stamp" style={{ right: "1.25rem", color: "var(--coral)", opacity: shown("no"), transform: "rotate(12deg)" }}>
            Nope <Emote name="NoThanks" size={1} title="" />
          </span>
          {gone === "maybe" && (
            <span className="rank-stamp" style={{ left: "50%", translate: "-50% 0", color: "var(--muted)" }}>
              Maybe <Emote name="Hmm" size={1} title="" />
            </span>
          )}
          <HeroCard chatter={chatter} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className={`cozy-btn rank-btn${pressed(held, "ArrowLeft")}`} onClick={() => decide("no")}>
          <Key name="left" label="Left arrow" />
          No
        </button>
        {!again && (
          <button type="button" className={`cozy-btn rank-btn${pressed(held, "ArrowDown", "m")}`} onClick={() => decide("maybe")}>
            <Key name="down" label="Down arrow" />
            Maybe
          </button>
        )}
        <button type="button" className={`cozy-btn primary rank-btn${pressed(held, "ArrowRight")}`} onClick={() => decide("yes")}>
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
  const held = useHeldKey();
  const answered = useRef(false);
  const choose = (c: Choice) => {
    if (picked || answered.current) return;
    answered.current = true;
    setPicked(c);
    if (c === "tie") sfx.tie();
    else sfx.pick();
    setTimeout(() => onChoose(c), reducedMotion() ? 0 : 200);
  };
  useKeydown((e) => {
    // One choice per press: holding a key down doesn't keep answering.
    if (e.repeat || e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowLeft") choose("left");
    else if (e.key === "ArrowRight") choose("right");
    else if (e.key === "ArrowDown" || e.key === "=") choose("tie");
    else return;
    e.preventDefault();
  });
  const placeOf = (id: string) => state.placed.findIndex((g) => g.includes(id)) + 1;
  /** "Unbeaten", or who they lost to, by place. */
  const record = (g: string[]) => {
    const beatenBy = [...new Set(g.flatMap((id) => state.lostTo[id] ?? []))];
    if (!beatenBy.length) return { text: "Unbeaten", emote: "GIGACHAD" };
    return { text: `Lost to ${beatenBy.map((id) => `#${placeOf(id)} ${byId.get(id)!.name}`).join(", ")}`, emote: "PepeHands" };
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
        <span className="cozy-chip flex items-center gap-1.5">
          <Emote name={record(g).emote} size={0.6} title="" />
          {record(g).text}
        </span>
        {g.length > 1 && <span className="cozy-chip green">{g.length} equal</span>}
      </span>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(22rem, 1fr))" }}>
        {g.map((x) => (
          <MatchCard key={x} chatter={byId.get(x)!} />
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
      <p className="flex items-center justify-center gap-3 text-2xl font-black">
        <Emote name="PepoThink" size={1.2} title="" />
        {heading}
      </p>
      <div
        className="rank-pair mx-auto grid items-start gap-4"
        // As wide as the chatters showing need: two alone stay readable, groups spread out.
        style={{ ["--cols" as string]: `${cols(match.left)}fr ${cols(match.right)}fr`, maxWidth: `${(cols(match.left) + cols(match.right)) * 36}rem` }}
      >
        {side(match.left, "left")}
        {side(match.right, "right")}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className={`cozy-btn rank-btn${pressed(held, "ArrowLeft")}`} onClick={() => choose("left")}>
          <Key name="left" label="Left arrow" />
          Left is better
        </button>
        <button type="button" className={`cozy-btn primary rank-btn${pressed(held, "ArrowDown", "=")}`} onClick={() => choose("tie")}>
          <Key name="down" label="Down arrow" />
          Equal
          <Key name="equals" label="Equals" />
        </button>
        <button type="button" className={`cozy-btn rank-btn${pressed(held, "ArrowRight")}`} onClick={() => choose("right")}>
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
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(22rem, 1fr))" }}>
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
              <MatchCard chatter={byId.get(id)!} />
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

/** "November 10, 2020" → whole years since, or null. */
function yearsSince(memberSince: string) {
  const t = Date.parse(memberSince);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}
const yearsText = (y: number) => (y < 1 ? "Under a year" : `${y} year${y === 1 ? "" : "s"}`);

/** destiny.gg's subscriber flair colours, by tier (the site has them for chat names). */
const TIER_COLOR: Record<number, string> = {
  1: "var(--nick-flair13)",
  2: "var(--nick-flair1)",
  3: "var(--nick-flair3)",
  4: "var(--nick-flair8)",
  5: "var(--nick-flair42)",
};
const tierOf = (tier: string | null) => {
  const n = Number(tier?.match(/\d+/)?.[0]);
  return n ? { n, color: TIER_COLOR[n] ?? "var(--nick-subscriber)" } : null;
};
/** The two teams, each with its emote and colour. */
const teamOf = (team: string | null) => {
  const name = team?.replace(/^Team\s+/i, "").trim();
  if (!name) return null;
  if (/^pepe$/i.test(name)) return { name: "PEPE", emote: "PEPE", color: "var(--green)" };
  if (/^yee$/i.test(name)) return { name: "YEE", emote: "YEE", color: "var(--nick-moderator)" };
  return { name, emote: null, color: "var(--header)" };
};
/** destiny.gg's own placeholder bio counts as none. */
const bioOf = (bio: string | null | undefined) => (bio && !/^it'?s a secret/i.test(bio.trim()) ? bio : null);
const tint = (color: string, amount: number) => `color-mix(in oklab, var(--panel), ${color} ${amount}%)`;

/**
 * The hero's emote, as big as `size` but shrunk to fit the panel's width:
 * wide emotes (TornadoVernanda's, Bruhm's) would spill out at full size.
 */
function FitFace({ chatter, size }: { chatter: Chatter; size: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(size);
  useLayoutEffect(() => {
    setFit(size);
    const measure = () => {
      const outer = box.current;
      const inner = outer?.querySelector(".emote, img") as HTMLElement | null;
      if (!outer || !inner) return;
      const room = outer.clientWidth;
      const wide = inner.getBoundingClientRect().width;
      if (wide > room && wide > 0) setFit((f) => (f * room) / wide);
    };
    measure();
    // The emote stylesheet may still be on its way.
    const t = setTimeout(measure, 300);
    return () => clearTimeout(t);
  }, [chatter.id, size]);
  return (
    <div ref={box} className="rank-bob flex h-36 w-full items-center justify-center overflow-hidden">
      <Face chatter={chatter} size={fit} />
    </div>
  );
}

/** A coloured tile with a label. */
function Tile({ label, color, className = "", children }: { label: string; color?: string; className?: string; children: React.ReactNode }) {
  const c = color ?? "var(--panel-border)";
  return (
    <div className={`rounded-[16px] border-2 px-4 py-3 ${className}`} style={{ background: color ? tint(c, 12) : "var(--cream)", borderColor: color ? tint(c, 45) : "var(--panel-border)" }}>
      <div className="text-sm font-bold" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Empty, said kindly, with an emote. */
function Nothing({ text, emote, size = 0.8 }: { text: string; emote: string; size?: number }) {
  return (
    <span className="flex items-center gap-2 font-semibold" style={{ color: "var(--muted)" }}>
      <Emote name={emote} size={size} title="" />
      {text}
    </span>
  );
}

/**
 * The swipe card, with the room of one person: a hero panel tinted by their
 * team (their emote, bobbing; their name; the profile link with their photo),
 * and coloured tiles for everything their destiny.gg profile shows (bar
 * nationality, gender and age, which the site never reads). Tiers wear
 * destiny.gg's flair colours; teams their emote.
 */
function HeroCard({ chatter }: { chatter: Chatter }) {
  const p = useProfile(chatter.profile);
  const team = teamOf(p?.team ?? null);
  const tier = tierOf(p?.tier ?? null);
  const bio = bioOf(p?.bio);
  const years = p?.memberSince ? yearsSince(p.memberSince) : null;
  const hue = team?.color ?? "var(--primary)";
  return (
    <div className="grid gap-4 lg:min-h-[26rem] lg:grid-cols-[19rem_1fr]">
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 px-5 py-6 text-center"
        style={{ background: tint(hue, 22), borderColor: tint(hue, 50) }}
      >
        <FitFace chatter={chatter} size={4} />
        <div
          className={`font-black leading-tight [overflow-wrap:anywhere] ${chatter.name.length > 13 ? "text-2xl" : chatter.name.length > 10 ? "text-3xl" : "text-4xl"}`}
        >
          {chatter.name}
        </div>
        {chatter.emote && (
          <div className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            <Trademark />: <b>{chatter.emote}</b>
          </div>
        )}
        {p?.url && (
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-2 text-sm font-bold underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p.photoUrl && <img src={p.photoUrl} alt="" title="Profile photo" className="h-7 w-7 rounded-full object-cover" />}
            destiny.gg profile ↗
          </a>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {p === undefined && (
          <Tile label="Profile">
            <span className="font-semibold" style={{ color: "var(--muted)" }}>
              Loading the profile…
            </span>
          </Tile>
        )}
        {p === null && (
          <Tile label="Profile">
            <Nothing text="No destiny.gg profile found under this name." emote="Hmm" />
          </Tile>
        )}
        {p && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label="Subscription" color={tier?.color}>
                {tier ? (
                  <div className="text-2xl font-black" style={{ color: tier.color }}>
                    Tier {tier.n}
                  </div>
                ) : (
                  <div className="text-xl font-bold" style={{ color: "var(--muted)" }}>
                    Not subscribed
                  </div>
                )}
              </Tile>
              <Tile label="Team" color={team?.color}>
                {team ? (
                  <div className="flex items-center gap-2 text-2xl font-black" style={{ color: team.color }}>
                    {team.emote && <Emote name={team.emote} size={1} title="" />}
                    {team.name}
                  </div>
                ) : (
                  <div className="text-xl font-bold" style={{ color: "var(--muted)" }}>
                    No team
                  </div>
                )}
              </Tile>
              <Tile label="Member since" color="var(--header)">
                <div className="hand text-3xl font-bold leading-none">{years === null ? "?" : yearsText(years)}</div>
                <div className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                  {p.memberSince ?? "Unknown"}
                </div>
              </Tile>
            </div>
            <Tile label="Bio" className="min-h-[5.5rem]">
              {bio ? (
                <p className="whitespace-pre-line text-lg font-semibold [overflow-wrap:anywhere]">{bio}</p>
              ) : (
                <Nothing text="No bio" emote="SHRUGSTINY" size={1} />
              )}
            </Tile>
            <Tile label="Signature" className="flex flex-1 flex-col">
              {p.signatureSvg ? (
                <div
                  className="relative mt-1 min-h-28 flex-1 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:h-full [&_svg]:w-full"
                  style={{ color: "var(--text)" }}
                  // Rebuilt by the server from path data only (src/server/dgg-profile.ts).
                  dangerouslySetInnerHTML={{ __html: p.signatureSvg }}
                />
              ) : (
                <div className="flex min-h-28 flex-1 items-center justify-center">
                  <Nothing text="No signature" emote="Hmm" size={1} />
                </div>
              )}
            </Tile>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A chatter in a match: the swipe card, smaller. A band tinted by their team
 * (emote, name, profile link), then the same coloured tiles. The tiles go in
 * a row of three when the card is wide enough (a container query), else
 * stack, so groups of equals in columns still fit.
 */
function MatchCard({ chatter }: { chatter: Chatter }) {
  const p = useProfile(chatter.profile);
  const team = teamOf(p?.team ?? null);
  const tier = tierOf(p?.tier ?? null);
  const bio = bioOf(p?.bio);
  const years = p?.memberSince ? yearsSince(p.memberSince) : null;
  const hue = team?.color ?? "var(--primary)";
  return (
    <div className="@container min-w-0 space-y-3">
      <div className="flex items-center gap-4 rounded-[18px] border-2 p-3" style={{ background: tint(hue, 22), borderColor: tint(hue, 50) }}>
        <div className="rank-bob flex h-20 min-w-20 max-w-48 shrink-0 items-center justify-center overflow-hidden">
          <Face chatter={chatter} size={2.2} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="text-3xl font-black leading-tight [overflow-wrap:anywhere]">{chatter.name}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {p?.photoUrl && <img src={p.photoUrl} alt="" title="Profile photo" className="h-7 w-7 rounded-full object-cover" />}
            {p?.url && (
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-bold underline" onClick={(e) => e.stopPropagation()}>
                destiny.gg profile ↗
              </a>
            )}
            {chatter.emote && (
              <span className="font-semibold" style={{ color: "var(--muted)" }}>
                · <Trademark />: <b>{chatter.emote}</b>
              </span>
            )}
          </div>
        </div>
      </div>
      {p === undefined && <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>Loading the profile…</p>}
      {p === null && (
        <Tile label="Profile">
          <Nothing text="No destiny.gg profile found under this name." emote="Hmm" />
        </Tile>
      )}
      {p && (
        <>
          <div className="grid gap-2 @sm:grid-cols-3">
            <Tile label="Subscription" color={tier?.color}>
              {tier ? (
                <div className="text-xl font-black" style={{ color: tier.color }}>
                  Tier {tier.n}
                </div>
              ) : (
                <div className="font-bold" style={{ color: "var(--muted)" }}>
                  Not subscribed
                </div>
              )}
            </Tile>
            <Tile label="Team" color={team?.color}>
              {team ? (
                <div className="flex items-center gap-2 text-xl font-black" style={{ color: team.color }}>
                  {team.emote && <Emote name={team.emote} size={0.8} title="" />}
                  {team.name}
                </div>
              ) : (
                <div className="font-bold" style={{ color: "var(--muted)" }}>
                  No team
                </div>
              )}
            </Tile>
            <Tile label="Member since" color="var(--header)">
              <div className="hand text-2xl font-bold leading-none">{years === null ? "?" : yearsText(years)}</div>
              <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                {p.memberSince ?? "Unknown"}
              </div>
            </Tile>
          </div>
          <Tile label="Bio">
            {bio ? (
              <p className="whitespace-pre-line font-semibold [overflow-wrap:anywhere]">{bio}</p>
            ) : (
              <Nothing text="No bio" emote="SHRUGSTINY" size={0.8} />
            )}
          </Tile>
          <Tile label="Signature">
            {p.signatureSvg ? (
              <div
                className="relative mt-1 h-20 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:h-full [&_svg]:w-full"
                style={{ color: "var(--text)" }}
                // Rebuilt by the server from path data only (src/server/dgg-profile.ts).
                dangerouslySetInnerHTML={{ __html: p.signatureSvg }}
              />
            ) : (
              <div className="flex h-20 items-center justify-center">
                <Nothing text="No signature" emote="Hmm" size={0.9} />
              </div>
            )}
          </Tile>
        </>
      )}
    </div>
  );
}

/**
 * The final list: places shared by equals (1, 2, 2, 4), each one's points, and
 * who didn't make it.
 */
export function Final({ result, byId, top, title }: { result: Ranking; byId: Map<string, Chatter>; top: number; title?: string }) {
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
        <h2 className="text-xl font-black">{title ?? `Your top ${top}`}</h2>
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
