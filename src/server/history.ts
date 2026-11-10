// Edit history: every change made from the admin page is recorded with who
// made it and what it was before and after, and most can be undone. An undo
// is itself an ordinary entry (with revertOf set), so it can be undone too.
import {
  type CategoryRow,
  type NomineeRow,
  categoryHasVotes,
  deleteCategory,
  deleteNominee,
  getCategory,
  getCategoryNominees,
  getConfig,
  getHistoryEntry,
  getNominee,
  getNominees,
  getUndoOf,
  getUser,
  insertCategory,
  insertHistory,
  insertNominee,
  moveNominee,
  nomineeHasVotes,
  reorderCategories,
  reorderNominees,
  setCategoryFields,
  setNomineeFields,
  setNomineeMedia,
  setSetting,
  setUserAdmin,
} from "@/lib/data/driver";
import type { HistoryAction, HistoryKind } from "@/lib/data/schema";
import { adminUsernames } from "@/server/routes/auth";

export type Actor = { uid: number | null; name: string };
/** A picture an import gave a nominee that was already there: `from` is what it had. */
export type ImportedPicture = { categoryId: string; id: string; from: string | null; to: string };
/** An emote an import gave a nominee: `from` is what it had. */
export type ImportedEmote = ImportedPicture;
/** A nominee an import moved to another award, and its place in the old one. */
export type MovedNominee = { id: string; from: string; to: string; position: number };

/** Move nominees back where they came from (undo), or on again (redo). Skips any changed since. */
async function moveAll(moved: MovedNominee[], back: boolean) {
  const done: MovedNominee[] = [];
  for (const m of moved) {
    const [from, to] = back ? [m.to, m.from] : [m.from, m.to];
    if (!(await getNominee(from, m.id)) || (await getNominee(to, m.id)) || (await nomineeHasVotes(from, m.id))) continue;
    await moveNominee(from, m.id, to, back ? m.position : undefined);
    done.push(m);
  }
  return done;
}
type Snapshot = Record<string, unknown>;

/** Clip builds finish in the background, after the request that started them. */
export const serverActor: Actor = { uid: null, name: "Server" };

export async function actorFor(uid: number): Promise<Actor> {
  return { uid, name: (await getUser(uid))?.name ?? `uid ${uid}` };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Keys whose values differ between two snapshots. */
export function changedKeys(before: Snapshot, after: Snapshot) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !same(before[k], after[k]));
}

const pick = (row: Snapshot, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
// Rows go through JSON so they store the way they'll be read back.
const plain = <T>(row: T) => JSON.parse(JSON.stringify(row)) as Snapshot;

export type Change = {
  kind: HistoryKind;
  action: HistoryAction;
  label: string;
  categoryId?: string | null;
  nomineeId?: string | null;
  before?: Snapshot | null;
  after?: Snapshot | null;
  revertOf?: number;
};

/**
 * Record a change. An update keeps only the fields that changed, and one
 * that changed nothing isn't recorded. Returns the entry's id, if any.
 */
export async function record(actor: Actor, change: Change) {
  let { before = null, after = null } = change;
  if (change.action === "update" && before && after) {
    const keys = changedKeys(before, after);
    if (keys.length === 0) return null;
    before = pick(before, keys);
    after = pick(after, keys);
  }
  return insertHistory({
    uid: actor.uid,
    name: actor.name,
    kind: change.kind,
    action: change.action,
    label: change.label,
    categoryId: change.categoryId ?? null,
    nomineeId: change.nomineeId ?? null,
    before,
    after,
    revertOf: change.revertOf ?? null,
  });
}

export const nomineeLabel = async (categoryId: string, title: string) =>
  `${title} · ${(await getCategory(categoryId))?.title ?? categoryId}`;

/** Record a nominee edit: pass the row from before, it reads the current one. */
export async function recordNomineeUpdate(actor: Actor, before: NomineeRow | undefined) {
  if (!before) return null;
  const after = await getNominee(before.categoryId, before.id);
  if (!after) return null;
  return record(actor, {
    kind: "nominee",
    action: "update",
    label: await nomineeLabel(after.categoryId, after.title),
    categoryId: after.categoryId,
    nomineeId: after.id,
    before: plain(before),
    after: plain(after),
  });
}

export async function recordNomineeCreate(actor: Actor, categoryId: string, id: string) {
  const row = await getNominee(categoryId, id);
  if (!row) return null;
  return record(actor, {
    kind: "nominee",
    action: "create",
    label: await nomineeLabel(categoryId, row.title),
    categoryId,
    nomineeId: id,
    after: plain(row),
  });
}

export async function recordCategoryCreate(actor: Actor, id: string) {
  const row = await getCategory(id);
  if (!row) return null;
  return record(actor, { kind: "category", action: "create", label: row.title, categoryId: id, after: plain(row) });
}

/** A category with its nominees, as a delete stores it. */
export async function categorySnapshot(id: string): Promise<Snapshot | null> {
  const row = await getCategory(id);
  return row ? { ...plain(row), options: (await getCategoryNominees(id)).map(plain) } : null;
}

export const categoryOrder = async () => (await getNominees()).map((c) => c.id);
export const nomineeOrder = async (categoryId: string) => (await getCategoryNominees(categoryId)).map((n) => n.id);

/** Undo refused: says why, and which fields changed since, if that's why. */
export class UndoConflict extends Error {
  constructor(
    message: string,
    readonly fields: string[] = [],
  ) {
    super(message);
  }
}

/**
 * Undo entry `id`. If something it changed has been edited since, this
 * refuses with the fields unless `force`, which puts the old values back
 * anyway. Returns the new entry's id.
 */
export async function undo(id: number, actor: Actor, force = false): Promise<number | null> {
  const entry = await getHistoryEntry(id);
  if (!entry) throw new UndoConflict("No such history entry.");
  const undone = await getUndoOf(id);
  if (undone) throw new UndoConflict(`This was already undone (#${undone.id}).`);
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const base = {
    kind: entry.kind,
    label: entry.label,
    categoryId: entry.categoryId,
    nomineeId: entry.nomineeId,
    revertOf: id,
  };
  /** The fields whose current value isn't what this entry left them at. */
  const check = (current: Snapshot) => {
    const moved = Object.keys(after).filter((k) => !same(current[k], after[k]));
    if (moved.length > 0 && !force) {
      throw new UndoConflict("Changed again since. Undo anyway to put the old values back.", moved);
    }
  };

  switch (entry.kind) {
    case "nominee": {
      const categoryId = entry.categoryId!;
      const nomineeId = entry.nomineeId!;
      const current = await getNominee(categoryId, nomineeId);
      if (entry.action === "update") {
        if (!current) throw new UndoConflict("That nominee has been deleted since.");
        check(plain(current));
        await setNomineeFields(categoryId, nomineeId, before as Partial<NomineeRow>);
        return record(actor, { ...base, action: "update", before: pick(plain(current), Object.keys(before)), after: before });
      }
      if (entry.action === "create") {
        if (!current) throw new UndoConflict("That nominee has been deleted already.");
        if (await nomineeHasVotes(categoryId, nomineeId)) throw new UndoConflict("That nominee has votes now.");
        await deleteNominee(categoryId, nomineeId);
        return record(actor, { ...base, action: "delete", before: plain(current) });
      }
      // Bring a deleted nominee back as it was, files and all.
      if (current) throw new UndoConflict("A nominee with that id exists again.");
      if (!(await getCategory(categoryId))) throw new UndoConflict("Its category is gone. Restore the category first.");
      await insertNominee(before as NomineeRow);
      return record(actor, { ...base, action: "create", after: before });
    }

    case "category": {
      const categoryId = entry.categoryId!;
      const current = await getCategory(categoryId);
      if (entry.action === "update") {
        if (!current) throw new UndoConflict("That category has been deleted since.");
        check(plain(current));
        await setCategoryFields(categoryId, before as Partial<CategoryRow>);
        return record(actor, { ...base, action: "update", before: pick(plain(current), Object.keys(before)), after: before });
      }
      if (entry.action === "create") {
        if (!current) throw new UndoConflict("That category has been deleted already.");
        if ((await getCategoryNominees(categoryId)).length > 0) {
          throw new UndoConflict("That category has nominees now. Delete them first.");
        }
        const snapshot = await categorySnapshot(categoryId);
        await deleteCategory(categoryId);
        return record(actor, { ...base, action: "delete", before: snapshot });
      }
      // Restore a deleted category with its nominees. Its votes are gone.
      if (current) throw new UndoConflict("A category with that id exists again.");
      const { options = [], ...row } = before as CategoryRow & { options?: NomineeRow[] };
      await insertCategory(row);
      for (const nominee of options) await insertNominee(nominee);
      return record(actor, { ...base, action: "create", after: before });
    }

    case "settings": {
      const config = (await getConfig()) as Snapshot;
      check(config);
      for (const [key, value] of Object.entries(before)) {
        if (value !== null && value !== undefined) await setSetting(key, String(value));
      }
      return record(actor, { ...base, action: "update", before: pick(config, Object.keys(before)), after: before });
    }

    case "admin": {
      const uid = Number(after.uid ?? before.uid);
      const user = await getUser(uid);
      if (!user) throw new UndoConflict("That user is gone.");
      check({ uid, admin: user.admin });
      const admin = Boolean(before.admin);
      if (!admin && uid === actor.uid) throw new UndoConflict("You can't remove yourself.");
      if (!admin && adminUsernames.has(user.name.toLowerCase())) {
        throw new UndoConflict(`${user.name} is in ADMIN_USERNAMES. Remove them there first.`);
      }
      await setUserAdmin(uid, admin);
      return record(actor, { ...base, action: "update", before: { uid, admin: user.admin }, after: { uid, admin } });
    }

    case "order": {
      const ids = (before.ids ?? []) as string[];
      const current = entry.categoryId ? await nomineeOrder(entry.categoryId) : await categoryOrder();
      check({ ids: current });
      if (entry.categoryId) await reorderNominees(entry.categoryId, ids);
      else await reorderCategories(ids);
      return record(actor, { ...base, action: "update", before: { ids: current }, after: { ids } });
    }

    case "import": {
      if (entry.action === "create") {
        // Remove what the import added, unless it has been voted on since:
        // new categories (with their nominees), and nominees added to
        // categories that were already there (`added`).
        const ids = (after.categories ?? []) as string[];
        const added = (after.added ?? []) as { categoryId: string; id: string }[];
        const snapshots = [];
        const rows: NomineeRow[] = [];
        for (const categoryId of ids) {
          if (await categoryHasVotes(categoryId)) {
            throw new UndoConflict(`"${categoryId}" has votes now, so the import can't be undone.`);
          }
        }
        for (const a of added) {
          if (await nomineeHasVotes(a.categoryId, a.id)) {
            throw new UndoConflict(`"${a.id}" in "${a.categoryId}" has votes now, so the import can't be undone.`);
          }
        }
        // Nominees it moved go back first, so they aren't deleted with a new category.
        const moved = await moveAll((after.moved ?? []) as MovedNominee[], true);
        for (const categoryId of ids) {
          const snapshot = await categorySnapshot(categoryId);
          if (!snapshot) continue;
          snapshots.push(snapshot);
          await deleteCategory(categoryId);
        }
        for (const a of added) {
          const row = await getNominee(a.categoryId, a.id);
          if (!row) continue;
          rows.push(row);
          await deleteNominee(a.categoryId, a.id);
        }
        // Pictures and emotes it gave nominees that were already there,
        // unless one has been changed since.
        const pictures: ImportedPicture[] = [];
        for (const p of (after.pictures ?? []) as ImportedPicture[]) {
          const row = await getNominee(p.categoryId, p.id);
          if (row?.thumbnailKey !== p.to) continue;
          await setNomineeMedia(p.categoryId, p.id, { thumbnailKey: p.from, thumbnailAt: null });
          pictures.push(p);
        }
        const emotes: ImportedEmote[] = [];
        for (const e of (after.emotes ?? []) as ImportedEmote[]) {
          const row = await getNominee(e.categoryId, e.id);
          if (row?.emote !== e.to) continue;
          await setNomineeFields(e.categoryId, e.id, { emote: e.from });
          emotes.push(e);
        }
        return record(actor, { ...base, action: "delete", before: { categories: snapshots, added: rows, pictures, emotes, moved } });
      }
      // Undoing that undo: put the imported categories and nominees back.
      const snapshots = (before.categories ?? []) as (CategoryRow & { options?: NomineeRow[] })[];
      const rows = (before.added ?? []) as NomineeRow[];
      for (const snap of snapshots) {
        if (await getCategory(snap.id)) throw new UndoConflict(`A category "${snap.id}" exists again.`);
      }
      for (const row of rows) {
        if (await getNominee(row.categoryId, row.id)) throw new UndoConflict(`A nominee "${row.id}" exists again in "${row.categoryId}".`);
      }
      for (const { options = [], ...row } of snapshots) {
        await insertCategory(row);
        for (const nominee of options) await insertNominee(nominee);
      }
      for (const row of rows) await insertNominee(row);
      const moved = await moveAll((before.moved ?? []) as MovedNominee[], false);
      const pictures: ImportedPicture[] = [];
      for (const p of (before.pictures ?? []) as ImportedPicture[]) {
        const row = await getNominee(p.categoryId, p.id);
        if (!row || row.thumbnailKey !== p.from) continue;
        await setNomineeMedia(p.categoryId, p.id, { thumbnailKey: p.to, thumbnailAt: null });
        pictures.push(p);
      }
      const emotes: ImportedEmote[] = [];
      for (const e of (before.emotes ?? []) as ImportedEmote[]) {
        const row = await getNominee(e.categoryId, e.id);
        if (!row || row.emote !== e.from) continue;
        await setNomineeFields(e.categoryId, e.id, { emote: e.to });
        emotes.push(e);
      }
      return record(actor, {
        ...base,
        action: "create",
        after: {
          categories: snapshots.map((s) => s.id),
          added: rows.map((r) => ({ categoryId: r.categoryId, id: r.id })),
          nominees: snapshots.reduce((n, s) => n + (s.options?.length ?? 0), 0) + rows.length,
          pictures,
          emotes,
          moved,
        },
      });
    }
  }
}
