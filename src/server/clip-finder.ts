// Clip candidates from the year's chat, for the admins' Clip finder tab. Built
// on StrawWaffle's PC by dgg-scs `tools/clip-finder` (it needs the chat archive) and
// uploaded here as its clips.json.
//
// Each upload is kept as a page of its own ("clips-2026@<built>"), and the page
// "clips-2026" only says which one is current. The history records that small
// pointer, so it stays light (an upload is about 1.5 MB) and undo goes back to
// the previous upload.
import { getPage, setPage } from "@/lib/data/driver";
import type { ClipFinderDoc } from "@/server/schemas";

export const clipFinderKey = (year: number) => `clips-${year}`;

/** The current upload for a year, or null. */
export async function getClipFinder(year: number) {
  const pointer = await getPage(clipFinderKey(year));
  const current = typeof pointer?.current === "string" ? pointer.current : null;
  return current ? ((await getPage(current)) as ClipFinderDoc | undefined) ?? null : null;
}

/** Store an upload and make it current. Returns the pointer before and after, for the history. */
export async function saveClipFinder(doc: ClipFinderDoc) {
  const key = `${clipFinderKey(doc.year)}@${doc.built}`;
  await setPage(key, doc);
  const before = (await getPage(clipFinderKey(doc.year))) ?? { current: null };
  const after = { current: key };
  await setPage(clipFinderKey(doc.year), after);
  return { before, after };
}
