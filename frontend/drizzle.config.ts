import type { Config } from "drizzle-kit";

export default {
  schema: "./core/db/schema.ts",
  out: "./core/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.CHIKAIMA_DB_PATH?.trim() || "./data/chikaima.db",
  },
} satisfies Config;
