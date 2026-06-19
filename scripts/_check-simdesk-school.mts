import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.SD_URL!, authToken: process.env.SD_TOK });
const orgId = "2ab37c5f-dc03-47e5-8f84-412173cbfca8";

const cols = await c.execute("PRAGMA table_info(schools)");
console.log("SCHOOLS COLS:", cols.rows.map((r) => r.name).join(", "));

const linked = await c.execute({
  sql: "SELECT id, name, organization_id FROM schools WHERE organization_id = ?",
  args: [orgId],
});
console.log("\nSIMUTEST IN SIMDESK schools:", JSON.stringify(linked.rows, null, 2));

const first = await c.execute("SELECT id, name, organization_id FROM schools ORDER BY id ASC LIMIT 5");
console.log("\nFIRST 5 SCHOOLS BY ID:", JSON.stringify(first.rows, null, 2));

const teacher = await c.execute({
  sql: "SELECT id, email, school, role FROM users WHERE email IN (?, ?)",
  args: ["teacher@simulant.shop", "student@simulant.shop"],
});
console.log("\nTEACHER/STUDENT IN SIMDESK USERS:", JSON.stringify(teacher.rows, null, 2));
