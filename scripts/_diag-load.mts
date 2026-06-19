import { createClient } from "@libsql/client";

const url = process.env.SIMULANT_AUTH_DB_URL;
const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;
if (!url || !authToken) throw new Error("env missing");
const c = createClient({ url, authToken });

async function q(label: string, sql: string) {
  const start = Date.now();
  const r = await c.execute(sql);
  console.log(`\n== ${label} (${Date.now() - start}ms) ==`);
  for (const row of r.rows) console.log(row);
}

// Table sizes
await q("session row count", `select count(*) as total, sum(case when expires_at < cast(unixepoch('subsecond') * 1000 as integer) then 1 else 0 end) as expired from session`);
await q("auth_event row count", `select count(*) as total, min(created_at) as oldest, max(created_at) as newest from auth_event`);
await q("verification row count", `select count(*) as total, sum(case when expires_at < cast(unixepoch('subsecond') * 1000 as integer) then 1 else 0 end) as expired from verification`);
await q("user row count", `select count(*) as total from user`);

// Per-user session bloat
await q("sessions per user (top 10)", `select user_id, count(*) as n, sum(case when expires_at < cast(unixepoch('subsecond') * 1000 as integer) then 1 else 0 end) as expired from session group by user_id order by n desc limit 10`);

// Planner check — is it using the new compound index?
await q("EXPLAIN: select created_at from session where user_id=? order by created_at desc limit ?", `EXPLAIN QUERY PLAN select created_at from session where user_id = 'x' order by created_at desc limit 5`);
await q("EXPLAIN: select session by token", `EXPLAIN QUERY PLAN select * from session where token = 'x'`);
await q("EXPLAIN: prune expired sessions", `EXPLAIN QUERY PLAN delete from session where expires_at < cast(unixepoch('subsecond') * 1000 as integer)`);

// All indexes (sanity)
await q("indexes", `select tbl_name, name from sqlite_master where type='index' order by tbl_name, name`);
