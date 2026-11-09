// Applies the committed migrations in ./drizzle to DB_FILE_NAME.
// Runs at container start, so a fresh volume gets the schema without drizzle-kit.
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { env } from "@/lib/util";

const sqlite = new Database(env("DB_FILE_NAME"));
migrate(drizzle(sqlite), { migrationsFolder: `${import.meta.dir}/../drizzle` });
sqlite.close();
console.log(`Migrations applied to ${env("DB_FILE_NAME")}`);
