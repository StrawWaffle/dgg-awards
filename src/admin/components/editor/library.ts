import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type LibraryItem, fetchLibrary } from "@/lib/queries";

/** Folder names and award titles compared loosely ("DANKMEMES of the Year"). */
const simple = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Is this the award's folder? Whole words, either way round ("New Emote of the Year" / "Emote of the Year"). */
export function sameAward(folder: string, award: string | undefined) {
  if (!award || !folder) return false;
  const [f, a] = [` ${simple(folder)} `, ` ${simple(award)} `];
  return a.includes(f) || f.includes(a);
}

/** The URL an admin's browser loads a library file from. */
export const libraryUrl = (path: string) => `/api/admin/library/file?path=${encodeURIComponent(path)}`;

/**
 * The library's videos or pictures, by folder, with this award's folder
 * first. The award's title comes from the editor's list of awards.
 */
export function useLibrary(kind: LibraryItem["kind"], categoryId: string) {
  const library = useQuery({ queryKey: ["library"], queryFn: fetchLibrary });
  const award = useQueryClient()
    .getQueryData<{ id: string; title: string }[]>(["admin-nominees"])
    ?.find((c) => c.id === categoryId)?.title;
  const items = (library.data ?? []).filter((i) => i.kind === kind);
  const folders = [...new Set(items.map((i) => i.folder))]
    .sort((a, b) => Number(!sameAward(a, award)) - Number(!sameAward(b, award)) || a.localeCompare(b))
    .map((folder) => ({ folder, mine: sameAward(folder, award), items: items.filter((i) => i.folder === folder) }));
  return { items, folders };
}
