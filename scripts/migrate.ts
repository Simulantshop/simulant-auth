/**
 * Apply pending Drizzle migrations against the simulant-auth DB.
 *
 * Replaces the looser `drizzle:push` workflow. push compares schema.ts
 * against the live DB and is prone to drift false-positives (partial-
 * and unique-index round-trip bugs in drizzle-kit's introspector).
 * generate+migrate compares schema.ts against the snapshot in
 * drizzle/meta/ instead, so cosmetic differences in stored DDL don't
 * produce ghost diffs.
 *
 * Reads SIMULANT_AUTH_DB_URL / SIMULANT_AUTH_DB_TOKEN from .env.local
 * then .env — same env names the rest of the package already uses.
 *
 * Run:
 *   bun run db:migrate
 */
import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.SIMULANT_AUTH_DB_URL;
const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;

if (!url) {
  console.error("SIMULANT_AUTH_DB_URL not set");
  process.exit(1);
}

const client = createClient({ url, authToken });
const db = drizzle(client);

console.log(`[migrate] applying migrations to ${url.replace(/^libsql:\/\//, "")}`);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("[migrate] done");

client.close();
