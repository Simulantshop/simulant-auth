import { createClient } from "@libsql/client";
const c = createClient({ url: process.env.NB_URL!, authToken: process.env.NB_TOK });
// Check what company is keyed to our test org
const cmp = await c.execute("SELECT id, name, organization_id FROM companies WHERE organization_id = '265319ab-8fd7-4989-a131-bc9e6cd86935' OR name LIKE '%Tradium%' OR name LIKE '%E2E%'");
console.log("COMPANIES:", JSON.stringify(cmp.rows, null, 2));
const acc = await c.execute("SELECT id, account_no, name, balance, company_id, owner_user_id, is_demo FROM accounts WHERE owner_user_id = '0690ef36-f5f7-4f57-82c5-297b58cd818d' OR account_no IN ('9999900001', '9999900002')");
console.log("ACCOUNTS:", JSON.stringify(acc.rows, null, 2));
const mb = await c.execute("SELECT user_id, company_id, role FROM memberships WHERE user_id IN ('0690ef36-f5f7-4f57-82c5-297b58cd818d','6d567c6c-0606-4297-b368-6afe6485f86f')");
console.log("MEMBERSHIPS:", JSON.stringify(mb.rows, null, 2));
