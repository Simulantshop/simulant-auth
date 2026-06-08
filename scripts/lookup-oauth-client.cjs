/**
 * Look up OAuth clients already registered in Better-Auth's `oauth_client`
 * table — to find an existing school/shop's clientId, redirect URIs, name
 * and metadata.
 *
 * NOTE: client_secret is stored ONE-WAY HASHED (base64url(sha256(secret))).
 * It CANNOT be recovered here. The plaintext secret only exists in the
 * shop's Coolify env (BETTERAUTH_CLIENT_SECRET) and the shop's
 * ps_configuration. If it's lost in both places, rotate with
 * register-oauth-client.cjs (issues a fresh pair) instead.
 *
 * Usage:
 *   node scripts/lookup-oauth-client.cjs                 # list all clients
 *   node scripts/lookup-oauth-client.cjs --shop myslug   # filter by metadata.shop
 *   node scripts/lookup-oauth-client.cjs --q "skole"     # filter by name/redirect substring
 *   node scripts/lookup-oauth-client.cjs --json          # raw JSON output
 *
 * Required env (load from simulant-auth/.env / .env.local):
 *   SIMULANT_AUTH_DB_URL
 *   SIMULANT_AUTH_DB_TOKEN
 */

require("dotenv/config");
const { createClient } = require("@libsql/client");

function parseArgs(argv) {
  const args = { shop: null, q: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--shop") args.shop = argv[++i];
    else if (a === "--q") args.q = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") {
      console.error("Usage: node scripts/lookup-oauth-client.cjs [--shop <slug>] [--q <substr>] [--json]");
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  const dbUrl = process.env.SIMULANT_AUTH_DB_URL;
  const dbToken = process.env.SIMULANT_AUTH_DB_TOKEN;
  if (!dbUrl) {
    console.error("SIMULANT_AUTH_DB_URL is required (load simulant-auth/.env first)");
    process.exit(1);
  }

  const client = createClient({ url: dbUrl, authToken: dbToken });

  const where = [];
  const params = [];
  if (args.shop) {
    where.push("metadata LIKE ?");
    params.push(`%"shop":"${args.shop}"%`);
  }
  if (args.q) {
    where.push("(name LIKE ? OR redirect_uris LIKE ? OR metadata LIKE ?)");
    params.push(`%${args.q}%`, `%${args.q}%`, `%${args.q}%`);
  }

  const sql =
    "SELECT client_id, name, redirect_uris, metadata, disabled, created_at " +
    "FROM oauth_client" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY created_at DESC";

  const { rows } = await client.execute({ sql, args: params });

  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log("No OAuth client found." + (args.shop || args.q ? " (no match for filter)" : ""));
    console.log("→ This school's shop has no registered client. Run register-oauth-client.cjs to create one.");
    return;
  }

  for (const r of rows) {
    let redirects = r.redirect_uris;
    try { redirects = JSON.parse(r.redirect_uris).join(", "); } catch {}
    const created = r.created_at ? new Date(Number(r.created_at)).toISOString() : "?";
    console.log("─".repeat(60));
    console.log(`  name:         ${r.name}`);
    console.log(`  clientId:     ${r.client_id}`);
    console.log(`  redirectURIs: ${redirects}`);
    console.log(`  metadata:     ${r.metadata ?? "—"}`);
    console.log(`  disabled:     ${r.disabled ? "YES" : "no"}`);
    console.log(`  created:      ${created}`);
  }
  console.log("─".repeat(60));
  console.log(`${rows.length} client(s). clientSecret is hashed in the DB — read it from the shop's Coolify env (BETTERAUTH_CLIENT_SECRET), or rotate to get a new one.`);
})().catch((err) => {
  console.error("Lookup failed:", err);
  process.exit(1);
});
