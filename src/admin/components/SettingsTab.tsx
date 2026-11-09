import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import type { ViewingMode } from "@/lib/types";
import type { VotingStyle } from "@/lib/voting";
import { type Config, fetchConfig, saveSettings } from "@/lib/queries";

const modes: { value: ViewingMode; label: string; hint: string }[] = [
  { value: "locked", label: "Locked", hint: "Visitors see only the header." },
  { value: "voting", label: "Voting", hint: "Votes are accepted between the open and close times." },
  { value: "idle", label: "Idle", hint: "Nominees are shown, but nobody can vote and results stay hidden." },
  { value: "reviewing", label: "Results", hint: "The results are public." },
];

// <input type="datetime-local"> works in the browser's time zone, without one.
const toLocalInput = (seconds?: number) => {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? Math.floor(new Date(value).getTime() / 1000) : undefined);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function SettingsTab() {
  const config = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  if (config.isPending) return <p className="text-sm">Loading…</p>;
  if (config.isError) return <ErrorText>Couldn't load the settings: {config.error.message}</ErrorText>;
  // Keyed on the loaded config, so the form starts over after a save.
  return <SettingsForm key={JSON.stringify(config.data)} config={config.data} />;
}

function SettingsForm({ config }: { config: Config }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ViewingMode>(config.viewingMode ?? "locked");
  const [opens, setOpens] = useState(toLocalInput(config.startTime));
  const [closes, setCloses] = useState(toLocalInput(config.endTime));
  const [year, setYear] = useState(config.awardYear ?? "");
  const [style, setStyle] = useState<VotingStyle>(config.defaultVotingStyle ?? "single");

  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        viewingMode: mode,
        startTime: fromLocalInput(opens),
        endTime: fromLocalInput(closes),
        ...(year ? { awardYear: Number(year) } : {}),
        defaultVotingStyle: style,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["config"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-nominees"] }),
        queryClient.invalidateQueries({ queryKey: ["checks"] }),
      ]),
  });

  const badWindow = opens && closes && opens >= closes;

  return (
    <form
      className="max-w-2xl space-y-6 rounded border border-neutral-200 bg-white p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <section className="space-y-4">
        <h2 className="text-sm font-bold">What visitors see</h2>
        <Field label="Mode" hint={modes.find((m) => m.value === mode)?.hint}>
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.currentTarget.value as ViewingMode)}>
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Voting opens" hint={`Your time zone: ${timeZone}`}>
            <input
              type="datetime-local"
              className={inputClass}
              value={opens}
              required
              onChange={(e) => setOpens(e.currentTarget.value)}
            />
          </Field>
          <Field label="Voting closes">
            <input
              type="datetime-local"
              className={inputClass}
              value={closes}
              required
              onChange={(e) => setCloses(e.currentTarget.value)}
            />
          </Field>
        </div>
        {badWindow && <ErrorText>Voting has to close after it opens.</ErrorText>}
      </section>

      <section className="space-y-4 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-bold">Awards</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Award year" hint="Nominee dates outside this year are flagged.">
            <input
              className={inputClass}
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.currentTarget.value)}
            />
          </Field>
          <Field
            label="Default voting style"
            hint="For categories without their own. Categories that already have votes keep theirs."
          >
            <select
              className={inputClass}
              value={style}
              onChange={(e) => setStyle(e.currentTarget.value as VotingStyle)}
            >
              <option value="single">Single pick</option>
              <option value="ranked">Ranked (instant runoff)</option>
            </select>
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-neutral-200 pt-6">
        <Button type="submit" variant="primary" disabled={save.isPending || !!badWindow}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {save.isSuccess && <span className="text-sm text-neutral-600">Saved.</span>}
        <ErrorText>{save.error?.message}</ErrorText>
      </div>
    </form>
  );
}
