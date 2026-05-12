import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as betterAuthSchema from "./schema";
import * as auditSchema from "./audit-schema";

/**
 * Lazy DB initializer. The env check is deferred to first use so that
 * Next.js's build-time page-data collection (which imports auth modules
 * to discover routes) doesn't crash when SIMULANT_AUTH_DB_URL isn't set
 * at build time. The env var is required at runtime and validated then.
 */

const fullSchema = { ...betterAuthSchema, ...auditSchema };

let cachedDb: LibSQLDatabase<typeof fullSchema> | null = null;

function buildDb(): LibSQLDatabase<typeof fullSchema> {
  const url = process.env.SIMULANT_AUTH_DB_URL;
  const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;
  if (!url) {
    throw new Error(
      "SIMULANT_AUTH_DB_URL is not set. Set it in your env (Coolify build/runtime secrets) before serving requests.",
    );
  }
  // Fail loud on a missing token. Without this guard the libsql client
  // is happy to send requests with no Authorization header, which sqld
  // 401s for free in CPU terms BUT floods its log and masks the real
  // source of the misconfig. We'd rather the misbehaving deploy refuse
  // to serve traffic so the operator notices immediately.
  if (!authToken) {
    throw new Error(
      "SIMULANT_AUTH_DB_TOKEN is not set. The libsql client would otherwise send unauthenticated requests and 401-storm sqld.",
    );
  }
  const client = createClient({ url, authToken });
  return drizzle(client, { schema: fullSchema });
}

/**
 * Drizzle DB handle. Proxy that materialises the underlying client on
 * first access — never throws at import-time, only when an actual query
 * is dispatched.
 */
export const db = new Proxy({} as LibSQLDatabase<typeof fullSchema>, {
  get(_target, prop, receiver) {
    if (!cachedDb) {
      cachedDb = buildDb();
    }
    const value = Reflect.get(cachedDb, prop, receiver);
    return typeof value === "function" ? value.bind(cachedDb) : value;
  },
}) as LibSQLDatabase<typeof fullSchema>;

export const schema = fullSchema;
