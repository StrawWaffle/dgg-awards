// How history entries read: a sentence for each, and readable field values.
import { formatTimestamp } from "@/lib/links";
import type { HistoryEntry } from "@/lib/queries";

type Snapshot = Record<string, unknown>;

const fieldNames: Record<string, string> = {
  title: "title",
  description: "description",
  date: "date",
  url: "source link",
  linkType: "link type",
  clipStart: "clip start",
  clipEnd: "clip end",
  imageId: "image file",
  renderType: "layout",
  videoId: "video id",
  clipKey: "clip",
  clipStatus: "clip status",
  clipError: "clip error",
  thumbnailKey: "thumbnail",
  thumbnailAt: "thumbnail frame",
  emote: "emote",
  listNumber: "number on the list",
  votingStyle: "voting style",
  viewingMode: "mode",
  startTime: "voting opens",
  endTime: "voting closes",
  awardYear: "award year",
  defaultVotingStyle: "default voting style",
  message: "message",
  admin: "admin",
  hidden: "hidden",
  askDates: "asking for dates",
  ids: "order",
};
export const fieldName = (key: string) => fieldNames[key] ?? key;

/** Not worth showing: ids, the stored order and the bookkeeping around clips. */
const hidden = new Set(["id", "categoryId", "position", "uid", "options", "clipError", "categories"]);

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if ((key === "startTime" || key === "endTime") && !Number.isNaN(Number(value))) {
    return dateTime.format(new Date(Number(value) * 1000));
  }
  if ((key === "clipStart" || key === "clipEnd") && typeof value === "number") return formatTimestamp(value);
  if (key === "thumbnailAt" && typeof value === "number") return `${value}s into the clip`;
  if ((key === "clipKey" || key === "thumbnailKey") && typeof value === "string") return value.split("/").pop()!;
  if (key === "admin" || key === "hidden" || key === "askDates") return value ? "yes" : "no";
  if (key === "ids" && Array.isArray(value)) return value.map((id, i) => `${i + 1}. ${id}`).join("\n");
  if (key === "votingStyle" && value === null) return "site default";
  return String(value);
}

/** The rows of the diff: field, before, after. */
export function diffRows(entry: HistoryEntry) {
  const before = (entry.before ?? {}) as Snapshot;
  const after = (entry.after ?? {}) as Snapshot;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !hidden.has(k));
  return (
    keys
      // A create or delete has one side only; skip its empty fields.
      .filter((k) => entry.action === "update" || formatValue(k, before[k] ?? after[k]) !== "—")
      .map((k) => ({ key: k, field: fieldName(k), before: formatValue(k, before[k]), after: formatValue(k, after[k]) }))
  );
}

const changed = (entry: HistoryEntry) =>
  diffRows(entry)
    .map((r) => r.field)
    .join(", ");

/** "Edited title, date of", "Deleted category", … followed by the label. */
export function describe(entry: HistoryEntry): string {
  const after = (entry.after ?? {}) as Snapshot;
  switch (entry.kind) {
    case "nominee":
      if (entry.action === "create") return "Added nominee";
      if (entry.action === "delete") return "Deleted nominee";
      return `Changed ${changed(entry) || "nothing visible"} of`;
    case "category":
      if (entry.action === "create") return "Added category";
      if (entry.action === "update" && Object.keys(after).length === 1 && "hidden" in after) {
        return after.hidden ? "Hid category" : "Showed category";
      }
      if (entry.action === "delete") {
        const n = ((entry.before as Snapshot | null)?.options as unknown[] | undefined)?.length ?? 0;
        return `Deleted category (with ${n} nominee${n === 1 ? "" : "s"})`;
      }
      return `Changed ${changed(entry)} of category`;
    case "settings":
      return `Changed ${changed(entry)} in`;
    case "admin":
      return after.admin ? "Made admin:" : "Removed as admin:";
    case "order":
      return "Reordered";
    case "import":
      return entry.action === "create" ? `${importSummary(after)}:` : "Removed the import of";
  }
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What an import did, from what it recorded: nominees added and moved,
 * pictures set and emotes changed ("Moved 67 nominees", "Set 14 pictures
 * and changed 119 emotes"). Moved nominees are counted in `nominees` too.
 */
function importSummary(after: Snapshot) {
  const len = (key: string) => ((after[key] as unknown[] | undefined) ?? []).length;
  const moved = len("moved");
  const added = Math.max(0, Number(after.nominees ?? 0) - moved);
  const parts = [
    added > 0 && `added ${count(added, "nominee")}`,
    moved > 0 && `moved ${count(moved, "nominee")}`,
    len("pictures") > 0 && `set ${count(len("pictures"), "picture")}`,
    len("emotes") > 0 && `changed ${count(len("emotes"), "emote")}`,
  ].filter((p): p is string => !!p);
  if (parts.length === 0) return "Imported nothing";
  const text = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return text[0]!.toUpperCase() + text.slice(1);
}

/** Whether Undo is offered at all (the server still checks). */
export const undoable = (entry: HistoryEntry) => entry.undoneBy === null;
