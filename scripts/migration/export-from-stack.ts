/**
 * Phase 4: export-from-stack
 *
 * Reads users, teams, and team-memberships from Stack Auth's API and dumps
 * them to ./stack-export.json. Run BEFORE cutover, while Stack is still
 * alive and serving production auth.
 *
 * Required env (Stack project credentials — get from app.stack-auth.com):
 *   NEXT_PUBLIC_STACK_PROJECT_ID
 *   NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
 *   STACK_SECRET_SERVER_KEY
 *
 * Output: ./stack-export.json
 */

import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { StackServerApp } from "@stackframe/stack";

const PROJECT_ID = process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY;
const SECRET_KEY = process.env.STACK_SECRET_SERVER_KEY;

if (!PROJECT_ID || !PUBLISHABLE_KEY || !SECRET_KEY) {
  console.error(
    "Missing Stack credentials. Set NEXT_PUBLIC_STACK_PROJECT_ID, " +
      "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY, STACK_SECRET_SERVER_KEY in .env",
  );
  process.exit(1);
}

const stack = new StackServerApp({
  tokenStore: "memory",
  projectId: PROJECT_ID,
  publishableClientKey: PUBLISHABLE_KEY,
  secretServerKey: SECRET_KEY,
});

interface ExportedUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  signedUpAt: string;
  lastActiveAt: string | null;
  isDisabled: boolean;
  oauthProviders: Array<{ id: string; accountId: string }>;
  metadata: unknown;
}

interface ExportedTeam {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  createdAt: string;
  metadata: unknown;
}

interface ExportedMembership {
  organizationId: string;
  userId: string;
  role: string;
  createdAt: string;
}

function deriveSlug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("Fetching users from Stack...");
  const allUsers = await stack.listUsers({ limit: 1000 });
  console.log(`  ${allUsers.length} users`);

  console.log("Fetching teams from Stack...");
  const allTeams = await stack.listTeams();
  console.log(`  ${allTeams.length} teams`);

  const exportedUsers: ExportedUser[] = allUsers.map((u) => {
    const ua = u as unknown as {
      signedUpAt?: Date;
      lastActiveAt?: Date;
      lastSignedInAt?: Date;
      isDisabled?: boolean;
      oauthProviders?: Array<{ id: string; accountId: string }>;
    };
    return {
      id: u.id,
      email: u.primaryEmail,
      emailVerified: u.primaryEmailVerified,
      name: u.displayName ?? null,
      image: u.profileImageUrl ?? null,
      signedUpAt: (ua.signedUpAt ?? new Date()).toISOString(),
      lastActiveAt: (ua.lastActiveAt ?? ua.lastSignedInAt ?? null)?.toISOString() ?? null,
      isDisabled: !!ua.isDisabled,
      oauthProviders: ua.oauthProviders ?? [],
      metadata: u.clientReadOnlyMetadata ?? {},
    };
  });

  const exportedTeams: ExportedTeam[] = [];
  const exportedMemberships: ExportedMembership[] = [];

  for (const team of allTeams) {
    const teamMeta = (team.clientReadOnlyMetadata ?? {}) as { slug?: string };
    exportedTeams.push({
      id: team.id,
      name: team.displayName,
      slug: teamMeta.slug ?? deriveSlug(team.displayName),
      image: team.profileImageUrl ?? null,
      createdAt: ((team as unknown as { createdAt?: Date }).createdAt ?? new Date()).toISOString(),
      metadata: team.clientReadOnlyMetadata ?? {},
    });

    const members = await team.listUsers();
    for (const m of members) {
      const um = (m.clientReadOnlyMetadata ?? {}) as { teamRoles?: Record<string, string> };
      const role = (um.teamRoles ?? {})[team.id] ?? "student";
      const mAny = m as unknown as { joinedTeamAt?: Date };
      exportedMemberships.push({
        organizationId: team.id,
        userId: m.id,
        role,
        createdAt: (mAny.joinedTeamAt ?? new Date()).toISOString(),
      });
    }
    console.log(`  team ${team.displayName}: ${members.length} members`);
  }

  const out = {
    exportedAt: new Date().toISOString(),
    counts: {
      users: exportedUsers.length,
      teams: exportedTeams.length,
      memberships: exportedMemberships.length,
    },
    users: exportedUsers,
    teams: exportedTeams,
    memberships: exportedMemberships,
  };

  await writeFile("./stack-export.json", JSON.stringify(out, null, 2), "utf8");
  console.log("\nWrote stack-export.json");
  console.log(`  ${out.counts.users} users`);
  console.log(`  ${out.counts.teams} teams`);
  console.log(`  ${out.counts.memberships} memberships`);
  console.log(
    "\nIMPORTANT: stack-export.json contains user PII (emails, names). Delete it after the migration completes.",
  );
}

main().catch((e) => {
  console.error("Export failed:", e);
  process.exit(1);
});
