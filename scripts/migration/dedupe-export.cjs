// Dedupe stack-export.json: when two users share an email, keep the
// one that signed up first. Drop the other user AND its memberships.
require("dotenv/config");
const fs = require("node:fs");

const PATH = "./stack-export.json";
const data = JSON.parse(fs.readFileSync(PATH, "utf8"));

// Group users by lowercase email
const byEmail = new Map();
for (const u of data.users) {
  if (!u.email) continue;
  const e = u.email.toLowerCase();
  if (!byEmail.has(e)) byEmail.set(e, []);
  byEmail.get(e).push(u);
}

const drop = new Set();
for (const [email, users] of byEmail) {
  if (users.length < 2) continue;
  // Sort: earliest signup wins. Tie-break by having a name.
  users.sort((a, b) => {
    const ta = new Date(a.signedUpAt).getTime();
    const tb = new Date(b.signedUpAt).getTime();
    if (ta !== tb) return ta - tb;
    return (b.name ? 1 : 0) - (a.name ? 1 : 0);
  });
  const keep = users[0];
  for (let i = 1; i < users.length; i++) {
    console.log(`drop ${users[i].id} (email=${email}, name="${users[i].name ?? ""}", keeping ${keep.id})`);
    drop.add(users[i].id);
  }
}

const before = {
  users: data.users.length,
  memberships: data.memberships.length,
};

data.users = data.users.filter((u) => !drop.has(u.id));
data.memberships = data.memberships.filter((m) => !drop.has(m.userId));

data.counts = {
  users: data.users.length,
  teams: data.teams.length,
  memberships: data.memberships.length,
};
data.dedupedAt = new Date().toISOString();

fs.writeFileSync(PATH, JSON.stringify(data, null, 2), "utf8");
console.log(`\nDropped ${drop.size} duplicate user(s).`);
console.log(`Users: ${before.users} → ${data.users.length}`);
console.log(`Memberships: ${before.memberships} → ${data.memberships.length}`);
