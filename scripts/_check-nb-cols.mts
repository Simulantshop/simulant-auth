import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.NB_URL!, authToken: process.env.NB_TOK });
const cols = await c.execute("PRAGMA table_info(api_keys)");
console.log(JSON.stringify(cols.rows, null, 2));
