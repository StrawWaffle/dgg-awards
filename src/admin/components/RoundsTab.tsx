import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { type AdvancePlan, advanceDgger, fetchAdminNom, fetchAdvancePlan, fetchConfig, saveRoundDates } from "@/lib/queries";

// Rounds (src/lib/rounds.ts): awards that vote on their own dates, on a page
// of their own, before the main vote. DGGer has two (rinlux, 2026-11-20):
// the wildcards (days 1–7) and the group stage (days 8–11); the final, DGG
// Chatter of the Year, is with the main vote (day 12). This tab sets each
// round's dates and advances DGGer from one round to the next, once an admin
// has seen and confirmed who goes through.

const toLocalInput = (seconds?: number | null) => {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? Math.floor(new Date(value).getTime() / 1000) : undefined);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const shown = (seconds?: number | string | null) => (seconds && Number(seconds) > 0 ? dateTime.format(new Date(Number(seconds) * 1000)) : "not set");

export function RoundsTab() {
  const awards = useQuery({ queryKey: ["admin-nominees"], queryFn: fetchAdminNom });
  const config = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  if (awards.isPending || config.isPending) return <p className="text-sm">Loading…</p>;
  if (awards.isError) return <ErrorText>Couldn't load the awards: {awards.error.message}</ErrorText>;
  const rounds = new Map<string, typeof awards.data>();
  for (const a of awards.data) if (a.round) rounds.set(a.round, [...(rounds.get(a.round) ?? []), a]);

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-neutral-600">
        A round votes on its own dates, on a page of its own: while one is open, nothing else can be voted on. Give an
        award a round in its settings (Nominees). Everything else follows the main voting dates in Settings: now{" "}
        {shown(config.data?.startTime)} to {shown(config.data?.endTime)}.
      </p>
      {rounds.size === 0 && <p className="text-sm">No awards are in a round.</p>}
      {[...rounds.entries()].map(([name, list]) => (
        <RoundDates key={name} name={name} awards={list} />
      ))}
      <section className="space-y-3 rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-bold">Advance DGGer</h2>
        <p className="text-sm text-neutral-600">
          After a round closes, count it and see who goes through. Nothing changes until you confirm. Each advance is
          one entry in the History; undo takes the nominees it added back out, as long as nobody has voted for them.
        </p>
        <Advance step="groups" title="Wildcards → groups" text="The top 5 by points, drawn at random into Groups A–E, one each." />
        <Advance step="final" title="Groups → final" text="The top 2 of each group by instant runoff, into DGG Chatter of the Year." />
      </section>
    </div>
  );
}

function RoundDates({ name, awards }: { name: string; awards: { id: string; title: string; opensAt: number | null; closesAt: number | null }[] }) {
  const queryClient = useQueryClient();
  const first = awards[0]!;
  const [opens, setOpens] = useState(toLocalInput(first.opensAt));
  const [closes, setCloses] = useState(toLocalInput(first.closesAt));
  const mixed = awards.some((a) => a.opensAt !== first.opensAt || a.closesAt !== first.closesAt);
  const save = useMutation({
    mutationFn: () => saveRoundDates({ name, opensAt: fromLocalInput(opens)!, closesAt: fromLocalInput(closes)! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
  const bad = !opens || !closes || opens >= closes;
  return (
    <section className="space-y-3 rounded border border-neutral-200 bg-white p-4">
      <h2 className="text-base font-bold">{name}</h2>
      <p className="text-sm text-neutral-600">{awards.map((a) => a.title).join(", ")}</p>
      {mixed && <p className="text-sm text-amber-700">Its awards have different dates. Saving gives them all these.</p>}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Voting opens" hint={`Your time zone: ${timeZone}`}>
          <input className={inputClass} type="datetime-local" value={opens} onChange={(e) => setOpens(e.currentTarget.value)} />
        </Field>
        <Field label="Voting closes">
          <input className={inputClass} type="datetime-local" value={closes} onChange={(e) => setCloses(e.currentTarget.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={bad || save.isPending}>
          Save dates
        </Button>
      </form>
      {opens && closes && opens >= closes && <ErrorText>It has to close after it opens.</ErrorText>}
      <ErrorText>{save.error?.message}</ErrorText>
      {save.isSuccess && <p className="text-sm text-green-700">Saved.</p>}
    </section>
  );
}

/** Shuffled copy (the wildcards' draw into the groups). */
const shuffled = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

function Advance({ step, title, text }: { step: "groups" | "final"; title: string; text: string }) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<AdvancePlan | null>(null);
  // Who settles a tie at the cut, per award.
  const [settled, setSettled] = useState<Record<string, string[]>>({});
  const [draw, setDraw] = useState<string[]>([]);
  const count = useMutation({
    mutationFn: () => fetchAdvancePlan(step),
    onSuccess: (p) => {
      setPlan(p);
      setSettled({});
      if (step === "groups") setDraw(shuffled(p.targets.map((t) => t.id)));
    },
  });
  const confirm = useMutation({
    mutationFn: (picks: { from: string; id: string; to: string }[]) => advanceDgger({ step, picks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      count.mutate();
    },
  });

  const going = (s: AdvancePlan["standings"][number]) => [...s.through, ...(settled[s.award.id] ?? [])];
  const ready = plan && !plan.done && plan.standings.every((s) => going(s).length === s.places);
  const picks = () => {
    if (!plan) return [];
    if (step === "groups") {
      const s = plan.standings[0]!;
      return going(s).map((id, i) => ({ from: s.award.id, id, to: draw[i]! }));
    }
    return plan.standings.flatMap((s) => going(s).map((id) => ({ from: s.award.id, id, to: plan.targets[0]!.id })));
  };
  const titleOf = (id: string) => plan?.standings.flatMap((s) => s.rows).find((r) => r.id === id)?.title ?? id;
  const targetTitle = (id: string) => plan?.targets.find((t) => t.id === id)?.title ?? id;

  return (
    <div className="space-y-3 rounded border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-sm text-neutral-600">{text}</span>
        <span className="grow" />
        <Button disabled={count.isPending} onClick={() => count.mutate()}>
          {plan ? "Count again" : "Count and show who goes through"}
        </Button>
      </div>
      <ErrorText>{count.error?.message}</ErrorText>

      {plan && (
        <div className="space-y-3">
          {plan.done && (
            <p className="text-sm text-amber-700">
              Already done: {plan.targets.map((t) => `${t.title} has ${t.has.join(", ") || "nobody"}`).join("; ")}. Undo it in the
              History to do it again.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {plan.standings.map((s) => (
              <div key={s.award.id} className="rounded border border-neutral-200 p-2 text-sm">
                <p className="font-bold">
                  {s.award.title} <span className="font-normal text-neutral-500">· {s.ballots} ballots · {s.places} through</span>
                </p>
                <ol className="mt-1 space-y-0.5">
                  {s.rows.map((r, i) => {
                    const through = s.through.includes(r.id);
                    const tied = s.tied.includes(r.id);
                    const picked = settled[s.award.id]?.includes(r.id);
                    return (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="w-5 text-right text-neutral-500">{i + 1}.</span>
                        <span className={through || picked ? "font-bold" : ""}>{r.title}</span>
                        <span className="text-neutral-500">{r.score}</span>
                        {through && <span className="text-green-700">through</span>}
                        {tied && (
                          <label className="flex items-center gap-1 text-amber-700">
                            <input
                              type="checkbox"
                              checked={!!picked}
                              disabled={plan.done}
                              onChange={(e) => {
                                const on = e.currentTarget.checked;
                                setSettled((old) => ({
                                  ...old,
                                  [s.award.id]: on ? [...(old[s.award.id] ?? []), r.id] : (old[s.award.id] ?? []).filter((x) => x !== r.id),
                                }));
                              }}
                            />
                            tied: pick
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {s.tied.length > 0 && (
                  <p className="mt-1 text-amber-700">
                    Tied at the cut: pick {s.places - s.through.length} of {s.tied.length}.
                  </p>
                )}
                {s.ballots === 0 && <p className="mt-1 text-neutral-500">No ballots yet.</p>}
              </div>
            ))}
          </div>

          {!plan.done && step === "groups" && (
            <div className="space-y-1 text-sm">
              <p className="font-bold">The draw</p>
              <ul>
                {plan.standings[0] &&
                  going(plan.standings[0]).map((id, i) => (
                    <li key={id}>
                      {titleOf(id)} → {targetTitle(draw[i] ?? "")}
                    </li>
                  ))}
              </ul>
              <Button onClick={() => setDraw(shuffled(plan.targets.map((t) => t.id)))}>Draw again</Button>
            </div>
          )}
          {!plan.done && step === "final" && ready && (
            <p className="text-sm">
              Into {plan.targets[0]!.title}: {picks().map((p) => titleOf(p.id)).join(", ")}.
            </p>
          )}
          {!plan.done && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                disabled={!ready || confirm.isPending}
                onClick={() => {
                  if (window.confirm(step === "groups" ? "Put these wildcards into the groups?" : "Put these chatters into the final?")) confirm.mutate(picks());
                }}
              >
                Confirm and advance
              </Button>
              {!ready && <span className="text-sm text-neutral-600">Settle the ties first (or wait for ballots).</span>}
              <ErrorText>{confirm.error?.message}</ErrorText>
            </div>
          )}
          {confirm.isSuccess && <p className="text-sm text-green-700">Done.</p>}
        </div>
      )}
    </div>
  );
}
