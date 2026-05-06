# Migration scripts

The Stack Auth → Better-Auth migration is **complete**. The export-from-Stack
script has been removed; what remains is the import-to-Better-Auth tooling,
which is still useful for re-importing from any source that produces a
compatible `stack-export.json` (the format is plain JSON — schema in
`import-to-better-auth.ts`).

## Files

- `import-to-better-auth.ts` — reads `stack-export.json`, inserts users +
  organizations + memberships into the auth DB. Idempotent on `id`. Users
  arrive with `password = NULL` so they go through the forgot-password
  flow on first sign-in.
- `dedupe-export.cjs` — collapses duplicate-email users in
  `stack-export.json` (keep earliest signup with name, drop the rest).
  Run before `import-to-better-auth.ts` if Better-Auth's unique-email
  constraint barks at the data.
- `truncate-and-import.cjs` — wipes auth tables then runs the importer.
  Use for a fresh re-import only — destructive.

## Required env

Put in `simulant-auth/.env.local`:

```bash
SIMULANT_AUTH_DB_URL=libsql://simulant-auth-db.database.bullma.de
SIMULANT_AUTH_DB_TOKEN=<token>
```

## Running

```bash
node scripts/migration/dedupe-export.cjs
npx tsx scripts/migration/import-to-better-auth.ts
```

`stack-export.json` is gitignored — it contains user PII (emails, names).
Delete it once import is complete and verified.

## Verification

```bash
node scripts/verify-mirror.cjs
```

Compares `stack-export.json` to the live DB and reports missing/extra
users, organizations, and memberships.

## Post-migration

The Stack Auth project can be retired once:
1. Every user has reset their password (sent via login.simulant.shop's
   forgot-password flow).
2. All Coolify apps are pointing at login.simulant.shop / Better-Auth
   (env vars updated, deployments fresh).
3. PrestaShop SSO module is rewired (see `simulant-prestaauth/MIGRATION-TO-BETTER-AUTH.md`)
   or accepted as out-of-scope.
