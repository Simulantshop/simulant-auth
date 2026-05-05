// Wipe Better-Auth tables then run the TS import script.
// USE WITH CARE — destructive on the auth DB.

require("dotenv/config");
const { execSync } = require("node:child_process");
const { createClient } = require("@libsql/client");

(async () => {
  const client = createClient({
    url: process.env.SIMULANT_AUTH_DB_URL,
    authToken: process.env.SIMULANT_AUTH_DB_TOKEN,
  });

  // Order matters — child rows first.
  const tables = [
    "invitation",
    "member",
    "organization",
    "session",
    "account",
    "verification",
    "user",
  ];
  for (const t of tables) {
    const r = await client.execute(`DELETE FROM "${t}"`);
    console.log(`  truncated ${t}`);
  }

  console.log("\nNow running the import...");
  execSync("npx tsx scripts/migration/import-to-better-auth.ts", {
    stdio: "inherit",
  });
})();
