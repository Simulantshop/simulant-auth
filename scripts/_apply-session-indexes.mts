import { createClient } from "@libsql/client";

const url = process.env.SIMULANT_AUTH_DB_URL;
const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;
if (!url || !authToken) {
  throw new Error("SIMULANT_AUTH_DB_URL and SIMULANT_AUTH_DB_TOKEN are required");
}

const client = createClient({ url, authToken });

const stmts = [
  `CREATE INDEX IF NOT EXISTS "session_userId_createdAt_idx" ON "session" ("user_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "session_expiresAt_idx" ON "session" ("expires_at")`,
];

for (const sql of stmts) {
  process.stdout.write(`> ${sql}\n`);
  const start = Date.now();
  await client.execute(sql);
  process.stdout.write(`  ok (${Date.now() - start}ms)\n`);
}

const res = await client.execute({
  sql: `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='session' ORDER BY name`,
  args: [],
});
process.stdout.write(`\nindexes on session:\n`);
for (const row of res.rows) process.stdout.write(`  - ${row.name}\n`);
