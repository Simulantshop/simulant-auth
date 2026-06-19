import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.NB_URL!, authToken: process.env.NB_TOK });
const cols = await c.execute("PRAGMA table_info(companies)");
console.log("COMPANIES COLS:");
for (const row of cols.rows) console.log(`  ${row.cid}: ${row.name} (${row.type}${row.notnull ? ' NN' : ''})`);

// Run the EXACT query the deployed app runs
const sha = "07c0c8e072214d20698e0675423970f2e41795e0f23fc020b11bd40c94e23c96";
const sql = `select "api_keys"."id", "api_keys"."company_id", "api_keys"."name", "api_keys"."prefix", "api_keys"."hashed_key", "api_keys"."scopes", "api_keys"."created_by_user_id", "api_keys"."revoked_at", "api_keys"."last_used_at", "api_keys"."expires_at", "api_keys"."created_at", "companies"."id", "companies"."name", "companies"."slug", "companies"."cvr", "companies"."api_token", "companies"."bank_prefix", "companies"."skat_account_id", "companies"."organization_id", "companies"."external_ops_account_no", "companies"."archived", "companies"."created_at", "companies"."updated_at" from "api_keys" inner join "companies" on "api_keys"."company_id" = "companies"."id" where ("api_keys"."hashed_key" = ? and "api_keys"."revoked_at" is null)`;
try {
  const r = await c.execute({ sql, args: [sha] });
  console.log("\nQUERY OK, rows:", r.rows.length);
  console.log(r.rows[0]);
} catch (e) {
  console.log("\nQUERY ERROR:", e instanceof Error ? e.message : e);
}
