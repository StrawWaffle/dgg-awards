import { Database } from "bun:sqlite";
import {
  type InferInsertModel,
  type InferSelectModel,
  and,
  asc,
  desc,
  eq,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/lib/data/schema";
import { env } from "@/lib/util";
import {
  type RunoffResult,
  type VotingStyle,
  effectiveStyle,
  instantRunoff,
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

/** A category with its style and nominee ids, for validating a ballot. */
export async function getCategoryForVoting(id: string) {
  return db.query.categoriesTable.findFirst({
    where: (c, { eq }) => eq(c.id, id),
    with: { options: { columns: { id: true } } },
  });
}

/**
 * Store one ballot: choices in order (one for single pick). The first ballot
 * in a category also pins its voting style, so changing the site default
 * later can't change how its votes are counted.
 */
export async function insertBallot(
  session: Session,
  categoryId: string,
  style: VotingStyle,
  choices: string[],
) {
  const at = new Date();
  db.transaction((tx) => {
    tx.insert(schema.votesTable)
      .values(
        choices.map((optionId, i) => ({
          uid: session.uid,
          categoryId,
          optionId,
          rank: i + 1,
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

/** Upsert one setting in the key/value configuration table. */
export async function setSetting(key: string, val: string) {
  await db
    .insert(schema.configurationTable)
    .values({ key, val })
    .onConflictDoUpdate({ target: schema.configurationTable.key, set: { val } });
}

const voteIp = sql<string>`json_extract(${schema.votesTable.sessionSnapshot}, '$.ip')`;

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
      ballots: sql<number>`count(*) filter (where ${v.rank} = 1)`,
      users: sql<number>`(select count(*) from ${schema.usersTable})`,
    })
    .from(v);
  const categories = await db
    .select({
      id: schema.categoriesTable.id,
      title: schema.categoriesTable.title,
      ballots: sql<number>`count(${v.uid})`,
    })
    .from(schema.categoriesTable)
    .leftJoin(v, and(eq(v.categoryId, schema.categoriesTable.id), eq(v.rank, 1)))
    .groupBy(schema.categoriesTable.id)
    .orderBy(asc(schema.categoriesTable.position));
  const day = sql<string>`date(${v.at}, 'unixepoch')`;
  const days = await db
    .select({ day, ballots: sql<number>`count(*)`, voters: sql<number>`count(distinct ${v.uid})` })
    .from(v)
    .where(eq(v.rank, 1))
    .groupBy(day)
    .orderBy(asc(day));
  // Several accounts voting from one address is the plainest bot signal.
  const sharedIps = await db
    .select({ ip: voteIp, voters: sql<number>`count(distinct ${v.uid})` })
    .from(v)
    .groupBy(voteIp)
    .having(sql`count(distinct ${v.uid}) > 1`)
    .orderBy(desc(sql`count(distinct ${v.uid})`))
    .limit(10);
  return { ...totals!, categories, days, sharedIps };
}

export async function getNominee(categoryId: string, id: string) {
  return db.query.optionsTable.findFirst({
    where: (o, { and, eq }) => and(eq(o.categoryId, categoryId), eq(o.id, id)),
  });
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
export async function getNominees() {
  return await db.query.categoriesTable.findMany({
    columns: { position: false },
    orderBy: (c, { asc }) => [asc(c.position)],
    with: {
      options: {
        columns: { position: false },
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
}: Partial<InferInsertModel<typeof schema.categoriesTable>> & {
  id: string;
}) {
  return await db
    .update(schema.categoriesTable)
    .set({ description, title, votingStyle })
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
    const totalVotes = options.reduce((n, o) => n + firstChoices(o), 0);

    let runoff: RunoffResult | undefined;
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
    } else {
      const max = Math.max(...options.map(firstChoices));
      place = () => 0;
      winners = new Set(options.filter((o) => max > 0 && firstChoices(o) === max).map((o) => o.id));
    }

    const ordered = [...options].sort(
      (a, b) => place(a) - place(b) || firstChoices(a) - firstChoices(b),
    );

    return {
      categoryId: meta.id,
      categoryTitle: meta.title,
      categoryDescription: meta.description,
      votingStyle: style,
      totalVotes,
      options: ordered.map((opt) => {
        const count = firstChoices(opt);
        const { category, votes, position, ...payload } = opt;
        return {
          id: opt.id,
          title: opt.title,
          count,
          percentage:
            totalVotes === 0 ? 0 : Number(((count / totalVotes) * 100).toFixed(1)),
          isWinner: winners.has(opt.id),
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
  // Display order: categories, then nominees within each.
  allResults.sort((a, b) => a.category.position - b.category.position || a.position - b.position);
  const config = await getConfig();
  return processVoteResults(allResults, config.defaultVotingStyle);
}
