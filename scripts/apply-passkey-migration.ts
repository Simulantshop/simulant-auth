/**
 * Idempotent migration: create the `passkey` table for the WebAuthn
 * passkey plugin. Safe to re-run — every step swallows the
 * "already exists" error.
 *
 * Usage:
 *   pnpm dlx tsx --env-file=.env.local scripts/apply-passkey-migration.ts
 *   # or against prod:
 *   SIMULANT_AUTH_DB_URL=... SIMULANT_AUTH_DB_TOKEN=... pnpm dlx tsx scripts/apply-passkey-migration.ts
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.SIMULANT_AUTH_DB_URL;
const authToken = process.env.SIMULANT_AUTH_DB_TOKEN;
if (!url) {
  console.error("SIMULANT_AUTH_DB_URL is required");
  process.exit(1);
}

const client = createClient({ url, authToken });

const STEPS: Array<{ name: string; sql: string }> = [
  {
    name: "create passkey table",
    sql: `CREATE TABLE passkey (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      public_key TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL,
      counter INTEGER NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL,
      transports TEXT,
      created_at INTEGER,
      aaguid TEXT
    );`,
  },
  {
    name: "create passkey_userId_idx",
    sql: `CREATE INDEX passkey_userId_idx ON passkey (user_id);`,
  },
  {
    name: "create passkey_credentialID_idx",
    sql: `CREATE INDEX passkey_credentialID_idx ON passkey (credential_id);`,
  },
];

let applied = 0;
let skipped = 0;
for (const step of STEPS) {
  try {
    await client.execute(step.sql);
    console.log(`✓ ${step.name}`);
    applied += 1;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/already exists|duplicate/i.test(msg)) {
      console.log(`· ${step.name} (already applied)`);
      skipped += 1;
    } else {
      console.error(`✗ ${step.name}: ${msg}`);
      process.exit(1);
    }
  }
}

console.log(`\nDone. ${applied} applied, ${skipped} skipped.`);
process.exit(0);
