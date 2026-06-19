import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.SIMULANT_AUTH_DB_URL!, authToken: process.env.SIMULANT_AUTH_DB_TOKEN });
const orgs = await c.execute("SELECT id, name, slug, metadata FROM organization WHERE name LIKE '%imutest%' OR slug LIKE '%simutest%' OR slug LIKE '%test%'");
console.log("MATCHING ORGS:");
for (const r of orgs.rows) {
  console.log(`  ${r.id} | name="${r.name}" | slug="${r.slug}"`);
}
