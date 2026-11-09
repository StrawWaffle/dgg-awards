import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import clsx from "clsx";
import { Button, ErrorText } from "@/admin/components/editor/fields";
import { describe, diffRows, fieldName, undoable } from "@/admin/components/history/describe";
import { type HistoryEntry, type HistoryFilter, UndoRefused, fetchHistory, undoHistory } from "@/lib/queries";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

/**
 * Entries newest first, each with what changed and an Undo. Used for the
 * whole site (History tab) and for one category or nominee.
 */
export function HistoryList({ filter = {}, showLabel = true }: { filter?: HistoryFilter; showLabel?: boolean }) {
  const [page, setPage] = useState(0);
  const history = useQuery({
    queryKey: ["history", filter, page],
    queryFn: () => fetchHistory(page, filter),
    placeholderData: keepPreviousData,
  });

  if (history.isPending) return <p className="p-3 text-sm">Loading…</p>;
  if (history.isError) return <ErrorText>Couldn't load the history: {history.error.message}</ErrorText>;
  if (history.data.length === 0 && page === 0) {
    return <p className="p-3 text-sm text-neutral-600">No changes recorded yet.</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-neutral-100">
        {history.data.map((entry) => (
          <Entry key={entry.id} entry={entry} showLabel={showLabel} />
        ))}
      </ul>
      {(page > 0 || history.data.length === 50) && (
        <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2">
          <span className="text-xs text-neutral-600">Page {page + 1}</span>
          <div className="flex gap-2">
            <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
              Newer
            </Button>
            <Button onClick={() => setPage(page + 1)} disabled={history.data.length < 50}>
              Older
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Entry({ entry, showLabel }: { entry: HistoryEntry; showLabel: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const undo = useMutation({
    mutationFn: (force: boolean) => undoHistory(entry.id, force),
    // An undo can change anything on the page.
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const refused = undo.error instanceof UndoRefused ? undo.error : null;
  const rows = diffRows(entry);

  return (
    <li className={clsx("text-sm", entry.undoneBy !== null && "text-neutral-500")}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          disabled={rows.length === 0}
        >
          <span className="mt-0.5 shrink-0 text-neutral-500">
            {rows.length === 0 ? <span className="inline-block w-[15px]" /> : open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </span>
          <span className="min-w-0">
            <span className="block">
              {showLabel || entry.kind !== "nominee" ? (
                <>
                  {describe(entry)} <b>{entry.label}</b>
                </>
              ) : (
                // Inside the nominee's own history its name goes without saying.
                describe(entry).replace(/ of$/, "")
              )}
            </span>
            <span className="block text-xs text-neutral-500">
              #{entry.id} · {dateTime.format(new Date(entry.at))} · {entry.name}
              {entry.revertOf !== null && ` · undid #${entry.revertOf}`}
              {entry.undoneBy !== null && ` · undone by #${entry.undoneBy}`}
            </span>
          </span>
        </button>
        {undoable(entry) && (
          <Button
            disabled={undo.isPending}
            onClick={() => {
              if (confirm(`Undo #${entry.id}?`)) undo.mutate(false);
            }}
          >
            Undo
          </Button>
        )}
      </div>

      {undo.error && (
        <div className="mx-3 mb-2 space-y-2 rounded border border-red-300 p-2">
          <ErrorText>
            {undo.error.message}
            {refused && refused.fields.length > 0 && ` (${refused.fields.map(fieldName).join(", ")})`}
          </ErrorText>
          {refused && refused.fields.length > 0 && (
            <Button variant="danger" disabled={undo.isPending} onClick={() => undo.mutate(true)}>
              Undo anyway
            </Button>
          )}
        </div>
      )}

      {open && rows.length > 0 && (
        <div className="mx-3 mb-3 overflow-x-auto rounded border border-neutral-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                <th className="px-2 py-1 font-medium">Field</th>
                {entry.action !== "create" && <th className="px-2 py-1 font-medium">Before</th>}
                {entry.action !== "delete" && <th className="px-2 py-1 font-medium">After</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 align-top">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-2 py-1 whitespace-nowrap text-neutral-600">{r.field}</td>
                  {entry.action !== "create" && (
                    <td className="max-w-md px-2 py-1 break-words whitespace-pre-line">{r.before}</td>
                  )}
                  {entry.action !== "delete" && (
                    <td className="max-w-md px-2 py-1 break-words whitespace-pre-line">{r.after}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
