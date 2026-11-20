import { Database } from "bun:sqlite";
import {
  type InferInsertModel,
  type InferSelectModel,
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/lib/data/schema";
import { env } from "@/lib/util";
import {
  type Places,
  type PointsResult,
  type RunoffResult,
  type VotingStyle,
  countPoints,
  effectiveStyle,
  instantRunoff,
  ranksToPlaces,
} from "@/lib/voting";
import type {
  API,
  ResultsData,
  Session,
  User,
  ViewingMode,
  VoteEntry,
} from "@/lib/types";

const db_uri = env("DB_FILE_NAME");

const sqlite = new Database(db_uri);
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA foreign_keys = ON;");
const db = drizzle(sqlite, { schema });

export async function insertUser(user: typeof schema.usersTable.$inferInsert) {
  await db.insert(schema.usersTable).values(user);
}

export async function getUser(
  uid: (typeof schema.usersTable.$inferSelect)["uid"],
) {
  return (
    await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.uid, uid))
  )[0];
}

/** Everyone who is an admin, by name. */
export async function getAdmins() {
  return await db
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.admin, true))
    .orderBy(asc(schema.usersTable.name));
}

/** Up to 20 users whose name contains `q` (any case). */
export async function searchUsers(q: string) {
  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  return await db
    .select()
    .from(schema.usersTable)
    .where(sql`${schema.usersTable.name} LIKE ${pattern} ESCAPE '\\'`)
    .orderBy(asc(schema.usersTable.name))
    .limit(20);
}

export async function insertState(
  state: typeof schema.statesTable.$inferInsert,
) {
  await db.insert(schema.statesTable).values(state);
}

export async function getVerifier(
  id: (typeof schema.statesTable.$inferSelect)["id"],
) {
  return (
    await db
      .select({ verifier: schema.statesTable.verifier })
      .from(schema.statesTable)
      .where(eq(schema.statesTable.id, id))
  )[0]?.verifier;
}

export async function deleteState(
  id: (typeof schema.statesTable.$inferSelect)["id"],
) {
  return await db
    .delete(schema.statesTable)
    .where(eq(schema.statesTable.id, id));
}

export async function insertSession(
  session: typeof schema.sessionsTable.$inferInsert,
) {
  await db
    .delete(schema.sessionsTable)
    .where(lt(schema.sessionsTable.expiresAt, new Date()));
  return await db.insert(schema.sessionsTable).values(session);
}

const getSessionQuery = db
  .select()
  .from(schema.sessionsTable)
  .where(eq(schema.sessionsTable.id, sql.placeholder("id")))
  .prepare();

export async function getSession(
  id: (typeof schema.sessionsTable.$inferSelect)["id"],
) {
  return getSessionQuery.get({ id });
}

export async function deleteSession(
  id: (typeof schema.sessionsTable.$inferSelect)["id"],
) {
  return await db
    .delete(schema.sessionsTable)
    .where(eq(schema.sessionsTable.id, id));
}

export async function userVoteExists(uid: number, categoryId: string) {
  const existingVote = await db.query.votesTable.findFirst({
    where: (vote, { eq, and }) =>
      and(eq(vote.uid, uid), eq(vote.categoryId, categoryId)),
    columns: {
      uid: true,
    },
  });

  return !!existingVote;
}

export async function getUserVote(uid: number, categoryId: string) {
  const vote = await db.query.votesTable.findFirst({
    where: (vote, { eq, and }) =>
      and(eq(vote.uid, uid), eq(vote.categoryId, categoryId)),
    columns: {
      optionId: true,
    },
  });

  return vote ? vote.optionId : null;
}

/** The user's (first) choice per category. */
export async function getUserVotes(
  uid: number,
): Promise<Record<string, string>> {
  const arrayOfVoteObjects = await db.query.votesTable.findMany({
    where: (vote, { eq, and }) => and(eq(vote.uid, uid), eq(vote.rank, 1)),
    columns: {
      categoryId: true,
      optionId: true,
    },
  });

  const mapped = arrayOfVoteObjects.map(({ categoryId, optionId }) => ({
    [categoryId]: optionId,
  }));
  return Object.assign({}, ...mapped);
}

/** The user's full ballot per category, best choice first. */
export async function getUserBallots(uid: number): Promise<Record<string, string[]>> {
  const rows = await db.query.votesTable.findMany({
    where: (vote, { eq }) => eq(vote.uid, uid),
    columns: { categoryId: true, optionId: true, rank: true },
    orderBy: (vote, { asc }) => [asc(vote.categoryId), asc(vote.rank)],
  });
  const ballots: Record<string, string[]> = {};
  for (const r of rows) (ballots[r.categoryId] ??= []).push(r.optionId);
  return ballots;
}

/** The user's ballot per category as places: groups of equals, best first. */
export async function getUserPlaces(uid: number): Promise<Record<string, Places>> {
  const rows = await db.query.votesTable.findMany({
    where: (vote, { eq }) => eq(vote.uid, uid),
    columns: { categoryId: true, optionId: true, rank: true },
  });
  const byCategory: Record<string, { id: string; rank: number }[]> = {};
  for (const r of rows) (byCategory[r.categoryId] ??= []).push({ id: r.optionId, rank: r.rank });
  return Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, ranksToPlaces(v)]));
}

/** A category with its style and nominee ids, for validating a ballot. */
/** A category open for votes; hidden ones aren't. */
export async function getCategoryForVoting(id: string) {
  return db.query.categoriesTable.findFirst({
    // Everything the vote needs: its style, its timing (rounds) and its nominees.
    where: (c, { and, eq }) => and(eq(c.id, id), eq(c.hidden, false)),
    with: { options: { columns: { id: true } } },
  });
}

/**
 * Store one ballot: each choice with its rank (one, rank 1, for a single
 * pick; 1, 2, 3… for ranked; places shared by equals for points). The first
 * ballot in a category also pins its voting style, so changing the site
 * default later can't change how its votes are counted.
 */
export async function insertBallot(
  session: Session,
  categoryId: string,
  style: VotingStyle,
  choices: { id: string; rank: number }[],
) {
  const at = new Date();
  db.transaction((tx) => {
    tx.insert(schema.votesTable)
      .values(
        choices.map(({ id: optionId, rank }) => ({
          uid: session.uid,
          categoryId,
          optionId,
          rank,
          at,
          sessionSnapshot: session,
        })),
      )
      .run();
    tx.update(schema.categoriesTable)
      .set({ votingStyle: style })
      .where(
        and(eq(schema.categoriesTable.id, categoryId), isNull(schema.categoriesTable.votingStyle)),
      )
      .run();
  });
}

export async function categoryHasVotes(categoryId: string) {
  const vote = await db.query.votesTable.findFirst({
    where: (v, { eq }) => eq(v.categoryId, categoryId),
    columns: { uid: true },
  });
  return !!vote;
}

/**
 * Before the site default changes: categories that have votes but no style of
 * their own keep the style their votes were cast under.
 */
export async function pinVotedCategoryStyles(currentDefault: VotingStyle) {
  await db
    .update(schema.categoriesTable)
    .set({ votingStyle: currentDefault })
    .where(
      and(
        isNull(schema.categoriesTable.votingStyle),
        sql`exists (select 1 from ${schema.votesTable} where ${schema.votesTable.categoryId} = ${schema.categoriesTable.id})`,
      ),
    );
}

/** A page edited from the site (see `pagesTable`), or undefined if it has never been saved. */
export async function getPage(key: string) {
  return (await db.query.pagesTable.findFirst({ where: eq(schema.pagesTable.key, key) }))?.data;
}

export async function setPage(key: string, data: Record<string, unknown>) {
  const updatedAt = new Date();
  await db
    .insert(schema.pagesTable)
    .values({ key, data, updatedAt })
    .onConflictDoUpdate({ target: schema.pagesTable.key, set: { data, updatedAt } });
}

/** Every ballot choice in shown awards, with the award's and nominee's titles (the CSV export). */
export async function getAllBallots() {
  return db
    .select({
      uid: schema.votesTable.uid,
      categoryId: schema.votesTable.categoryId,
      optionId: schema.votesTable.optionId,
      rank: schema.votesTable.rank,
      award: schema.categoriesTable.title,
      position: schema.categoriesTable.position,
      nominee: schema.optionsTable.title,
    })
    .from(schema.votesTable)
    .innerJoin(schema.categoriesTable, eq(schema.categoriesTable.id, schema.votesTable.categoryId))
    .innerJoin(
      schema.optionsTable,
      and(eq(schema.optionsTable.id, schema.votesTable.optionId), eq(schema.optionsTable.categoryId, schema.votesTable.categoryId)),
    )
    .where(eq(schema.categoriesTable.hidden, false))
    .then((rows) => rows.map((r) => ({ ...r, uid: r.uid! })));
}

/** One award's ballots: each voter's choices with their ranks. */
export async function getCategoryBallots(categoryId: string) {
  const rows = await db
    .select({ uid: schema.votesTable.uid, id: schema.votesTable.optionId, rank: schema.votesTable.rank })
    .from(schema.votesTable)
    .where(eq(schema.votesTable.categoryId, categoryId));
  const ballots = new Map<number, { id: string; rank: number }[]>();
  for (const r of rows) ballots.set(r.uid!, [...(ballots.get(r.uid!) ?? []), { id: r.id, rank: r.rank }]);
  return ballots;
}

/** The rounds' names in award order, with or without dates (the previews take them in this order). */
export async function getRoundNames() {
  const rows = await db.query.categoriesTable.findMany({
    columns: { round: true },
    where: (c, { eq }) => eq(c.hidden, false),
    orderBy: (c, { asc }) => [asc(c.position)],
  });
  return [...new Set(rows.map((r) => r.round).filter((r): r is string => !!r))];
}

/** Every shown award's timing (src/lib/rounds.ts): its round, own dates and how many nominees it has. */
export async function getTimings() {
  const rows = await db.query.categoriesTable.findMany({
    columns: { id: true, round: true, opensAt: true, closesAt: true, rankLimit: true, showcase: true },
    where: (c, { eq }) => eq(c.hidden, false),
    with: { options: { columns: { id: true } } },
  });
  return rows.map(({ options, ...r }) => ({ ...r, nominees: options.length }));
}

/** Upsert one setting in the key/value configuration table. */
export async function setSetting(key: string, val: string) {
  await db
    .insert(schema.configurationTable)
    .values({ key, val })
    .onConflictDoUpdate({ target: schema.configurationTable.key, set: { val } });
}

const voteIp = sql<string>`json_extract(${schema.votesTable.sessionSnapshot}, '$.ip')`;
/**
 * Ballots: one voter's vote in one award. Counted over rank-1 rows, but by
 * voter and award, since equals on a points ballot can share first place.
 */
const ballotCount = sql<number>`count(distinct case when ${schema.votesTable.rank} = 1 then ${schema.votesTable.uid} || ':' || ${schema.votesTable.categoryId} end)`;

/**
 * One page of votes (100 rows), newest first, with the voter's name and the
 * category and nominee titles. A ranked ballot is one row per choice.
 */
export async function getVotesPage(
  offset = 0,
  filter: { ip?: string; uid?: number; name?: string } = {},
) {
  const v = schema.votesTable;
  return await db
    .select({
      uid: v.uid,
      name: schema.usersTable.name,
      at: v.at,
      categoryId: v.categoryId,
      categoryTitle: schema.categoriesTable.title,
      optionId: v.optionId,
      optionTitle: schema.optionsTable.title,
      rank: v.rank,
      ip: voteIp,
    })
    .from(v)
    .innerJoin(schema.usersTable, eq(schema.usersTable.uid, v.uid))
    .innerJoin(schema.categoriesTable, eq(schema.categoriesTable.id, v.categoryId))
    .leftJoin(
      schema.optionsTable,
      and(eq(schema.optionsTable.id, v.optionId), eq(schema.optionsTable.categoryId, v.categoryId)),
    )
    .where(
      and(
        filter.uid !== undefined ? eq(v.uid, filter.uid) : undefined,
        filter.ip ? eq(voteIp, filter.ip) : undefined,
        filter.name ? sql`lower(${schema.usersTable.name}) = lower(${filter.name})` : undefined,
      ),
    )
    .orderBy(desc(v.at), asc(v.uid), asc(v.categoryId), asc(v.rank))
    .limit(100)
    .offset(offset);
}

/**
 * Totals for the admin Votes tab. A ballot is one voter's vote in one
 * category (a ranked ballot counts once, however many choices it has).
 */
export async function getVoteStats() {
  const v = schema.votesTable;
  const [totals] = await db
    .select({
      voters: sql<number>`count(distinct ${v.uid})`,
      ballots: ballotCount,
      users: sql<number>`(select count(*) from ${schema.usersTable})`,
    })
    .from(v);
  const categories = await db
    .select({
      id: schema.categoriesTable.id,
      title: schema.categoriesTable.title,
      ballots: sql<number>`count(distinct ${v.uid})`,
    })
    .from(schema.categoriesTable)
    .leftJoin(v, and(eq(v.categoryId, schema.categoriesTable.id), eq(v.rank, 1)))
    .groupBy(schema.categoriesTable.id)
    .orderBy(asc(schema.categoriesTable.position));
  const day = sql<string>`date(${v.at}, 'unixepoch')`;
  const days = await db
    .select({ day, ballots: ballotCount, voters: sql<number>`count(distinct ${v.uid})` })
    .from(v)
    .where(eq(v.rank, 1))
    .groupBy(day)
    .orderBy(asc(day));
  // Several accounts voting from one address is the plainest bot signal.
  // Only votes with a kept address count (see the recordIp setting).
  const sharedIps = await db
    .select({ ip: voteIp, voters: sql<number>`count(distinct ${v.uid})` })
    .from(v)
    .where(sql`${voteIp} is not null`)
    .groupBy(voteIp)
    .having(sql`count(distinct ${v.uid}) > 1`)
    .orderBy(desc(sql`count(distinct ${v.uid})`))
    .limit(10);
  return { ...totals!, categories, days, sharedIps };
}

/**
 * The public tally, with the results: how many people voted, ballots (one
 * voter's vote in one award), and both per day (UTC). Counts only; nothing
 * about anyone (rinlux, 2026-11-09).
 */
export async function getVoteTally() {
  const v = schema.votesTable;
  const [totals] = await db
    .select({
      voters: sql<number>`count(distinct ${v.uid})`,
      ballots: ballotCount,
    })
    .from(v);
  const day = sql<string>`date(${v.at}, 'unixepoch')`;
  const days = await db
    .select({ day, voters: sql<number>`count(distinct ${v.uid})`, ballots: ballotCount })
    .from(v)
    .where(eq(v.rank, 1))
    .groupBy(day)
    .orderBy(asc(day));
  return { ...totals!, days };
}

export async function getNominee(categoryId: string, id: string) {
  return db.query.optionsTable.findFirst({
    where: (o, { and, eq }) => and(eq(o.categoryId, categoryId), eq(o.id, id)),
  });
}

export type NomineeRow = typeof schema.optionsTable.$inferSelect;
export type CategoryRow = typeof schema.categoriesTable.$inferSelect;

/** A category without its nominees. */
export async function getCategory(id: string) {
  return db.query.categoriesTable.findFirst({ where: (c, { eq }) => eq(c.id, id) });
}

/** A category's nominees as stored, in display order. */
export async function getCategoryNominees(categoryId: string) {
  return db.query.optionsTable.findMany({
    where: (o, { eq }) => eq(o.categoryId, categoryId),
    orderBy: (o, { asc }) => [asc(o.position)],
  });
}

/** Set any of a nominee's columns, for undo. */
export async function setNomineeFields(categoryId: string, id: string, fields: Partial<NomineeRow>) {
  const { id: _id, categoryId: _cat, ...rest } = fields;
  if (Object.keys(rest).length === 0) return;
  await db
    .update(schema.optionsTable)
    .set(rest)
    .where(and(eq(schema.optionsTable.categoryId, categoryId), eq(schema.optionsTable.id, id)));
}

/**
 * Move a nominee to another award, keeping everything it has (picture,
 * emote, clip, links), at `position` there or last. Only for nominees
 * without votes: votes point at (nominee, award). Throws if the id is taken
 * in the other award.
 */
export async function moveNominee(fromCategory: string, id: string, toCategory: string, position?: number) {
  if (await getNominee(toCategory, id)) throw new Error(`"${id}" is already in "${toCategory}"`);
  if (await nomineeHasVotes(fromCategory, id)) throw new Error(`"${id}" in "${fromCategory}" has votes`);
  const last = (await getCategoryNominees(toCategory)).reduce((n, o) => Math.max(n, o.position), -1);
  await db
    .update(schema.optionsTable)
    .set({ categoryId: toCategory, position: position ?? last + 1 })
    .where(and(eq(schema.optionsTable.categoryId, fromCategory), eq(schema.optionsTable.id, id)));
}

/** Set any of a category's columns, for undo. */
export async function setCategoryFields(id: string, fields: Partial<CategoryRow>) {
  const { id: _id, ...rest } = fields;
  if (Object.keys(rest).length === 0) return;
  await db.update(schema.categoriesTable).set(rest).where(eq(schema.categoriesTable.id, id));
}

/** Per category: hidden or not, and whether it has any votes. */
export async function getCategoryFlags() {
  const rows = await db
    .select({
      id: schema.categoriesTable.id,
      hidden: schema.categoriesTable.hidden,
      hasVotes: sql<number>`exists (select 1 from votes v where v.categoryId = ${schema.categoriesTable.id})`,
    })
    .from(schema.categoriesTable);
  return new Map(rows.map((r) => [r.id, { hidden: r.hidden, hasVotes: Boolean(r.hasVotes) }]));
}

/**
 * Copy the whole database to `<db folder>/backups/<time>-<reason>.db` and
 * keep the newest 20. A consistent copy even while the site is in use.
 */
export async function backupDatabase(reason: string) {
  const { mkdir, readdir, rm } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const dir = join(dirname(db_uri), "backups");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${reason}.db`);
  sqlite.run("VACUUM INTO ?", [file]);
  const old = (await readdir(dir)).filter((f) => f.endsWith(".db")).sort().slice(0, -20);
  for (const f of old) await rm(join(dir, f), { force: true });
  return file;
}

/** Tables that aren't data: sign-ins in progress and sessions stay out of backups. */
const NOT_BACKED_UP = ["sessions", "states"];
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * The whole database as one SQLite file: a consistent copy (VACUUM INTO),
 * without sessions or sign-ins in progress. For downloads and off-site backups.
 */
export async function snapshotDatabase(): Promise<Uint8Array> {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "snapshot-"));
  try {
    const file = join(dir, "snapshot.db");
    sqlite.run("VACUUM INTO ?", [file]);
    const copy = new Database(file);
    for (const table of NOT_BACKED_UP) copy.run(`DELETE FROM "${table}"`);
    copy.run("VACUUM");
    copy.close();
    return new Uint8Array(await Bun.file(file).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** How far a database's schema has got: its applied migrations, in order. */
function migrationsOf(conn: Database): string[] {
  try {
    return conn.query<{ hash: string }, []>(`SELECT hash FROM "${MIGRATIONS_TABLE}" ORDER BY created_at`).all().map((r) => r.hash);
  } catch {
    return [];
  }
}

export class RestoreError extends Error {}

/**
 * Replace everything in the live database with a backup's contents, in one
 * transaction. The backup must be from the same schema (the same migrations
 * applied). The current database is copied to backups/ first. Sessions stay,
 * so whoever restores stays signed in (if their account is in the backup).
 * Returns the number of rows restored per table.
 */
export async function restoreDatabase(data: Uint8Array): Promise<Record<string, number>> {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "restore-"));
  try {
    const file = join(dir, "restore.db");
    await Bun.write(file, data);
    let source: Database;
    try {
      source = new Database(file, { readonly: true });
      source.query("SELECT count(*) FROM sqlite_master").get();
    } catch {
      throw new RestoreError("That file isn't a readable database.");
    }
    const theirs = migrationsOf(source);
    source.close();
    const ours = migrationsOf(sqlite);
    if (theirs.length === 0) throw new RestoreError("That database isn't a DGG Awards backup.");
    if (theirs.join() !== ours.join()) {
      throw new RestoreError(
        theirs.length < ours.length && ours.slice(0, theirs.length).join() === theirs.join()
          ? `That backup is from an older version of the site (${theirs.length} of ${ours.length} database updates). Restore it on that version, or run its updates first (see docs/migration.md).`
          : "That backup is from a different version of the site; its database updates don't match this one's.",
      );
    }

    await backupDatabase("before-restore");
    const tables = sqlite
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '${MIGRATIONS_TABLE}'`,
      )
      .all()
      .map((t) => t.name)
      .filter((t) => !NOT_BACKED_UP.includes(t));
    const counts: Record<string, number> = {};
    sqlite.run("PRAGMA foreign_keys = OFF");
    sqlite.run("ATTACH DATABASE ? AS restore", [file]);
    try {
      sqlite.transaction(() => {
        for (const t of tables) {
          sqlite.run(`DELETE FROM main."${t}"`);
          sqlite.run(`INSERT INTO main."${t}" SELECT * FROM restore."${t}"`);
          counts[t] = sqlite.query<{ n: number }, []>(`SELECT count(*) AS n FROM main."${t}"`).get()!.n;
        }
        // Sessions whose account isn't in the backup can't stay.
        sqlite.run(`DELETE FROM main.sessions WHERE uid NOT IN (SELECT uid FROM main.users)`);
      })();
    } finally {
      sqlite.run("DETACH DATABASE restore");
      sqlite.run("PRAGMA foreign_keys = ON");
    }
    return counts;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function nomineeHasVotes(categoryId: string, id: string) {
  const vote = await db.query.votesTable.findFirst({
    where: (v, { and, eq }) => and(eq(v.categoryId, categoryId), eq(v.optionId, id)),
  });
  return vote !== undefined;
}

export type HistoryInsert = typeof schema.historyTable.$inferInsert;

export async function insertHistory(entry: HistoryInsert) {
  const [row] = await db.insert(schema.historyTable).values(entry).returning({ id: schema.historyTable.id });
  return row!.id;
}

export async function getHistoryEntry(id: number) {
  return db.query.historyTable.findFirst({ where: (h, { eq }) => eq(h.id, id) });
}

/** The entry that undid `id`, if one did. */
export async function getUndoOf(id: number) {
  return db.query.historyTable.findFirst({ where: (h, { eq }) => eq(h.revertOf, id) });
}

/**
 * History, newest first, 50 a page. A category filter includes its nominees'
 * entries. `undoneBy`: the entry that undid this one.
 */
export async function getHistory(
  page = 0,
  filter: { kind?: schema.HistoryKind; categoryId?: string; nomineeId?: string; uid?: number } = {},
) {
  const h = schema.historyTable;
  return db
    .select({
      ...getTableColumns(h),
      // Written out in full: inside the subquery a bare "id" would mean u.id.
      undoneBy: sql<number | null>`(select u.id from history u where u.revertOf = "history"."id" limit 1)`,
    })
    .from(h)
    .where(
      and(
        filter.kind ? eq(h.kind, filter.kind) : undefined,
        filter.categoryId ? eq(h.categoryId, filter.categoryId) : undefined,
        filter.nomineeId ? eq(h.nomineeId, filter.nomineeId) : undefined,
        filter.uid !== undefined ? eq(h.uid, filter.uid) : undefined,
      ),
    )
    .orderBy(desc(h.id))
    .limit(50)
    .offset(page * 50);
}

/** Clip fields managed by src/server/clips.ts. */
export async function setNomineeMedia(
  categoryId: string,
  id: string,
  media: Partial<
    Pick<
      InferInsertModel<typeof schema.optionsTable>,
      "clipKey" | "clipStatus" | "clipError" | "thumbnailKey" | "thumbnailAt"
    >
  >,
) {
  await db
    .update(schema.optionsTable)
    .set(media)
    .where(and(eq(schema.optionsTable.categoryId, categoryId), eq(schema.optionsTable.id, id)));
}

/** Nominees whose clip job was queued or running when the server stopped. */
export async function listUnfinishedClips() {
  return db.query.optionsTable.findMany({
    where: (o, { inArray }) => inArray(o.clipStatus, ["pending", "processing"]),
    columns: { categoryId: true, id: true },
  });
}

/** Every category with its nominees, in display order. */
/**
 * Every category with its nominees, in order. `admin` adds the admin-only
 * fields (`listNumber`, `chatName`, `winnerLine`, and the award's `askDates`); everything public leaves
 * them out, so voters never get them.
 */
export async function getNominees({ includeHidden = false, admin = false } = {}) {
  return await db.query.categoriesTable.findMany({
    columns: admin
      ? { position: false, hidden: false }
      : { position: false, hidden: false, askDates: false, announcerKey: false, announcerUrl: false },
    where: includeHidden ? undefined : (c, { eq }) => eq(c.hidden, false),
    orderBy: (c, { asc }) => [asc(c.position)],
    with: {
      options: {
        columns: admin ? { position: false } : { position: false, listNumber: false, chatName: false, winnerLine: false },
        orderBy: (o, { asc }) => [asc(o.position)],
      },
    },
  });
}

/** Set the display order of all categories: `ids` first to last. */
export async function reorderCategories(ids: string[]) {
  db.transaction((tx) => {
    ids.forEach((id, i) =>
      tx.update(schema.categoriesTable).set({ position: i }).where(eq(schema.categoriesTable.id, id)).run(),
    );
  });
}

/** Set the display order of one category's nominees. */
export async function reorderNominees(categoryId: string, ids: string[]) {
  db.transaction((tx) => {
    ids.forEach((id, i) =>
      tx
        .update(schema.optionsTable)
        .set({ position: i })
        .where(and(eq(schema.optionsTable.categoryId, categoryId), eq(schema.optionsTable.id, id)))
        .run(),
    );
  });
}

export async function deleteNominee(categoryId: string, id: string) {
  return await db
    .delete(schema.optionsTable)
    .where(
      and(
        eq(schema.optionsTable.categoryId, categoryId),
        eq(schema.optionsTable.id, id),
      ),
    );
}

export async function insertCategory(
  category: InferInsertModel<typeof schema.categoriesTable>,
) {
  // New categories go last.
  return await db.insert(schema.categoriesTable).values({
    position: sql`(select coalesce(max("position"), -1) + 1 from "categories")`,
    ...category,
  });
}

export async function updateCategory({
  id,
  description,
  title,
  votingStyle,
  hidden,
  askDates,
  announcerKey,
  announcerUrl,
  round,
  opensAt,
  closesAt,
  rankLimit,
  showcase,
}: Partial<InferInsertModel<typeof schema.categoriesTable>> & {
  id: string;
}) {
  return await db
    .update(schema.categoriesTable)
    .set({ description, title, votingStyle, hidden, askDates, announcerKey, announcerUrl, round, opensAt, closesAt, rankLimit, showcase })
    .where(eq(schema.categoriesTable.id, id));
}

export async function updateNominee(d: API.PATCH_NomineeRequest) {
  return await db
    .update(schema.optionsTable)
    .set({
      description: d.description,
      imageId: d.imageId,
      renderType: d.renderType,
      title: d.title,
      url: d.url,
      videoId: d.videoId,
      date: d.date,
      linkType: d.linkType,
      clipStart: d.clipStart,
      clipEnd: d.clipEnd,
      emote: d.emote,
      listNumber: d.listNumber,
      chatName: d.chatName,
      winnerLine: d.winnerLine,
    })
    .where(
      and(
        eq(schema.optionsTable.id, d.id),
        eq(schema.optionsTable.categoryId, d.categoryId),
      ),
    );
}

export async function deleteCategory(id: string) {
  return await db
    .delete(schema.categoriesTable)
    .where(eq(schema.categoriesTable.id, id));
}

export async function insertNominee(
  nominee: InferInsertModel<typeof schema.optionsTable>,
) {
  // New nominees go last in their category.
  return await db.insert(schema.optionsTable).values({
    position: sql`(select coalesce(max("position"), -1) + 1 from "options" where "categoryId" = ${nominee.categoryId})`,
    ...nominee,
  });
}

/**
 * Site settings from the key/value table. Values are stored as text, so the
 * times are unix seconds as strings, and any key can be missing.
 */
export async function getConfig(): Promise<{
  startTime?: string;
  endTime?: string;
  viewingMode?: ViewingMode;
  message?: string;
  /** The year being awarded, e.g. "2025". Nominee dates are checked against it. */
  awardYear?: string;
  /** Style for categories that don't set their own. */
  defaultVotingStyle?: VotingStyle;
  /** "on" to keep voters' IP addresses with sign-ins and votes. Off when missing. */
  recordIp?: "on" | "off";
  /** "on" to keep voters' browser (user agent) with sign-ins and votes. Off when missing. */
  recordAgent?: "on" | "off";
}> {
  const arrayOfObjects = await db.query.configurationTable.findMany();

  const mapped = arrayOfObjects.map(({ key, val }) => ({
    [key]: val,
  }));
  return Object.assign({}, ...mapped);
}

export async function setConfig(
  startTime: number,
  endTime: number,
  viewingMode: ViewingMode,
) {
  return await db.transaction(async (tx) => {
    const configs = [
      { key: "startTime", val: startTime.toString() },
      { key: "endTime", val: endTime.toString() },
      { key: "viewingMode", val: viewingMode },
    ];

    for (const config of configs) {
      await tx
        .insert(schema.configurationTable)
        .values(config)
        .onConflictDoUpdate({
          target: schema.configurationTable.key,
          set: { val: config.val },
        });
    }
  });
}

export async function setViewingMode(
  viewingMode: ViewingMode,
  message: string | null = null,
) {
  try {
    await db.insert(schema.configurationTable).values([
      { key: "viewingMode", val: viewingMode },
      { key: "message", val: message ?? "" },
    ]);
  } catch (error) {
    await db
      .update(schema.configurationTable)
      .set({ val: viewingMode })
      .where(eq(schema.configurationTable.key, "viewingMode"));
    await db
      .update(schema.configurationTable)
      .set({ key: "message" })
      .where(eq(schema.configurationTable.key, "message"));
  }
}

export async function setUserAdmin(uid: User["uid"], admin: boolean) {
  await db
    .update(schema.usersTable)
    .set({ admin })
    .where(eq(schema.usersTable.uid, uid));
}

/**
 * Results per category. `count` is first choices (the only choice in a
 * single-pick category), and `totalVotes` the number of voters. Nominees are
 * ordered last place first, for the reveal. In a ranked category the order
 * and the winner come from the instant runoff, whose rounds are included.
 */
export function processVoteResults(
  options: VoteEntry[],
  defaultStyle: VotingStyle | undefined,
): ResultsData {
  const categories = new Map<string, { meta: VoteEntry["category"]; options: VoteEntry[] }>();
  for (const option of options) {
    const group = categories.get(option.categoryId) ?? { meta: option.category, options: [] };
    group.options.push(option);
    categories.set(option.categoryId, group);
  }

  return Array.from(categories.values()).map(({ meta, options }) => {
    const style = effectiveStyle(meta.votingStyle, defaultStyle);
    const firstChoices = (o: VoteEntry) => o.votes.filter((v) => v.rank === 1).length;
    let totalVotes = options.reduce((n, o) => n + firstChoices(o), 0);

    let runoff: RunoffResult | undefined;
    let tally: PointsResult | undefined;
    let place: (o: VoteEntry) => number; // higher is better
    let winners: Set<string>;
    if (style === "ranked") {
      const ballots = new Map<number, { rank: number; id: string }[]>();
      for (const o of options) {
        for (const v of o.votes) {
          ballots.set(v.uid, [...(ballots.get(v.uid) ?? []), { rank: v.rank, id: o.id }]);
        }
      }
      runoff = instantRunoff(
        options.map((o) => o.id),
        [...ballots.values()].map((b) => b.sort((x, y) => x.rank - y.rank).map((c) => c.id)),
      );
      // Out in round r ranks below everyone who lasted longer; winners last.
      const outInRound = new Map<string, number>();
      runoff.rounds.forEach((r, i) => r.eliminated.forEach((id) => outInRound.set(id, i)));
      place = (o) => outInRound.get(o.id) ?? runoff!.rounds.length;
      winners = new Set(runoff.winners);
    } else if (style === "points") {
      const ballots = new Map<number, { id: string; rank: number }[]>();
      for (const o of options) for (const v of o.votes) ballots.set(v.uid, [...(ballots.get(v.uid) ?? []), { id: o.id, rank: v.rank }]);
      const t = countPoints(
        options.map((o) => o.id),
        [...ballots.values()].map(ranksToPlaces),
      );
      tally = t;
      totalVotes = t.ballots;
      // Best last, like the others: the reveal goes from last place up.
      place = (o) => t.order.length - t.order.indexOf(o.id);
      winners = new Set(t.winners);
    } else {
      const max = Math.max(...options.map(firstChoices));
      place = () => 0;
      winners = new Set(options.filter((o) => max > 0 && firstChoices(o) === max).map((o) => o.id));
    }

    const ordered = [...options].sort(
      (a, b) => place(a) - place(b) || firstChoices(a) - firstChoices(b),
    );

    const allPoints = tally ? Object.values(tally.points).reduce((a, b) => a + b, 0) : 0;
    const share = (opt: VoteEntry, count: number) => {
      // For points awards: the share of all points given.
      if (tally) return allPoints === 0 ? 0 : Number(((tally.points[opt.id]! / allPoints) * 100).toFixed(1));
      return totalVotes === 0 ? 0 : Number(((count / totalVotes) * 100).toFixed(1));
    };
    return {
      categoryId: meta.id,
      categoryTitle: meta.title,
      categoryDescription: meta.description,
      votingStyle: style,
      showcase: meta.showcase,
      totalVotes,
      options: ordered.map((opt) => {
        const count = firstChoices(opt);
        // The admin-only fields stay out: results are public.
        const { category, votes, position, listNumber, chatName, winnerLine, ...payload } = opt;
        return {
          id: opt.id,
          title: opt.title,
          count,
          percentage: share(opt, count),
          isWinner: winners.has(opt.id),
          ...(tally ? { points: tally.points[opt.id]!, placed: tally.placed[opt.id]! } : {}),
          payload,
        };
      }),
      ...(runoff ? { runoff } : {}),
    };
  });
}

export async function getVotingResults(): Promise<ResultsData> {
  const allResults = await db.query.optionsTable.findMany({
    with: { votes: true, category: true },
  });
  // Display order: categories, then nominees within each. Hidden categories
  // aren't in the results.
  const shown = allResults
    .filter((o) => !o.category.hidden)
    .sort((a, b) => a.category.position - b.category.position || a.position - b.position);
  const config = await getConfig();
  return processVoteResults(shown, config.defaultVotingStyle);
}
