/**
 * Register an OAuth 2.0 / OIDC client in Better-Auth's `oauth_client` table.
 *
 * Why a CLI: better-auth's `auth.api.createOAuthClient` endpoint is gated by
 * `sessionMiddleware`, which means it requires a logged-in admin's browser
 * cookie. From a Node.js CLI we don't have that — so this script writes
 * directly to the libsql database using the same schema better-auth
 * generates (`oauth_client` table) with the exact same secret-hashing rule
 * (base64url(sha256(secret))) that the OAuth-provider plugin uses when
 * `storeClientSecret = "hashed"` (its default when the `jwt` plugin is on,
 * which is our case).
 *
 * Usage:
 *   node scripts/register-oauth-client.cjs \
 *     --name "PrestaShop BackOffice — myshop" \
 *     --redirect "https://myshop.example/admin123/stackauth/callback" \
 *     [--redirect "https://other-redirect..."] \
 *     [--metadata-shop myshop]
 *
 * Required env (load from .env / .env.local):
 *   SIMULANT_AUTH_DB_URL
 *   SIMULANT_AUTH_DB_TOKEN
 *
 * Output: prints clientId + clientSecret on success. Save them — the
 * secret is one-way hashed in the DB and can't be recovered.
 */

require("dotenv/config");
const crypto = require("node:crypto");
const { createClient } = require("@libsql/client");

function parseArgs(argv) {
  const args = { name: null, redirects: [], metadata: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--name") args.name = next();
    else if (a === "--redirect") args.redirects.push(next());
    else if (a.startsWith("--metadata-")) args.metadata[a.slice("--metadata-".length)] = next();
    else if (a === "--help" || a === "-h") {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelpAndExit(2);
    }
  }
  return args;
}

function printHelpAndExit(code) {
  console.error(
    [
      "Register an OAuth client in Better-Auth's oauth_client table.",
      "",
      "Usage:",
      "  node scripts/register-oauth-client.cjs --name <NAME> --redirect <URL> [--redirect <URL>] [--metadata-<key> <value>]",
      "",
      "Env required:",
      "  SIMULANT_AUTH_DB_URL    libsql URL",
      "  SIMULANT_AUTH_DB_TOKEN  libsql auth token",
      "",
      "Example:",
      '  node scripts/register-oauth-client.cjs \\',
      '    --name "PrestaShop BackOffice — myshop" \\',
      '    --redirect "https://myshop.example/admin123/stackauth/callback" \\',
      "    --metadata-shop myshop",
    ].join("\n"),
  );
  process.exit(code);
}

/** Better-Auth's defaultHasher: base64url(sha256(value)), no padding. */
function hashClientSecret(secret) {
  const digest = crypto.createHash("sha256").update(secret, "utf8").digest();
  return digest
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Better-Auth's generateRandomString(32, "a-z", "A-Z"). */
function generateRandomString(length) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

(async () => {
  const args = parseArgs(process.argv);
  if (!args.name || args.redirects.length === 0) {
    console.error("Both --name and at least one --redirect are required.\n");
    printHelpAndExit(2);
  }
  for (const url of args.redirects) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.hostname !== "localhost") {
        console.error(`Refusing non-https redirect URI: ${url}`);
        process.exit(2);
      }
    } catch {
      console.error(`Invalid URL in --redirect: ${url}`);
      process.exit(2);
    }
  }

  const dbUrl = process.env.SIMULANT_AUTH_DB_URL;
  const dbToken = process.env.SIMULANT_AUTH_DB_TOKEN;
  if (!dbUrl) {
    console.error("SIMULANT_AUTH_DB_URL is required");
    process.exit(1);
  }

  const client = createClient({ url: dbUrl, authToken: dbToken });

  const id = crypto.randomUUID();
  const clientId = generateRandomString(32);
  const clientSecret = generateRandomString(32);
  const storedSecret = hashClientSecret(clientSecret);
  const now = Date.now();

  // Defaults match the OIDC client-registration spec / oauth-provider:
  //   grant_types = ["authorization_code"]
  //   response_types = ["code"]
  //   token_endpoint_auth_method = "client_secret_basic"
  //   scopes = ["openid", "email", "profile"]
  //   require_pkce = 1
  // Booleans are stored as 0/1 in libsql; JSON columns as text.
  await client.execute({
    sql: `INSERT INTO oauth_client (
            id, client_id, client_secret,
            disabled, skip_consent, public, require_pkce,
            scopes, redirect_uris, grant_types, response_types,
            token_endpoint_auth_method,
            name, metadata,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      clientId,
      storedSecret,
      0,
      0,
      0,
      1,
      JSON.stringify(["openid", "email", "profile"]),
      JSON.stringify(args.redirects),
      JSON.stringify(["authorization_code"]),
      JSON.stringify(["code"]),
      "client_secret_basic",
      args.name,
      Object.keys(args.metadata).length > 0
        ? JSON.stringify(args.metadata)
        : null,
      now,
      now,
    ],
  });

  console.log("OAuth client registered.");
  console.log("");
  console.log(`  clientId:     ${clientId}`);
  console.log(`  clientSecret: ${clientSecret}`);
  console.log("");
  console.log(`  redirectURIs: ${args.redirects.join(", ")}`);
  console.log(`  name:         ${args.name}`);
  console.log("");
  console.log(
    "Save the clientSecret now — it is hashed in the DB and cannot be recovered.",
  );
})().catch((err) => {
  console.error("Registration failed:", err);
  process.exit(1);
});
