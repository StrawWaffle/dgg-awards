import { useState } from "react";
import { inputClass } from "@/admin/components/editor/fields";
import { HistoryList } from "@/admin/components/history/HistoryList";
import type { HistoryFilter } from "@/lib/queries";

const kinds: { value: NonNullable<HistoryFilter["kind"]> | ""; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "nominee", label: "Nominees" },
  { value: "category", label: "Categories" },
  { value: "order", label: "Order" },
  { value: "settings", label: "Settings" },
  { value: "admin", label: "Admins" },
  { value: "import", label: "Imports" },
];

/** Every change made from the admin page, by anyone. */
export function HistoryTab() {
  const [kind, setKind] = useState<HistoryFilter["kind"] | "">("");
  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-neutral-600">
          Every change made here, newest first. Open an entry to see what changed. Undo puts the old values back
          and is itself recorded.
        </p>
        <select
          className={`${inputClass} w-44!`}
          aria-label="Show"
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as HistoryFilter["kind"] | "")}
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <section className="rounded border border-neutral-200 bg-white">
        <HistoryList key={kind} filter={kind ? { kind } : {}} />
      </section>
    </div>
  );
}
