import assert from "node:assert/strict";
import test from "node:test";
import { resolveSimulantRoleClaim } from "./oauth-role-claims.ts";

test("OAuth role claim is scoped to the client organization", async () => {
  const calls: Array<[string, string]> = [];
  const result = await resolveSimulantRoleClaim(
    "user-1",
    { organizationId: "org-client" },
    async (userId, organizationId) => {
      calls.push([userId, organizationId]);
      return "student_manager";
    },
  );

  assert.deepEqual(calls, [["user-1", "org-client"]]);
  assert.deepEqual(result, { simulant_role: "student_manager" });
});

test("OAuth role claim fails closed without valid tenant context", async () => {
  let lookups = 0;
  const lookup = async () => {
    lookups += 1;
    return "superadmin";
  };

  assert.deepEqual(await resolveSimulantRoleClaim("user-1", null, lookup), {});
  assert.deepEqual(
    await resolveSimulantRoleClaim("user-1", { organizationId: 42 }, lookup),
    {},
  );
  assert.deepEqual(
    await resolveSimulantRoleClaim(null, { organizationId: "org-client" }, lookup),
    {},
  );
  assert.equal(lookups, 0);
});

test("OAuth role claim omits absent memberships and lookup failures", async () => {
  assert.deepEqual(
    await resolveSimulantRoleClaim(
      "user-1",
      { organizationId: "org-client" },
      async () => null,
    ),
    {},
  );
  assert.deepEqual(
    await resolveSimulantRoleClaim(
      "user-1",
      { organizationId: "org-client" },
      async () => {
        throw new Error("database unavailable");
      },
    ),
    {},
  );
});
