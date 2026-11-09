import { useEffect, useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { Dialog } from "radix-ui";
import { type Clip, ClipPlayer, nomineeClip } from "@/lab/ClipPlayer";
import { cssVar, useDrawnLook } from "@/lab/sketch";
import { annotate } from "rough-notation";

type Nominee = { id: string; title: string; image: string | null; clip: Clip | null };
type Award = { id: string; title: string; description: string; nominees: Nominee[] };
type Choice = { award: string; pick: string | null };

/** How many awards the demo walks through before the survey question. */
const AWARDS = 3;

/**
 * The voting page in the cozy look, on the real nominees (last year's sample
 * data): one award at a time with progress on the side. Emotes react: Klappa
 * when you pick, Skip when you skip, PepoG taking notes on the survey
 * question, and a CHEERSTINY shower at the end. Nothing is actually voted.
 */
export function VoteDemo() {
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [watching, setWatching] = useState<Clip | null>(null);
  const drawn = useDrawnLook();
  const grid = useRef<HTMLDivElement>(null);

  // In the drawn look, your pick gets a box drawn round it by hand.
  useEffect(() => {
    if (!drawn || !picked || !grid.current) return;
    const card = grid.current.querySelector<HTMLElement>(`[data-nominee="${CSS.escape(picked)}"]`);
    if (!card) return;
    const a = annotate(card, { type: "box", color: cssVar("--primary-shadow"), strokeWidth: 3, padding: 4, animationDuration: 500 });
    a.show();
    return () => a.remove();
  }, [picked, drawn, step]);

  useEffect(() => {
    fetch("/api/nominees")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("locked");
        setAwards(
          data.slice(0, AWARDS).map((c: any) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            nominees: c.options.map((o: any) => ({
              id: o.id,
              title: o.title,
              image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
              clip: nomineeClip(o, o.title),
            })),
          })),
        );
      })
      .catch(() => setAwards([]));
  }, []);

  if (awards === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (awards.length === 0) {
    return <div className="cozy-panel p-8">No nominees to show (is the site in locked mode?).</div>;
  }

  const survey = step === awards.length;
  const done = step > awards.length;
  const award = awards[step];
  const next = (pick: string | null) => {
    if (award) setChoices((c) => [...c.filter((x) => x.award !== award.id), { award: award.id, pick }]);
    setPicked(null);
    setStep((s) => s + 1);
  };
  const choiceFor = (id: string) => choices.find((c) => c.award === id);

  return (
    <div className="grid gap-5 md:grid-cols-[260px_1fr]">
      <Dialog.Root open={!!watching} onOpenChange={(open) => !open && setWatching(null)}>
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
      <aside className="cozy-panel h-fit p-3">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="font-black">Your ballot</span>
          <span className="cozy-chip">
            {choices.length}/{awards.length}
          </span>
        </div>
        <ol className="space-y-1">
          {awards.map((a, i) => {
            const c = choiceFor(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(choiceFor(a.id)?.pick ?? null);
                    setStep(i);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold"
                  style={step === i ? { background: "var(--highlight)" } : undefined}
                >
                  <span>{a.title}</span>
                  {c && (c.pick ? <Emote name="Klappa" size={0.5} title="Voted" /> : <span className="cozy-chip">skipped</span>)}
                </button>
              </li>
            );
          })}
          <li className="rounded-2xl px-3 py-2 text-sm font-bold" style={survey ? { background: "var(--highlight)" } : undefined}>
            A quick question
          </li>
        </ol>
      </aside>

      <section ref={box} className="cozy-panel relative min-h-[28rem] overflow-hidden p-6">
        {layer}
        {award && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="cozy-chip coral">Award {step + 1} of {awards.length}</span>
              <span className="cozy-chip">Pick one</span>
              <span className="cozy-chip green">{award.nominees.length} nominees</span>
            </div>
            <div>
              <h2 className="text-3xl font-black">{award.title}</h2>
              <p className="mt-1 font-semibold" style={{ color: "var(--muted)" }}>
                {award.description}
              </p>
            </div>
            <div ref={grid} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {award.nominees.map((n) => {
                const mine = picked === n.id;
                return (
                  <div key={n.id} className="relative">
                  <button
                    data-nominee={n.id}
                    type="button"
                    onClick={(e) => {
                      setPicked(n.id);
                      fire("Klappa", ...originOf(e, box.current), 6);
                    }}
                    className="group block h-full w-full rounded-[20px] border-2 p-2 text-left transition-[translate,box-shadow] active:translate-y-[3px]"
                    style={{
                      background: "var(--cream)",
                      borderColor: mine ? "var(--primary-shadow)" : "var(--panel-border)",
                      boxShadow: `0 5px 0 ${mine ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
                    }}
                    aria-pressed={mine}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[14px]" style={{ background: "var(--panel-border)" }}>
                      {n.image && <img src={n.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1 pt-2">
                      <span className="font-extrabold leading-tight">{n.title}</span>
                      {mine && <span className="cozy-chip green shrink-0">Your pick</span>}
                    </div>
                  </button>
                  {n.clip && (
                    // Beside the card's button, placed over its picture (a button
                    // can't hold another button).
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
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="cozy-btn"
                onClick={(e) => {
                  fire("Skip", ...originOf(e, box.current), 3);
                  next(null);
                }}
              >
                Skip this award
              </button>
              <button type="button" className="cozy-btn primary" disabled={!picked} onClick={() => next(picked)}>
                Next
              </button>
            </div>
          </div>
        )}

        {survey && (
          <div className="max-w-xl space-y-4">
            <span className="cozy-chip coral">Last one</span>
            <h2 className="flex items-center gap-3 text-3xl font-black">
              <Emote name="PepoG" size={1.3} title="Taking notes" /> A quick question
            </h2>
            <label className="block space-y-2 font-bold">
              <span>What was your favourite moment of the year?</span>
              <input value={answer} onChange={(e) => setAnswer(e.currentTarget.value)} className="cozy-input block w-full" />
            </label>
            <button
              type="button"
              className="cozy-btn primary"
              onClick={(e) => {
                const [x, y] = originOf(e, box.current);
                fire("CHEERSTINY", x, y, 10);
                setTimeout(() => fire("Klappa", x + 80, y, 8), 250);
                next(null);
              }}
            >
              Finish
            </button>
          </div>
        )}

        {done && (
          <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 text-center">
            <div className="flex gap-4">
              <Emote name="CHEERSTINY" size={1.6} />
              <Emote name="Klappa" size={1.6} />
              <Emote name="widepeepoHappy" size={1.6} />
            </div>
            <h2 className="text-3xl font-black">Thanks for voting!</h2>
            <p className="font-semibold" style={{ color: "var(--muted)" }}>
              You can change your votes until voting closes.
            </p>
            <button
              type="button"
              className="cozy-btn"
              onClick={() => {
                setStep(0);
                setChoices([]);
                setAnswer("");
              }}
            >
              Start over
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
