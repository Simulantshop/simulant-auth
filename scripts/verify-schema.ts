import "dotenv/config";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.SIMULANT_AUTH_DB_URL!,
  authToken: process.env.SIMULANT_AUTH_DB_TOKEN!,
});

const result = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
);

console.log("Tables in simulant-auth-db:");
for (const row of result.rows) {
  console.log(`  - ${row.name}`);
}

const expected = [
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
];

const actual = result.rows.map((r) => String(r.name));
const missing = expected.filter((t) => !actual.includes(t));

if (missing.length === 0) {
  console.log("\nAll Better-Auth tables present.");
} else {
  console.error("\nMISSING tables:", missing);
  process.exit(1);
}
