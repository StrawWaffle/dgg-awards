import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { annotate } from "rough-notation";
import { originOf, useBursts } from "@/lab/Bursts";
import { type Clip, ClipPlayer, nomineeClip } from "@/lab/ClipPlayer";
import { Emote } from "@/lab/Emote";
import { cssVar } from "@/lab/sketch";
import { type Chatter, Final, TopTen } from "@/lab/RankChatters";
import { inARound, nextOpening, votableNow, windowOf } from "@/lib/rounds";
import type { Places } from "@/lib/voting";
import type { Me, SiteConfig } from "@/site/Site";
import { PointsTutorial, RankedTutorial } from "@/site/VoteTutorial";

type Nominee = { id: string; title: string; description: string; image: string | null; emote: string | null; clip: Clip | null };
type Award = {
  id: string;
  title: string;
  description: string;
  ranked: boolean;
  points: boolean;
  nominees: Nominee[];
  /** Rounds (src/lib/rounds.ts): its round, own dates, and how many a voter may rank. */
  round: string | null;
  opensAt: number | null;
  closesAt: number | null;
  rankLimit: number | null;
};

const toAwards = (data: any[]): Award[] =>
  data
    .filter((c) => !c.hidden)
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description ?? "",
      ranked: c.votingStyle === "ranked",
      // A top 10 with points: made by swiping, then comparing (TopTen).
      points: c.votingStyle === "points",
      round: c.round ?? null,
      opensAt: c.opensAt ?? null,
      closesAt: c.closesAt ?? null,
      rankLimit: c.rankLimit ?? null,
      nominees: c.options.map((o: any) => ({
        id: o.id,
        title: o.title,
        description: o.description ?? "",
        image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
        emote: o.emote ?? null,
        clip: nomineeClip(o, o.title),
      })),
    }));

const seconds = (s?: string) => (s && Number(s) > 0 ? Number(s) * 1000 : null);
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

/**
 * The voting page: one award at a time, with the ballot on the side. Pick one
 * nominee, rank several for ranked awards, or make a top 10 for points awards
 * (swipe through everyone, then compare the finalists), then cast the vote: it's final
 * (the server takes one ballot per award). Emotes react: Klappa on a pick and
 * a cast, Skip on a skip, a cheer at the end.
 *
 * Voting happens only while it's open (Settings: voting mode and dates) and
 * signed in. Admins can go through it in the "Voting open" preview
 * (`/preview/voting/vote`; nothing is saved); without it they see what
 * visitors see. In a preview, `config` is the previewed stage's.
 */
export function VotePage({
  me,
  config,
  preview,
  onHome,
  onResults,
}: {
  me: Me | undefined;
  config: SiteConfig | null;
  preview: boolean;
  onHome: (e: React.MouseEvent) => void;
  onResults: (e: React.MouseEvent) => void;
}) {
  const admin = !!me?.admin;
  const now = Date.now();
  const start = seconds(config?.startTime);
  const rounds = config?.rounds ?? [];

  const [awards, setAwards] = useState<Award[] | null | "locked">(null);
  const [voted, setVoted] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (me === undefined || !config) return;
    // Admins load from the admin list, so a locked site can still be previewed.
    fetch(admin ? "/api/admin/nominees" : "/api/nominees")
      .then((r) => (r.headers.get("content-type")?.includes("json") ? r.json() : "locked"))
      .then((d) => setAwards(d === "locked" ? "locked" : toAwards(d)))
      .catch(() => setAwards([]));
    if (me && !preview) {
      fetch("/api/vote/ballots")
        .then((r) => (r.ok ? r.json() : {}))
        .then(setVoted)
        .catch(() => {});
    }
  }, [me, config, admin, preview]);

  if (me === undefined || !config || awards === null) return <div className="cozy-panel p-8">Loading…</div>;

  // What can be voted on now, as the server decides it (src/lib/rounds.ts):
  // during a round, only its awards, on a page of their own.
  const list = awards === "locked" ? [] : awards;
  const votable = votableNow(
    list.map((a) => ({ ...a, nominees: a.nominees.length })),
    config,
    now / 1000,
  ).map((t) => list.find((a) => a.id === t.id)!);
  const open = votable.length > 0;
  const round = votable.find((a) => inARound(a))?.round ?? null;
  const roundEnd = round ? Math.max(...votable.map((a) => windowOf({ ...a, nominees: a.nominees.length }, config).closesAt ?? 0)) * 1000 : null;
  const end = roundEnd ?? seconds(config?.endTime);
  const next = nextOpening(config, rounds, now / 1000);

  // Visitors outside voting: say when, instead of the ballot.
  if (!preview && !open) {
    const reviewing = config.viewingMode === "reviewing";
    return (
      <div className="cozy-panel mx-auto max-w-2xl space-y-4 p-8 text-center">
        <Emote name={reviewing ? "CHEERSTINY" : "PepoG"} size={1.6} title="" />
        <p className="text-2xl font-black">
          {reviewing
            ? "Voting is over: the results are out."
            : next
              ? `${next.name ? `${next.name} voting` : "Voting"} opens ${when(next.at * 1000)}.`
              : end && now >= end
                ? "Voting has closed."
                : start && now < start
                  ? `Voting opens ${when(start)}.`
                  : "Voting isn't open yet."}
        </p>
        <a className="cozy-btn primary" href={reviewing ? "/results" : "/"} onClick={reviewing ? onResults : onHome}>
          {reviewing ? "See the results" : "Back to the front page"}
        </a>
      </div>
    );
  }
  if (awards === "locked" || awards.length === 0) {
    return <div className="cozy-panel p-8">No awards to vote on yet.</div>;
  }
  // A preview goes through every award; visitors get what's open now.
  const shown = preview ? list : votable;
  return (
    <>
      {!preview && round && (
        <div className="cozy-panel mb-4 flex flex-wrap items-center gap-3 px-5 py-3" style={{ background: "var(--highlight)" }}>
          <span className="cozy-chip coral">{round}</span>
          <span className="font-semibold">
            This round has its own vote{roundEnd ? `, open until ${when(roundEnd)}` : ""}. The other awards open later.
          </span>
        </div>
      )}
      <Ballot awards={shown} me={me} preview={preview} voted={voted} setVoted={setVoted} end={end} />
    </>
  );
}

function Ballot({
  awards,
  me,
  preview,
  voted,
  setVoted,
  end,
}: {
  awards: Award[];
  me: Me;
  preview: boolean;
  voted: Record<string, string[]>;
  setVoted: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  end: number | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  // Start at the first award not voted on yet.
  const [step, setStep] = useState(() => Math.max(0, awards.findIndex((a) => !voted[a.id])));
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<Clip | null>(null);
  // The how-it-works steps passed this visit (VoteTutorial.tsx).
  const [explained, setExplained] = useState<Set<"ranked" | "points">>(new Set());
  // Points ballots as cast (groups of equals), to show them back.
  const [places, setPlaces] = useState<Record<string, Places>>({});
  useEffect(() => {
    if (preview || !me || !awards.some((a) => a.points && voted[a.id])) return;
    fetch("/api/vote/places")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setPlaces)
      .catch(() => {});
  }, [preview, me, awards, voted]);

  const done = step >= awards.length;
  const award = awards[step];
  const mine = award ? voted[award.id] : undefined;
  const chosen = award ? (mine ?? picks[award.id] ?? []) : [];
  const votedCount = awards.filter((a) => voted[a.id]).length;
  // Before a ranked award or a top 10 not voted on yet, how it works, once a visit.
  const kind = award && !mine ? (award.points ? "points" : award.ranked ? "ranked" : null) : null;
  const explaining = kind !== null && !explained.has(kind) ? kind : null;
  const explain = (k: "ranked" | "points", on: boolean) =>
    setExplained((s) => {
      const next = new Set(s);
      if (on) next.delete(k);
      else next.add(k);
      return next;
    });

  // A single pick gets a box drawn round it by hand.
  useEffect(() => {
    if (!award || award.ranked || chosen.length !== 1 || !grid.current) return;
    const card = grid.current.querySelector<HTMLElement>(`[data-nominee="${CSS.escape(chosen[0]!)}"]`);
    if (!card) return;
    const a = annotate(card, { type: "box", color: cssVar("--primary-shadow"), strokeWidth: 3, padding: 4, animationDuration: 500 });
    a.show();
    return () => a.remove();
  }, [award, chosen.join()]);

  // Keep the current award in view in the ballot list, which scrolls on its own.
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    const item = el?.querySelector<HTMLElement>("[aria-current=step]") ?? (done ? (el?.lastElementChild as HTMLElement | null) : null);
    if (!el || !item) return;
    const box = el.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) el.scrollTo({ top: el.scrollTop + (r.top - box.top) - box.height / 3, behavior: "smooth" });
  }, [step, done]);

  const go = (i: number) => {
    setError(null);
    setStep(i);
    box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const choose = (e: React.MouseEvent, id: string) => {
    if (!award || mine) return;
    setError(null);
    const current = picks[award.id] ?? [];
    if (award.ranked && award.rankLimit && !current.includes(id) && current.length >= award.rankLimit) {
      setError(`You can rank up to ${award.rankLimit}. Take one out to change your picks.`);
      return;
    }
    const next = award.ranked ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id];
    setPicks({ ...picks, [award.id]: next });
    if (!current.includes(id)) fire("Klappa", ...originOf(e, box.current), award.ranked ? 3 : 6);
  };
  const cast = async (e: React.MouseEvent, top?: Places) => {
    if (!award || (top ? top.length === 0 : chosen.length === 0)) return;
    const [x, y] = originOf(e, box.current);
    setCasting(true);
    setError(null);
    try {
      if (!preview) {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            top
              ? { category_id: award.id, places: top }
              : award.ranked
                ? { category_id: award.id, ranking: chosen }
                : { category_id: award.id, nominee_id: chosen[0] },
          ),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            // The server answers 401 both when signed out and when voting is closed.
            res.status === 401
              ? me
                ? "Voting isn't open right now, or your sign-in has expired: reload the page."
                : "Sign in to vote."
              : text || "Couldn't cast your vote. Try again.",
          );
        }
      }
      setVoted((v) => ({ ...v, [award.id]: top ? top.flat() : chosen }));
      if (top) {
        setPlaces((p) => ({ ...p, [award.id]: top }));
        try {
          localStorage.removeItem(topTenKey(award.id, preview));
        } catch {}
      }
      fire("CHEERSTINY", x, y, 6);
      setTimeout(() => fire("Klappa", x + 60, y, 6), 200);
      setTimeout(() => go(step + 1), 900);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCasting(false);
    }
  };

  return (
    <div className="space-y-4">
      {preview && (
        <div className="cozy-panel flex flex-wrap items-center gap-3 px-5 py-3" style={{ background: "var(--highlight)" }}>
          <span className="cozy-chip coral">Preview</span>
          <span className="font-semibold">The voting page as voters will see it. Votes cast here aren't saved.</span>
        </div>
      )}
      {!preview && !me && (
        <div className="cozy-panel flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="font-semibold">Sign in with your destiny.gg account to vote. You can look around first.</span>
          <a className="cozy-btn primary ml-auto" href="/signin?next=/vote">
            Sign in
          </a>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <Dialog.Root open={!!watching} onOpenChange={(o) => !o && setWatching(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Content
              className="cozy-panel lab-pop fixed top-1/2 left-1/2 z-50 w-[min(880px,94vw)] -translate-x-1/2 -translate-y-1/2 space-y-3 p-5"
              aria-describedby={undefined}
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-xl font-black">{watching?.title}</Dialog.Title>
                <Dialog.Close className="cozy-btn">Close</Dialog.Close>
              </div>
              {watching && <ClipPlayer clip={watching} />}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* The ballot: every award, what's done, and where you are. */}
        <aside className="cozy-panel h-fit p-3 md:sticky md:top-[calc(var(--lab-header,64px)+1rem)]">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="font-black">Your ballot</span>
            <span className="cozy-chip">
              {votedCount}/{awards.length}
            </span>
          </div>
          <ol ref={list} className="max-h-[60vh] space-y-1 overflow-y-auto">
            {awards.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  className="cozy-row flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold"
                  style={step === i ? { background: "var(--highlight)" } : undefined}
                  aria-current={step === i ? "step" : undefined}
                >
                  <span>{a.title}</span>
                  {voted[a.id] && <Emote name="Klappa" size={0.5} title="Voted" />}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => go(awards.length)}
                className="cozy-row w-full rounded-2xl px-3 py-2 text-left text-sm font-bold"
                style={done ? { background: "var(--highlight)" } : undefined}
              >
                Finish
              </button>
            </li>
          </ol>
          {end && (
            <p className="px-2 pt-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
              Voting closes {when(end)}.
            </p>
          )}
        </aside>

        <section ref={box} className="cozy-panel relative min-h-[28rem] scroll-mt-[calc(var(--lab-header,64px)+1rem)] overflow-hidden p-6">
          {layer}
          {explaining === "ranked" && <RankedTutorial onDone={() => explain("ranked", false)} />}
          {explaining === "points" && <PointsTutorial onDone={() => explain("points", false)} />}
          {award && !explaining && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className="cozy-chip coral">
                  Award {step + 1} of {awards.length}
                </span>
                <span className="cozy-chip">{award.points ? "Your top 10" : award.ranked ? (award.rankLimit ? `Rank your top ${award.rankLimit}` : "Rank as many as you like") : "Pick one"}</span>
                <span className="cozy-chip green">{award.nominees.length} nominees</span>
                {mine && <span className="cozy-chip green">Voted</span>}
              </div>
              <div>
                <h2 className="text-3xl font-black">{award.title}</h2>
                {award.description && (
                  <p className="mt-1 font-semibold" style={{ color: "var(--muted)" }}>
                    {award.description}
                  </p>
                )}
                {award.ranked && !mine && (
                  <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                    {award.nominees.some((n) => n.clip)
                      ? "Click a clip to watch it. Rank them in order, your favourite first; press again to take one out."
                      : "Click them in order: your favourite first. Click again to take one out."}{" "}
                    <button type="button" className="underline" onClick={() => explain("ranked", true)}>
                      How does this work?
                    </button>
                  </p>
                )}
                {award.points && !mine && (
                  <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                    Swipe through everyone (yes, no or maybe), then pick between your yeses two at a time. Your top 10
                    gets points: 10 for first down to 1 for tenth, shared by any you rank equal. Everyone's points are
                    added up. Your progress is kept in this browser until you cast it.{" "}
                    <button type="button" className="underline" onClick={() => explain("points", true)}>
                      How does this work?
                    </button>
                  </p>
                )}
              </div>

              {award.points && (
                <PointsBallot
                  award={award}
                  admin={!!me?.admin}
                  preview={preview}
                  mine={mine ? (places[award.id] ?? mine.map((id) => [id])) : null}
                  canCast={!!me || preview}
                  casting={casting}
                  onCast={cast}
                />
              )}

              {!award.points && (
              <div ref={grid} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {award.nominees.map((n) => {
                  const rank = chosen.indexOf(n.id);
                  const on = rank >= 0;
                  return (
                    <NomineeCard
                      key={n.id}
                      nominee={n}
                      rank={award.ranked && on ? rank + 1 : null}
                      on={on}
                      mine={!!mine}
                      single={!award.ranked}
                      onChoose={(e) => choose(e, n.id)}
                      onWatch={() => n.clip && setWatching(n.clip)}
                    />
                  );
                })}
              </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="cozy-btn"
                  onClick={(e) => {
                    if (!mine) fire("Skip", ...originOf(e, box.current), 3);
                    go(step + 1);
                  }}
                >
                  {mine ? "Next award" : "Skip for now"}
                </button>
                {!mine && award.ranked && chosen.length > 0 && (
                  <button type="button" className="cozy-btn" onClick={() => setPicks({ ...picks, [award.id]: [] })}>
                    Clear
                  </button>
                )}
                {!mine &&
                  !award.points &&
                  (me || preview ? (
                    <button type="button" className="cozy-btn primary" disabled={chosen.length === 0 || casting} onClick={cast}>
                      {casting ? "Casting…" : award.ranked && chosen.length > 1 ? `Cast my ranking (${chosen.length})` : "Cast my vote"}
                    </button>
                  ) : (
                    <a className="cozy-btn primary" href="/signin?next=/vote">
                      Sign in to vote
                    </a>
                  ))}
                {!mine && !award.points && (
                  <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                    Votes are final.
                  </span>
                )}
              </div>
              {error && <p className="font-semibold" style={{ color: "var(--coral)" }}>{error}</p>}
            </div>
          )}

          {done && (
            <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 text-center">
              <div className="flex gap-4">
                <Emote name="CHEERSTINY" size={1.6} />
                <Emote name="Klappa" size={1.6} />
                <Emote name="widepeepoHappy" size={1.6} />
              </div>
              {votedCount === awards.length ? (
                <>
                  <h2 className="text-3xl font-black">Thanks for voting!</h2>
                  <p className="font-semibold" style={{ color: "var(--muted)" }}>
                    You voted in all {awards.length} awards. The winners are revealed on stream.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-black">
                    {votedCount === 0 ? "Nothing voted yet" : `You voted in ${votedCount} of ${awards.length} awards`}
                  </h2>
                  <p className="font-semibold" style={{ color: "var(--muted)" }}>
                    The rest are still open until voting closes.
                  </p>
                  <button type="button" className="cozy-btn primary" onClick={() => go(awards.findIndex((a) => !voted[a.id]))}>
                    Go to the next open award
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Where a points award's top 10 in progress is kept in this browser. */
const topTenKey = (awardId: string, preview: boolean) => `${preview ? "preview" : "vote"}.top10.${awardId}`;

/**
 * A points award's ballot: the top 10 maker (swipe, then compare), then the
 * finished list with Cast. Once cast, the list as cast.
 */
/**
 * One nominee on a pick or ranked award. Clicking it picks it, except when it
 * has a clip: then clicking plays the clip and a button underneath picks it.
 */
function NomineeCard({
  nominee: n,
  rank,
  on,
  mine,
  single,
  onChoose,
  onWatch,
}: {
  nominee: Nominee;
  rank: number | null;
  on: boolean;
  mine: boolean;
  single: boolean;
  onChoose: (e: React.MouseEvent) => void;
  onWatch: () => void;
}) {
  const clip = !!n.clip;
  const frame = {
    background: "var(--cream)",
    borderColor: on ? "var(--primary-shadow)" : "var(--panel-border)",
    boxShadow: `0 5px 0 ${on ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
    opacity: mine && !on ? 0.55 : 1,
  };
  const body = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[14px]" style={{ background: "var(--panel-border)" }}>
        {n.image ? (
          <img src={n.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          n.emote && (
            <span className="flex h-full w-full items-center justify-center" style={{ background: "var(--cream)" }}>
              <Emote name={n.emote} size={2.4} />
            </span>
          )
        )}
        {clip && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full pl-1 text-xl transition-transform group-hover:scale-110"
              style={{ background: "var(--coral)", color: "var(--primary-text)" }}
              aria-hidden
            >
              ▶
            </span>
          </span>
        )}
        {rank !== null && (
          <span
            className="hand absolute top-2 left-2 flex h-9 w-9 items-center justify-center rounded-full text-2xl font-bold"
            style={{ background: "var(--primary)", color: "var(--primary-text)" }}
          >
            {rank}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-1 pt-2">
        <span className="font-extrabold leading-tight">{n.title}</span>
        {on && single && (!clip || mine) && <span className="cozy-chip green shrink-0">{mine ? "Your vote" : "Your pick"}</span>}
      </div>
      {n.description && (
        <p className="line-clamp-2 px-1 pt-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          {n.description}
        </p>
      )}
    </>
  );

  if (!clip) {
    return (
      <button
        data-nominee={n.id}
        type="button"
        onClick={onChoose}
        disabled={mine}
        className={`${mine ? "" : "cozy-card"} group block h-full w-full rounded-[20px] border-2 p-2 text-left active:translate-y-[3px] disabled:cursor-default`}
        style={frame}
        aria-pressed={on}
      >
        {body}
      </button>
    );
  }

  return (
    <div data-nominee={n.id} className="flex h-full flex-col rounded-[20px] border-2 p-2" style={frame}>
      <button
        type="button"
        onClick={onWatch}
        className="group flex flex-1 cursor-pointer flex-col justify-start text-left"
        aria-label={`Watch the clip of ${n.title}`}
      >
        {body}
      </button>
      {!mine && (
        <button
          type="button"
          className={`cozy-btn mt-2 justify-center ${on ? "primary" : ""}`}
          onClick={onChoose}
          aria-pressed={on}
        >
          {on ? (single ? "Picked" : `Ranked #${rank} · take out`) : single ? "Pick this" : "Rank this"}
        </button>
      )}
    </div>
  );
}

function PointsBallot({
  award,
  admin,
  preview,
  mine,
  canCast,
  casting,
  onCast,
}: {
  award: Award;
  admin: boolean;
  preview: boolean;
  mine: Places | null;
  canCast: boolean;
  casting: boolean;
  onCast: (e: React.MouseEvent, top: Places) => void;
}) {
  const chatters: Chatter[] = award.nominees
    .map((n) => {
      const name = n.title.replace(/^\d+\.\s*/, "").trim();
      return {
        id: n.id,
        name,
        emote: n.emote,
        image: n.image,
        // Admins (and previews) read profiles from the admin route; voters from the award's.
        profile: !name ? null : admin ? `/api/admin/dgg-profile/${encodeURIComponent(name)}` : `/api/nominees/${encodeURIComponent(award.id)}/${encodeURIComponent(n.id)}/profile`,
      };
    })
    .filter((c) => c.name);
  const byId = new Map(chatters.map((c) => [c.id, c]));
  if (mine) {
    return (
      <div className="space-y-2">
        <Final result={mine.filter((g) => g.every((id) => byId.has(id)))} byId={byId} top={10} title="Your top 10, as cast" />
      </div>
    );
  }
  return (
    <TopTen
      chatters={chatters}
      storageKey={topTenKey(award.id, preview)}
      title="Your top 10"
      done={(top) => (
        <div className="cozy-panel flex flex-wrap items-center gap-3 px-5 py-4">
          {canCast ? (
            <button type="button" className="cozy-btn primary" disabled={casting || top.length === 0} onClick={(e) => onCast(e, top)}>
              {casting ? "Casting…" : "Cast my top 10"}
            </button>
          ) : (
            <a className="cozy-btn primary" href="/signin?next=/vote">
              Sign in to vote
            </a>
          )}
          <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Votes are final. Not happy with it? Step back, or start over, before you cast.
          </span>
        </div>
      )}
    />
  );
}
