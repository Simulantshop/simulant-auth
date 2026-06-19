import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.SIMULANT_AUTH_DB_URL!,
  authToken: process.env.SIMULANT_AUTH_DB_TOKEN!,
});

async function q(label: string, sql: string) {
  const start = Date.now();
  const r = await c.execute(sql);
  console.log(`\n== ${label} (${Date.now() - start}ms) ==`);
  for (const row of r.rows) console.log(row);
}

// Who is the 151-session user?
await q("the 151-session user", `select id, email, name, role, created_at from user where id = '0690ef36-f5f7-4f57-82c5-297b58cd818d'`);

// Are their sessions OAuth-driven or fresh logins?
await q("their session creation pattern", `select date(created_at/1000, 'unixepoch') as day, count(*) as n, min(user_agent) as sample_ua from session where user_id = '0690ef36-f5f7-4f57-82c5-297b58cd818d' group by day order by day desc limit 14`);

await q("their session IPs", `select ip_address, count(*) as n from session where user_id = '0690ef36-f5f7-4f57-82c5-297b58cd818d' group by ip_address order by n desc limit 10`);

await q("their session user_agents", `select user_agent, count(*) as n from session where user_id = '0690ef36-f5f7-4f57-82c5-297b58cd818d' group by user_agent order by n desc limit 10`);

// OAuth tables sizing
await q("oauth_access_token count", `select count(*) as n from oauth_access_token`);
await q("oauth_refresh_token count", `select count(*) as n from oauth_refresh_token`);

// Sessions created in last 24h, by hour
await q("sessions created last 24h, by hour", `select datetime((created_at/1000) - ((created_at/1000) % 3600), 'unixepoch') as hour, count(*) as n from session where created_at > (cast(unixepoch('subsecond') * 1000 as integer) - 86400000) group by hour order by hour desc`);
