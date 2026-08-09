import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_RATE_LIMIT_RULES } from "./rate-limit.ts";

test("session reads can absorb a synchronized school login", () => {
  assert.deepEqual(AUTH_RATE_LIMIT_RULES["/get-session"], {
    window: 60,
    max: 6_000,
  });
});

test("credential and recovery endpoints retain strict budgets", () => {
  assert.equal(AUTH_RATE_LIMIT_RULES["/sign-in/email"].max, 5);
  assert.equal(AUTH_RATE_LIMIT_RULES["/sign-up/email"].max, 3);
  assert.equal(AUTH_RATE_LIMIT_RULES["/request-password-reset"].max, 1);
  assert.equal(AUTH_RATE_LIMIT_RULES["/two-factor/verify"].max, 5);
});
