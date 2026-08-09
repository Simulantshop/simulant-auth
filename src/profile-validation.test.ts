import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDisplayName } from "./profile-validation.ts";

test("accepts and trims Danish display names up to 32 characters", () => {
  assert.equal(normalizeDisplayName("  CHECKLIST-ØÅ 20260809 Cross  "), "CHECKLIST-ØÅ 20260809 Cross");
  assert.equal(Array.from(normalizeDisplayName("ø".repeat(32))).length, 32);
});

test("rejects blank and overlong display names", () => {
  assert.throws(() => normalizeDisplayName("   "), /required/);
  assert.throws(() => normalizeDisplayName("ø".repeat(33)), /at most 32/);
});
