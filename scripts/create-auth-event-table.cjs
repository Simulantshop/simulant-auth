require("dotenv/config");
const { createClient } = require("@libsql/client");

(async () => {
  const client = createClient({
    url: process.env.SIMULANT_AUTH_DB_URL,
    authToken: process.env.SIMULANT_AUTH_DB_TOKEN,
  });

  const exists = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_event'",
  );
  if (exists.rows.length > 0) {
    console.log("auth_event table already exists — skipping create");
  } else {
    await client.execute(`
      CREATE TABLE auth_event (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL DEFAULT 'success',
        user_id TEXT,
        user_email TEXT,
        organization_id TEXT,
        actor_user_id TEXT,
        actor_email TEXT,
        metadata TEXT,
        endpoint TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
      )
    `);
    console.log("created auth_event table");
  }

  // Indexes — idempotent
  for (const stmt of [
    "CREATE INDEX IF NOT EXISTS auth_event_action_idx ON auth_event(action)",
    "CREATE INDEX IF NOT EXISTS auth_event_userId_idx ON auth_event(user_id)",
    "CREATE INDEX IF NOT EXISTS auth_event_orgId_idx ON auth_event(organization_id)",
    "CREATE INDEX IF NOT EXISTS auth_event_createdAt_idx ON auth_event(created_at)",
  ]) {
    await client.execute(stmt);
  }
  console.log("indexes ensured");

  const counts = await client.execute("SELECT count(*) as c FROM auth_event");
  console.log(`auth_event row count: ${Number(counts.rows[0].c)}`);
})();
