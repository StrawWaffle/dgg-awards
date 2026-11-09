import { Database } from "bun:sqlite";
import {
  type InferInsertModel,
  type InferSelectModel,
  and,
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

export async function getAllUsers() {
  return await db.query.usersTable.findMany();
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

export async function getAllVotes(offset = 0) {
  return await db.query.votesTable.findMany({ limit: 100, offset });
}

export async function getAllVotesFiltered(
  offset = 0,
  ipFilter?: string,
  uidFilter?: string,
) {
  return await db.query.votesTable.findMany({
    limit: 100,
    offset,
    where() {
      return and(
        uidFilter ? eq(schema.votesTable.uid, parseInt(uidFilter)) : undefined,
        ipFilter
          ? eq(
              sql<string>`json_extract(${schema.votesTable.sessionSnapshot}, '$.ip')`,
              ipFilter,
            )
          : undefined,
      );
    },
  });
}

export async function getNominees() {
  return await db.query.categoriesTable.findMany({ with: { options: true } });
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
  return await db.insert(schema.categoriesTable).values(category);
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
  return await db.insert(schema.optionsTable).values(nominee);
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

export async function updateUserMakeAdmin(uid: User["uid"]) {
  await db
    .update(schema.usersTable)
    .set({ admin: true })
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
        const { category, votes, ...payload } = opt;
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
  const config = await getConfig();
  return processVoteResults(allResults, config.defaultVotingStyle);
}
