require("dotenv/config");
const { createClient } = require("@libsql/client");

(async () => {
  const client = createClient({
    url: process.env.SIMULANT_AUTH_DB_URL,
    authToken: process.env.SIMULANT_AUTH_DB_TOKEN,
  });
  const u = await client.execute("SELECT count(*) as c FROM user");
  const o = await client.execute("SELECT count(*) as c FROM organization");
  const m = await client.execute("SELECT count(*) as c FROM member");
  console.log(
    "user:",
    Number(u.rows[0].c),
    "org:",
    Number(o.rows[0].c),
    "member:",
    Number(m.rows[0].c),
  );
  const sample = await client.execute("SELECT id, email FROM user LIMIT 10");
  console.log("sample users:");
  for (const r of sample.rows) console.log(" ", r.id, r.email);
  const dupes = await client.execute(
    "SELECT email, count(*) as c FROM user GROUP BY email HAVING c > 1",
  );
  console.log("duplicate emails in DB:", dupes.rows.length);
})();
