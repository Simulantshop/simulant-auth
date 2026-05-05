import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const url = process.env.SIMULANT_AUTH_DB_URL;
const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;

if (!url) {
  throw new Error("SIMULANT_AUTH_DB_URL is not set");
}

const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });
export { schema };
