// CJS export script — bypasses the @stackframe/stack ESM build that
// pulls in next/navigation. Run with: node scripts/migration/export-from-stack.cjs

require("dotenv/config");
const { writeFile } = require("node:fs/promises");
const { StackServerApp } = require("@stackframe/stack");

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

function deriveSlug(displayName) {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("Fetching users from Stack...");
  const allUsers = await stack.listUsers({ limit: 1000 });
  console.log(`  ${allUsers.length} users`);

  console.log("Fetching teams from Stack...");
  const allTeams = await stack.listTeams();
  console.log(`  ${allTeams.length} teams`);

  const exportedUsers = allUsers.map((u) => ({
    id: u.id,
    email: u.primaryEmail,
    emailVerified: u.primaryEmailVerified,
    name: u.displayName ?? null,
    image: u.profileImageUrl ?? null,
    signedUpAt: (u.signedUpAt ?? new Date()).toISOString(),
    lastActiveAt:
      (u.lastActiveAt ?? u.lastSignedInAt ?? null)?.toISOString() ?? null,
    isDisabled: !!u.isDisabled,
    oauthProviders: u.oauthProviders ?? [],
    metadata: u.clientReadOnlyMetadata ?? {},
  }));

  const exportedTeams = [];
  const exportedMemberships = [];

  for (const team of allTeams) {
    const teamMeta = team.clientReadOnlyMetadata ?? {};
    exportedTeams.push({
      id: team.id,
      name: team.displayName,
      slug: teamMeta.slug ?? deriveSlug(team.displayName),
      image: team.profileImageUrl ?? null,
      createdAt: (team.createdAt ?? new Date()).toISOString(),
      metadata: team.clientReadOnlyMetadata ?? {},
    });

    const members = await team.listUsers();
    for (const m of members) {
      const um = m.clientReadOnlyMetadata ?? {};
      const role = (um.teamRoles ?? {})[team.id] ?? "student";
      exportedMemberships.push({
        organizationId: team.id,
        userId: m.id,
        role,
        createdAt: (m.joinedTeamAt ?? new Date()).toISOString(),
      });
    }
    console.log(`  team "${team.displayName}" (${team.id}): ${members.length} members`);
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
}

main().catch((e) => {
  console.error("Export failed:", e);
  process.exit(1);
});
