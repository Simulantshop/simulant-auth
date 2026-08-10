import assert from "node:assert/strict";
import test from "node:test";

test("Better Auth RC exposes the Simulant session, OAuth and passkey APIs", async () => {
  process.env.SIMULANT_AUTH_DB_URL = "file:/tmp/simulant-auth-rc-test.db";
  process.env.SIMULANT_AUTH_DB_TOKEN = "test-token";
  process.env.BETTER_AUTH_SECRET = "test-only-secret-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "https://login.simulant.shop";

  const { auth } = await import("./auth.ts");
  assert.equal(typeof auth.handler, "function");
  assert.equal(typeof auth.api.getSession, "function");
  assert.equal(typeof auth.api.oauth2Authorize, "function");
  assert.equal(typeof auth.api.oauth2Token, "function");
  assert.equal(typeof auth.api.adminCreateOAuthResource, "function");
  assert.equal(typeof auth.api.generatePasskeyRegistrationOptions, "function");

  const response = await auth.handler(
    new Request(
      "https://login.simulant.shop/api/auth/.well-known/oauth-authorization-server",
      { headers: { "x-forwarded-for": "127.0.0.1" } },
    ),
  );
  assert.equal(response.status, 200);
  const metadata = (await response.json()) as Record<string, unknown>;
  assert.equal(metadata.issuer, "https://login.simulant.shop/api/auth");
  assert.equal(
    metadata.token_endpoint,
    "https://login.simulant.shop/api/auth/oauth2/token",
  );
  assert.equal(
    metadata.authorization_endpoint,
    "https://login.simulant.shop/api/auth/oauth2/authorize",
  );
});
