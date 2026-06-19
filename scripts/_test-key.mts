import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";

const c = createClient({ url: process.env.NB_URL!, authToken: process.env.NB_TOK });
const KEY = process.env.E2E_KEY!;
const hashed = createHash("sha256").update(KEY).digest("hex");
console.log("Looking up key with hash:", hashed);

// Same query as the deployed app
const r = await c.execute({
  sql: `SELECT api_keys.id, api_keys.company_id, api_keys.name, api_keys.prefix,
        api_keys.hashed_key, api_keys.scopes, api_keys.revoked_at,
        companies.id as c_id, companies.name as c_name, companies.archived
        FROM api_keys
        INNER JOIN companies ON api_keys.company_id = companies.id
        WHERE api_keys.hashed_key = ? AND api_keys.revoked_at IS NULL`,
  args: [hashed],
});
console.log("ROWS:", r.rows);
