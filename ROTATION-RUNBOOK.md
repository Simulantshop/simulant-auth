# BETTER_AUTH_SECRET rotation runbook

The previous `BETTER_AUTH_SECRET` was committed to git (`SECURITY-REVIEW.md`,
`simulant-login/.env.example`) and must be treated as compromised. This value
signs every session cookie across all `*.simulant.shop` apps, so rotating it
**logs every user out** — do it as one coordinated cutover.

The code on branch `fix/major-hardening` now **refuses to boot** on a missing,
too-short, or known-leaked secret (including the old committed value), so every
app must have the new secret set before this branch deploys.

## Steps (do in this order)

1. Generate the new secret once:
   ```
   openssl rand -base64 32
   ```
2. In Coolify, set `BETTER_AUTH_SECRET` to the SAME new value on **every** app
   that uses `@simulant/auth` (all ~22 — auth, login, console, nordbank, skat,
   expense, klaviyo, teachbase, insights, shipping, virk, simdesk, salary,
   nemrefusion, simsign, contracts, insurance, efforsikring, docs, task, …).
   The value MUST be identical across all of them or cross-app SSO breaks.
3. Also rotate `SIMULANT_AUTH_DB_TOKEN` (new Turso token, admin scope) and set
   it across all apps — it was in the same committed/shared exposure class.
4. Deploy the apps. Every user is logged out and signs in again — expected.
5. Confirm the leaked value can never be reused: it is hard-rejected in
   `src/auth.ts` `requireAuthSecret()`.

## Notes
- The old value's exposure lives in git history; rotation (step 1–4) is what
  actually closes it. Scrubbing the files (already done on this branch) only
  stops it leaking forward.
- Do NOT deploy `fix/major-hardening` before step 2, or apps will fail to boot
  (by design — fail closed).
