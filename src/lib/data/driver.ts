import { Database } from "bun:sqlite";
import {
  type InferInsertModel,
  type InferSelectModel,
  and,
  eq,
  lt,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/lib/data/schema";
import { env } from "@/lib/util";
import type {
  API,
  ResultsData,
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

export async function getUserVotes(
  uid: number,
): Promise<Record<string, string>> {
  const arrayOfVoteObjects = await db.query.votesTable.findMany({
    where: (vote, { eq }) => eq(vote.uid, uid),
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

export async function insertVote(
  vote: InferInsertModel<typeof schema.votesTable>,
) {
  return await db.insert(schema.votesTable).values(vote);
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
}: Partial<InferInsertModel<typeof schema.categoriesTable>> & {
  id: string;
}) {
  return await db
    .update(schema.categoriesTable)
    .set({ description, title })
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
  nominee: InferSelectModel<typeof schema.optionsTable>,
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

export function processVoteResults(options: VoteEntry[]): ResultsData {
  const categories = new Map<
    string,
    {
      meta: VoteEntry["category"];
      totalVotes: number;
      options: typeof options;
    }
  >();

  for (const option of options) {
    if (!categories.has(option.categoryId)) {
      categories.set(option.categoryId, {
        meta: option.category,
        totalVotes: 0,
        options: [],
      });
    }

    const catGroup = categories.get(option.categoryId)!;
    catGroup.totalVotes += option.votes.length;
    catGroup.options.push(option);
  }

  return Array.from(categories.values()).map((group) => {
    const maxVotes = Math.max(...group.options.map((o) => o.votes.length));

    const sortedOptions = group.options.sort(
      (a, b) => a.votes.length - b.votes.length,
    );

    return {
      categoryId: group.meta.id,
      categoryTitle: group.meta.title,
      categoryDescription: group.meta.description,
      totalVotes: group.totalVotes,
      options: sortedOptions.map((opt) => {
        const count = opt.votes.length;

        const percentage =
          group.totalVotes === 0
            ? 0
            : Number(((count / group.totalVotes) * 100).toFixed(1));

        const { category, votes, ...cleanOptionPayload } = opt;

        return {
          id: opt.id,
          title: opt.title,
          count: count,
          percentage: percentage,
          isWinner: count === maxVotes && count > 0,
          payload: cleanOptionPayload,
        };
      }),
    };
  });
}
export async function getVotingResults(): Promise<ResultsData> {
  const allResults = await db.query.optionsTable.findMany({
    with: { votes: true, category: true },
  });

  return processVoteResults(allResults);
}
