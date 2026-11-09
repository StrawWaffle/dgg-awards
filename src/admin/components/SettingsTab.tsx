import * as Label from "@radix-ui/react-label";
import { Tabs } from "radix-ui";
import { useQuery } from "@tanstack/react-query";
import { fetchConfig } from "@/lib/queries";

export function SettingsTab() {
  const configQuery = useQuery({ queryKey: ["config"], queryFn: fetchConfig });

  return (
    <Tabs.Content value="settings" className="flex outline-none">
      <div className="flex w-full gap-4">
        <div className="w-1/3 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-neutral-500 uppercase">
            Voting Parameters
          </h3>

          <form className="space-y-4" action="/api/admin/config" method="POST">
            <div className="grid gap-2">
              <Label.Root className="text-xs font-medium text-neutral-600">
                Start Time (Unix){" "}
                {configQuery.data?.startTime && (
                  <span className="text-neutral-400">
                    {new Date(
                      configQuery.data.startTime * 1000,
                    ).toLocaleString()}
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
              <p className="text-xs text-red-200 uppercase">
                this will override voting paramaters
              </p>
            </Label.Root>
            <select
              defaultValue={configQuery.data?.viewingMode}
              name="viewing_config"
              className="w-full rounded border border-neutral-300 bg-neutral-100 p-1"
            >
              <option value="locked">Locked (nothing but header)</option>
              <option value="voting">
                Voting (normal, bound by timing params)
              </option>
              <option value="idle">Idle (read-only, no results)</option>
              <option value="reviewing">
                Reviewing (post-vote results public)
              </option>
            </select>
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700"
            >
              Set
            </button>
          </form>
        </div>
      </div>
    </Tabs.Content>
  );
}
