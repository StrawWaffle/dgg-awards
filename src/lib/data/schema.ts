import { relations } from "drizzle-orm";
import {
  foreignKey,
  index,
  int,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { LinkType } from "@/lib/links";

export type ClipStatus = "pending" | "processing" | "ready" | "failed";
import type { Session } from "@/lib/types";
import type { VotingStyle } from "@/lib/voting";

export const usersTable = sqliteTable("users", {
  uid: int().primaryKey(),
  name: text().notNull(),
  createdDate: text().notNull(),
  admin: int({ mode: "boolean" }).notNull(),
});

export const sessionsTable = sqliteTable(
  "sessions",
  {
    id: text().primaryKey(),
    createdAt: int({ mode: "timestamp" }).notNull(),
    expiresAt: int({ mode: "timestamp" }).notNull(),
    uid: int()
      .references(() => usersTable.uid, { onDelete: "cascade" })
      .notNull(),
    /** Only when the "recordIp" setting is on; otherwise null. */
    ip: text(),
    /** Only when the "recordAgent" setting is on; otherwise "". */
    agent: text().notNull(),
  },
  (table) => [
    index("sessions_uid_idx").on(table.uid),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

export const statesTable = sqliteTable("states", {
  id: text().primaryKey(),
  verifier: text().notNull(),
});

export const categoriesTable = sqliteTable("categories", {
  id: text().primaryKey(),
  title: text().notNull(),
  description: text().notNull(),
  /** Null: use the site default (config defaultVotingStyle). Fixed once voted on. */
  votingStyle: text().$type<VotingStyle>(),
  /** Display order, set by dragging in the admin editor. Lowest first. */
  position: int().notNull().default(0),
  /**
   * Hidden from the site and the results, with its nominees and votes kept.
   * A category with votes can only be hidden, not deleted.
   */
  hidden: int({ mode: "boolean" }).notNull().default(false),
});

export const optionsTable = sqliteTable(
  "options",
  {
    id: text().notNull(),
    categoryId: text()
      .references(() => categoriesTable.id, {
        onDelete: "cascade",
      })
      .notNull(),
    title: text().notNull(),
    description: text().notNull(),
    url: text(),
    imageId: text(),
    videoId: text(),
    renderType: text()
      .$type<"default" | "compact">()
      .$default(() => "default"),
    /** When it happened, YYYY-MM-DD. Checked against the award year. */
    date: text(),
    /** What `url` points at. Null means work it out from the URL. */
    linkType: text().$type<LinkType>(),
    /** The clip's range within the source, in seconds. */
    clipStart: int(),
    clipEnd: int(),
    /** The downloaded clip (src/server/clips.ts), as a media storage key. */
    clipKey: text(),
    clipStatus: text().$type<ClipStatus>(),
    /** Why the last clip build failed, for the admin page. */
    clipError: text(),
    /** The nominee's thumbnail, from a clip frame or an upload. */
    thumbnailKey: text(),
    /** Seconds into the clip the thumbnail frame was taken at. */
    thumbnailAt: int(),
    /** Display order within the category. Lowest first. */
    position: int().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.id, table.categoryId] })],
);

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  options: many(optionsTable),
}));

export const optionsRelations = relations(optionsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [optionsTable.categoryId],
    references: [categoriesTable.id],
  }),
  votes: many(votesTable),
}));

export const votesTable = sqliteTable(
  "votes",
  {
    uid: int()
      .references(() => usersTable.uid)
      .notNull(),
    at: int({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    categoryId: text()
      .references(() => categoriesTable.id, { onDelete: "cascade" })
      .notNull(),
    optionId: text().notNull(),
    /** 1 for a single-pick vote; 1, 2, 3… for a ranked ballot's choices. */
    rank: int().notNull().default(1),
    sessionSnapshot: text({ mode: "json" }).$type<Session>().notNull(),
  },
  (table) => [
    // One row per choice: a ranked ballot has several per category.
    primaryKey({ columns: [table.uid, table.categoryId, table.optionId] }),
    foreignKey({
      columns: [table.optionId, table.categoryId],
      foreignColumns: [optionsTable.id, optionsTable.categoryId],
    }),
  ],
);

export const votesRelations = relations(votesTable, ({ one }) => ({
  // Nominee ids are only unique within a category (the same person can be in
  // several), so a vote belongs to (optionId, categoryId). Matching on the id
  // alone credited each nominee with its namesakes' votes in other categories.
  option: one(optionsTable, {
    fields: [votesTable.optionId, votesTable.categoryId],
    references: [optionsTable.id, optionsTable.categoryId],
  }),
  category: one(categoriesTable, {
    fields: [votesTable.categoryId],
    references: [categoriesTable.id],
  }),
}));

export const configurationTable = sqliteTable("configuration", {
  key: text().primaryKey(),
  val: text().notNull(),
});

export type HistoryKind = "category" | "nominee" | "settings" | "admin" | "order" | "import";
export type HistoryAction = "create" | "update" | "delete";

/**
 * Every change made from the admin page, for the History tab and undo.
 * `before` and `after` are snapshots of what changed (a nominee or category
 * row, settings, an admin flag or an order); `before` is null for a create
 * and `after` for a delete.
 */
export const historyTable = sqliteTable(
  "history",
  {
    id: int().primaryKey({ autoIncrement: true }),
    at: int({ mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Who did it; null for the server itself (a clip build finishing). */
    uid: int(),
    /** Their name at the time, so the entry still reads right later. */
    name: text().notNull(),
    kind: text().$type<HistoryKind>().notNull(),
    action: text().$type<HistoryAction>().notNull(),
    categoryId: text(),
    nomineeId: text(),
    /** What it was about, as it was then: "Zee · Ally of the Year". */
    label: text().notNull(),
    before: text({ mode: "json" }).$type<Record<string, unknown>>(),
    after: text({ mode: "json" }).$type<Record<string, unknown>>(),
    /** Set when this entry undid another one. */
    revertOf: int(),
  },
  (table) => [
    index("history_target_idx").on(table.categoryId, table.nomineeId),
    index("history_revert_idx").on(table.revertOf),
  ],
);
