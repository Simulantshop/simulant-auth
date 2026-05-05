require("dotenv/config");
const { createClient } = require("@libsql/client");
const data = require("../stack-export.json");

(async () => {
  const c = createClient({
    url: process.env.SIMULANT_AUTH_DB_URL,
    authToken: process.env.SIMULANT_AUTH_DB_TOKEN,
  });
  const dbUsers = await c.execute("SELECT id FROM user");
  const dbOrgs = await c.execute("SELECT id FROM organization");
  const dbMembers = await c.execute(
    "SELECT user_id as userId, organization_id as organizationId FROM member",
  );

  const stackUserIds = new Set(data.users.map((u) => u.id));
  const dbUserIds = new Set(dbUsers.rows.map((r) => r.id));
  const stackOrgIds = new Set(data.teams.map((t) => t.id));
  const dbOrgIds = new Set(dbOrgs.rows.map((r) => r.id));
  const stackMembershipKeys = new Set(
    data.memberships.map((m) => `${m.userId}::${m.organizationId}`),
  );
  const dbMembershipKeys = new Set(
    dbMembers.rows.map((r) => `${r.userId}::${r.organizationId}`),
  );

  const userMissing = [...stackUserIds].filter((id) => !dbUserIds.has(id));
  const userExtra = [...dbUserIds].filter((id) => !stackUserIds.has(id));
  const orgMissing = [...stackOrgIds].filter((id) => !dbOrgIds.has(id));
  const orgExtra = [...dbOrgIds].filter((id) => !stackOrgIds.has(id));
  const memberMissing = [...stackMembershipKeys].filter(
    (k) => !dbMembershipKeys.has(k),
  );
  const memberExtra = [...dbMembershipKeys].filter(
    (k) => !stackMembershipKeys.has(k),
  );

  console.log(
    `USERS:        Stack=${stackUserIds.size}  DB=${dbUserIds.size}  missing=${userMissing.length}  extra=${userExtra.length}`,
  );
  console.log(
    `ORGS:         Stack=${stackOrgIds.size}   DB=${dbOrgIds.size}   missing=${orgMissing.length}    extra=${orgExtra.length}`,
  );
  console.log(
    `MEMBERSHIPS:  Stack=${stackMembershipKeys.size}  DB=${dbMembershipKeys.size}  missing=${memberMissing.length}  extra=${memberExtra.length}`,
  );

  if (userExtra.length) {
    console.log(`\nExtra user IDs in DB (not in Stack):`);
    for (const id of userExtra.slice(0, 10)) console.log(`  ${id}`);
  }
})();
