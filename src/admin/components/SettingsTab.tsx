import { useState } from "react";
import { Label, Tabs } from "radix-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import type { VotingStyle } from "@/lib/voting";
import { type Config, fetchConfig, saveSettings } from "@/lib/queries";

export function SettingsTab() {
  const configQuery = useQuery({ queryKey: ["config"], queryFn: fetchConfig });

  return (
    <Tabs.Content value="settings" className="flex outline-none">
      <div className="flex w-full flex-wrap gap-4">
        <div className="w-full max-w-md rounded border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-neutral-700">Voting parameters</h3>

          {/* Keyed on the loaded config: defaultValue only applies on mount,
              so without this the fields stayed empty if they rendered before
              the config arrived. */}
          <form
            key={JSON.stringify(configQuery.data ?? null)}
            className="space-y-4"
            action="/api/admin/config"
            method="POST"
          >
            <div className="grid gap-2">
              <Label.Root className="text-xs font-medium text-neutral-600">
                Start Time (Unix){" "}
                {configQuery.data?.startTime && (
                  <span className="text-neutral-400">
                    {new Date(configQuery.data.startTime * 1000).toLocaleString()}
                  </span>
                )}
              </Label.Root>
              <div className="flex gap-2">
                <input
                  name="starting_time"
                  type="number"
                  required
                  defaultValue={configQuery.data?.startTime?.toString()}
                  className="flex-1 rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label.Root className="text-xs font-medium text-neutral-600">
                End Time (Unix){" "}
                {configQuery.data?.endTime && (
                  <span className="text-neutral-400">
                    {new Date(configQuery.data.endTime * 1000).toLocaleString()}
                  </span>
                )}
              </Label.Root>
              <div className="flex gap-2">
                <input
                  name="ending_time"
                  type="number"
                  required
                  defaultValue={configQuery.data?.endTime?.toString()}
                  className="flex-1 rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <Label.Root className="flex items-center justify-between text-xs font-medium text-neutral-600">
              Viewing mode
              <span className="text-xs text-red-700">Overrides the voting times</span>
            </Label.Root>
            <select
              defaultValue={configQuery.data?.viewingMode}
              name="viewing_config"
              className="w-full rounded border border-neutral-300 bg-neutral-100 p-1"
            >
              <option value="locked">Locked (nothing but header)</option>
              <option value="voting">Voting (normal, bound by timing params)</option>
              <option value="idle">Idle (read-only, no results)</option>
              <option value="reviewing">Reviewing (post-vote results public)</option>
            </select>
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700"
            >
              Set
            </button>
          </form>
        </div>

        {configQuery.data && <SiteSettings config={configQuery.data} />}
      </div>
    </Tabs.Content>
  );
}

function SiteSettings({ config }: { config: Config }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(config.awardYear ?? "");
  const [style, setStyle] = useState<VotingStyle>(config.defaultVotingStyle ?? "single");
  const save = useMutation({
    mutationFn: () =>
      saveSettings({
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

  return (
    <form
      className="w-full max-w-md space-y-4 rounded border border-neutral-200 bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h3 className="text-sm font-bold text-neutral-700">Awards</h3>
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
        hint="For categories without their own. Categories that already have votes keep the style they were voted under."
      >
        <select className={inputClass} value={style} onChange={(e) => setStyle(e.currentTarget.value as VotingStyle)}>
          <option value="single">Single pick</option>
          <option value="ranked">Ranked (instant runoff)</option>
        </select>
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save
        </Button>
        {save.isSuccess && <span className="text-sm text-neutral-600">Saved.</span>}
        <ErrorText>{save.error?.message}</ErrorText>
      </div>
    </form>
  );
}
