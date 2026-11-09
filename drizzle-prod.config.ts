import { defineConfig } from "drizzle-kit";
import { env } from "@/lib/util";

const db_uri = env("DB_FILE_NAME");

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/data/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: `./dist/prod_${db_uri}`,
  },
});
