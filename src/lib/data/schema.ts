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
import type { Session } from "@/lib/types";

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
    ip: text().notNull(),
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
    sessionSnapshot: text({ mode: "json" }).$type<Session>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.uid, table.categoryId] }),
    foreignKey({
      columns: [table.optionId, table.categoryId],
      foreignColumns: [optionsTable.id, optionsTable.categoryId],
    }),
  ],
);

export const votesRelations = relations(votesTable, ({ one }) => ({
  option: one(optionsTable, {
    fields: [votesTable.optionId],
    references: [optionsTable.id],
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
