/**
 * Phase 4: import-to-better-auth
 *
 * Reads stack-export.json (output of export-from-stack.ts) and inserts into
 * the simulant-auth-db Better-Auth tables. Stack IDs are PRESERVED — that's
 * what keeps `companies.stack_team_id` (and similar) join-correct in every
 * downstream app.
 *
 * Run AT cutover, after Stack is read-only and before swapping env vars
 * in Coolify.
 *
 * Required env (in this package's .env.local):
 *   SIMULANT_AUTH_DB_URL
 *   SIMULANT_AUTH_DB_TOKEN
 *
 * Behavior:
 * - Users: inserted with password = null. All users hit the password-reset
 *   flow on first post-cutover login (Option A from auth-migration.md).
 * - Organizations: inserted from teams. metadata is preserved (sender,
 *   slug, archived, demo flags) but JSON-stringified to fit the column.
 *   `entitlements` from team metadata are NOT imported here — they live
 *   in console's `team_entitlements` table separately and need a different
 *   migration step.
 * - Members: inserted with role from Stack's user.teamRoles map. Role
 *   strings are kept snake_case unchanged.
 *
 * Idempotent: each insert uses ON CONFLICT DO NOTHING so re-running won't
 * duplicate. If you need a fresh import, truncate first.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, schema } from "../../src/db";

interface StackExport {
  exportedAt: string;
  counts: { users: number; teams: number; memberships: number };
  users: Array<{
    id: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
    image: string | null;
    signedUpAt: string;
    isDisabled: boolean;
  }>;
  teams: Array<{
    id: string;
    name: string;
    slug: string;
    image: string | null;
    createdAt: string;
    metadata: unknown;
  }>;
  memberships: Array<{
    organizationId: string;
    userId: string;
    role: string;
    createdAt: string;
  }>;
}

async function main() {
  const json = await readFile("./stack-export.json", "utf8");
  const data = JSON.parse(json) as StackExport;
  console.log(
    `Loaded stack-export.json (exported ${data.exportedAt}): ${data.counts.users} users, ${data.counts.teams} teams, ${data.counts.memberships} memberships`,
  );

  // Pre-flight count of what's already in target
  const existingUsers = await db.select({ id: schema.user.id }).from(schema.user);
  const existingOrgs = await db.select({ id: schema.organization.id }).from(schema.organization);
  console.log(
    `Target DB currently has ${existingUsers.length} users, ${existingOrgs.length} organizations.`,
  );
  const existingUserIds = new Set(existingUsers.map((u) => u.id));
  const existingOrgIds = new Set(existingOrgs.map((o) => o.id));
  const existingOrgSlugs = new Set<string>();
  if (existingOrgs.length > 0) {
    const rows = await db.select({ slug: schema.organization.slug }).from(schema.organization);
    for (const r of rows) if (r.slug) existingOrgSlugs.add(r.slug);
  }

  let usersInserted = 0;
  let usersSkipped = 0;
  for (const u of data.users) {
    if (existingUserIds.has(u.id)) {
      usersSkipped++;
      continue;
    }
    if (!u.email) continue;
    await db.insert(schema.user).values({
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      name: u.name ?? u.email,
      image: u.image,
      createdAt: new Date(u.signedUpAt),
      updatedAt: new Date(),
      role: null,
      banned: u.isDisabled,
      banReason: u.isDisabled ? "Migrated as disabled from Stack Auth" : null,
      banExpires: null,
    });
    usersInserted++;
  }
  console.log(`Users: inserted ${usersInserted}, skipped (already present) ${usersSkipped}`);

  let orgsInserted = 0;
  let orgsSkipped = 0;
  for (const t of data.teams) {
    if (existingOrgIds.has(t.id)) {
      orgsSkipped++;
      continue;
    }
    let slug = t.slug;
    let suffix = 0;
    while (existingOrgSlugs.has(slug)) {
      suffix++;
      slug = `${t.slug}-${suffix}`;
    }
    existingOrgSlugs.add(slug);
    await db.insert(schema.organization).values({
      id: t.id,
      name: t.name,
      slug,
      logo: t.image,
      createdAt: new Date(t.createdAt),
      metadata: t.metadata ? JSON.stringify(t.metadata) : null,
    });
    orgsInserted++;
  }
  console.log(`Organizations: inserted ${orgsInserted}, skipped (already present) ${orgsSkipped}`);

  // For members, we need to skip duplicates (same userId+orgId)
  const existingMembers = await db
    .select({ userId: schema.member.userId, orgId: schema.member.organizationId })
    .from(schema.member);
  const existingMemberKey = new Set(
    existingMembers.map((m) => `${m.userId}::${m.orgId}`),
  );

  let membersInserted = 0;
  let membersSkipped = 0;
  for (const m of data.memberships) {
    const key = `${m.userId}::${m.organizationId}`;
    if (existingMemberKey.has(key)) {
      membersSkipped++;
      continue;
    }
    // Skip if either side missing
    if (!existingUserIds.has(m.userId) && !data.users.find((u) => u.id === m.userId)) continue;
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: m.organizationId,
      userId: m.userId,
      role: m.role,
      createdAt: new Date(m.createdAt),
    });
    membersInserted++;
  }
  console.log(`Members: inserted ${membersInserted}, skipped (already present) ${membersSkipped}`);

  console.log("\nImport complete.");
  console.log("Next: every user must reset their password on first login.");
  console.log("Send the reset-blast email after swapping Coolify env vars.");
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
