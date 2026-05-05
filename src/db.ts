import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

/**
 * Lazy DB initializer. The env check is deferred to first use so that
 * Next.js's build-time page-data collection (which imports auth modules
 * to discover routes) doesn't crash when SIMULANT_AUTH_DB_URL isn't set
 * at build time. The env var is required at runtime and validated then.
 */

let cachedDb: LibSQLDatabase<typeof schema> | null = null;

function buildDb(): LibSQLDatabase<typeof schema> {
  const url = process.env.SIMULANT_AUTH_DB_URL;
  const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;
  if (!url) {
    throw new Error(
      "SIMULANT_AUTH_DB_URL is not set. Set it in your env (Coolify build/runtime secrets) before serving requests.",
    );
  }
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

/**
 * Drizzle DB handle. Proxy that materialises the underlying client on
 * first access — never throws at import-time, only when an actual query
 * is dispatched.
 */
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!cachedDb) {
      cachedDb = buildDb();
    }
    const value = Reflect.get(cachedDb, prop, receiver);
    return typeof value === "function" ? value.bind(cachedDb) : value;
  },
}) as LibSQLDatabase<typeof schema>;

export { schema };
