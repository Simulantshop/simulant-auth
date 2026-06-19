import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.SD_URL!, authToken: process.env.SD_TOK });
const r = await c.execute("SELECT id, name, organization_id FROM schools WHERE id = 1");
console.log(JSON.stringify(r.rows, null, 2));
const cnt = await c.execute("SELECT COUNT(*) AS n FROM tickets WHERE school = 1");
console.log("tickets in school 1:", cnt.rows[0]);
