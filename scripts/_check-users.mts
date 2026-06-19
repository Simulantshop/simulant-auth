import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.SIMULANT_AUTH_DB_URL!, authToken: process.env.SIMULANT_AUTH_DB_TOKEN });
const u = await c.execute("SELECT id, email, role FROM user WHERE email IN ('student@simulant.shop','teacher@simulant.shop')");
console.log("USERS:", JSON.stringify(u.rows, null, 2));
for (const row of u.rows) {
  const m = await c.execute({ sql: "SELECT m.organization_id, m.role, o.name FROM member m LEFT JOIN organization o ON o.id = m.organization_id WHERE m.user_id = ?", args: [row.id] });
  console.log(`MEMBERSHIPS for ${row.email}:`, JSON.stringify(m.rows, null, 2));
}
