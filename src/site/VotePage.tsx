import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { annotate } from "rough-notation";
import { originOf, useBursts } from "@/lab/Bursts";
import { type Clip, ClipPlayer, nomineeClip } from "@/lab/ClipPlayer";
import { Emote } from "@/lab/Emote";
import { cssVar, useDrawnLook } from "@/lab/sketch";
import type { Me, SiteConfig } from "@/site/Site";

type Nominee = { id: string; title: string; description: string; image: string | null; clip: Clip | null };
type Award = { id: string; title: string; description: string; ranked: boolean; nominees: Nominee[] };

const toAwards = (data: any[]): Award[] =>
  data
    .filter((c) => !c.hidden)
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description ?? "",
      ranked: c.votingStyle === "ranked",
      nominees: c.options.map((o: any) => ({
        id: o.id,
        title: o.title,
        description: o.description ?? "",
        image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
        clip: nomineeClip(o, o.title),
      })),
    }));

const seconds = (s?: string) => (s && Number(s) > 0 ? Number(s) * 1000 : null);
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

/**
 * The voting page: one award at a time, with the ballot on the side. Pick one
 * nominee, or rank several for ranked awards, then cast the vote: it's final
 * (the server takes one ballot per award). Emotes react: Klappa on a pick and
 * a cast, Skip on a skip, a cheer at the end.
 *
 * Voting happens only while it's open (Settings: voting mode and dates) and
 * signed in. Admins can go through it as a preview with `?preview=voting`
 * (nothing is saved); without it they see what visitors see.
 */
export function VotePage({ me, config, onHome }: { me: Me | undefined; config: SiteConfig | null; onHome: (e: React.MouseEvent) => void }) {
  const admin = !!me?.admin;
  const now = Date.now();
  const start = seconds(config?.startTime);
  const end = seconds(config?.endTime);
  // As the server decides it: voting mode, and between both dates.
  const open = config?.viewingMode === "voting" && !!start && !!end && now >= start && now <= end;
  const preview = admin && new URLSearchParams(location.search).get("preview") === "voting";

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

  // Visitors outside voting: say when, instead of the ballot.
  if (!preview && !open) {
    const reviewing = config.viewingMode === "reviewing";
    return (
      <div className="cozy-panel mx-auto max-w-2xl space-y-4 p-8 text-center">
        <Emote name={reviewing ? "CHEERSTINY" : "PepoG"} size={1.6} title="" />
        <p className="text-2xl font-black">
          {reviewing
            ? "Voting is over: the results are out."
            : end && now >= end
              ? "Voting has closed."
              : start && now < start
                ? `Voting opens ${when(start)}.`
                : "Voting isn't open yet."}
        </p>
        <a className="cozy-btn primary" href={reviewing ? "/results" : "/"} onClick={reviewing ? undefined : onHome}>
          {reviewing ? "See the results" : "Back to the front page"}
        </a>
      </div>
    );
  }
  if (awards === "locked" || awards.length === 0) {
    return <div className="cozy-panel p-8">No awards to vote on yet.</div>;
  }
  return <Ballot awards={awards} me={me} preview={preview} voted={voted} setVoted={setVoted} end={end} />;
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
  const drawn = useDrawnLook();

  const done = step >= awards.length;
  const award = awards[step];
  const mine = award ? voted[award.id] : undefined;
  const chosen = award ? (mine ?? picks[award.id] ?? []) : [];
  const votedCount = awards.filter((a) => voted[a.id]).length;

  // In the drawn look, a single pick gets a box drawn round it by hand.
  useEffect(() => {
    if (!drawn || !award || award.ranked || chosen.length !== 1 || !grid.current) return;
    const card = grid.current.querySelector<HTMLElement>(`[data-nominee="${CSS.escape(chosen[0]!)}"]`);
    if (!card) return;
    const a = annotate(card, { type: "box", color: cssVar("--primary-shadow"), strokeWidth: 3, padding: 4, animationDuration: 500 });
    a.show();
    return () => a.remove();
  }, [drawn, award, chosen.join()]);

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
    const next = award.ranked ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id];
    setPicks({ ...picks, [award.id]: next });
    if (!current.includes(id)) fire("Klappa", ...originOf(e, box.current), award.ranked ? 3 : 6);
  };
  const cast = async (e: React.MouseEvent) => {
    if (!award || chosen.length === 0) return;
    const [x, y] = originOf(e, box.current);
    setCasting(true);
    setError(null);
    try {
      if (!preview) {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(award.ranked ? { category_id: award.id, ranking: chosen } : { category_id: award.id, nominee_id: chosen[0] }),
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
      setVoted((v) => ({ ...v, [award.id]: chosen }));
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
          {award && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className="cozy-chip coral">
                  Award {step + 1} of {awards.length}
                </span>
                <span className="cozy-chip">{award.ranked ? "Rank as many as you like" : "Pick one"}</span>
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
                    Click them in order: your favourite first. Click again to take one out.
                  </p>
                )}
              </div>

              <div ref={grid} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {award.nominees.map((n) => {
                  const rank = chosen.indexOf(n.id);
                  const on = rank >= 0;
                  return (
                    <div key={n.id} className="relative">
                      <button
                        data-nominee={n.id}
                        type="button"
                        onClick={(e) => choose(e, n.id)}
                        disabled={!!mine}
                        className={`${mine ? "" : "cozy-card"} group block h-full w-full rounded-[20px] border-2 p-2 text-left active:translate-y-[3px] disabled:cursor-default`}
                        style={{
                          background: "var(--cream)",
                          borderColor: on ? "var(--primary-shadow)" : "var(--panel-border)",
                          boxShadow: `0 5px 0 ${on ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
                          opacity: mine && !on ? 0.55 : 1,
                        }}
                        aria-pressed={on}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden rounded-[14px]" style={{ background: "var(--panel-border)" }}>
                          {n.image && <img src={n.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
                          {award.ranked && on && (
                            <span
                              className="hand absolute top-2 left-2 flex h-9 w-9 items-center justify-center rounded-full text-2xl font-bold"
                              style={{ background: "var(--primary)", color: "var(--primary-text)" }}
                            >
                              {rank + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 px-1 pt-2">
                          <span className="font-extrabold leading-tight">{n.title}</span>
                          {on && !award.ranked && <span className="cozy-chip green shrink-0">{mine ? "Your vote" : "Your pick"}</span>}
                        </div>
                        {n.description && (
                          <p className="line-clamp-2 px-1 pt-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
                            {n.description}
                          </p>
                        )}
                      </button>
                      {n.clip && (
                        // Beside the card's button, over its picture (a button can't hold another).
                        <button
                          type="button"
                          aria-label={`Watch the clip of ${n.title}`}
                          className="cozy-chip coral absolute top-4 right-4 cursor-pointer"
                          onClick={() => setWatching(n.clip)}
                        >
                          ▶ Clip
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

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
                  (me || preview ? (
                    <button type="button" className="cozy-btn primary" disabled={chosen.length === 0 || casting} onClick={cast}>
                      {casting ? "Casting…" : award.ranked && chosen.length > 1 ? `Cast my ranking (${chosen.length})` : "Cast my vote"}
                    </button>
                  ) : (
                    <a className="cozy-btn primary" href="/signin?next=/vote">
                      Sign in to vote
                    </a>
                  ))}
                {!mine && (
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
