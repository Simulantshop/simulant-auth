# Stack Auth → Better-Auth Migration Scripts

## Order of operations on cutover day

1. **T−15 min** — put all Simulant apps into maintenance mode (Coolify env flag)
2. **T−10 min** — stop background jobs that hit Stack Auth
3. **T+0** — run `tsx scripts/migration/export-from-stack.ts`
4. **T+5 min** — verify `stack-export.json` counts match an audit snapshot
5. **T+10 min** — run `tsx scripts/migration/import-to-better-auth.ts`
6. **T+15 min** — swap Coolify env vars on every app (remove STACK_*, add SIMULANT_AUTH_*)
7. **T+20 min** — redeploy all apps in parallel
8. **T+25 min** — lift maintenance mode
9. **T+30 min** — send password-reset blast email to all users

## Required env

Put in `simulant-auth/.env.local`:

```bash
# For export-from-stack.ts (read prod Stack)
NEXT_PUBLIC_STACK_PROJECT_ID=<from app.stack-auth.com>
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=<from app.stack-auth.com>
STACK_SECRET_SERVER_KEY=<from app.stack-auth.com>

# For import-to-better-auth.ts (write to your DB)
SIMULANT_AUTH_DB_URL=libsql://simulant-auth-db.database.bullma.de
SIMULANT_AUTH_DB_TOKEN=<rotated token>
```

## Behavior

- **Users** are imported with `password = null`. Every user must reset their
  password on first login post-cutover. Better-Auth's "Forgot password" flow
  works seamlessly — they enter their email, get a reset link, set a new
  password.
- **Organizations** are imported preserving Stack's UUIDs. Every consuming app
  has join columns like `companies.stack_team_id` that already hold these
  IDs — they continue to work without renaming.
- **Memberships** are imported with the snake_case role from Stack's
  `user.teamRoles[teamId]` map: `superadmin` / `workspace_admin` /
  `student_manager` / `student`.
- Both scripts are **idempotent** — re-running them only inserts new rows
  (`ON CONFLICT DO NOTHING` semantics via existence checks).

## After cutover

1. Verify counts: open Better-Auth admin dashboard in console → user count
   should match the export snapshot.
2. Reset-blast email: send via console's email infrastructure — every user
   gets one click "set new password" link.
3. Day 7: send a reminder to anyone who hasn't reset.
4. Day 30: delete `stack-export.json` (contains PII), close the Stack Auth
   project, remove `@stackframe/stack` devDep from this package.

## Files NOT migrated by these scripts

These need separate handling:

- `team_entitlements` (in console's local DB) — already populated, not in
  Stack metadata anymore. No migration needed if you've been writing to it
  alongside Stack metadata. Otherwise: backfill from team metadata before
  cutover.
- Active sessions — cannot be migrated. All users get logged out at cutover.
  This is unavoidable with any auth migration.
- OAuth account links (Google sign-in linkages) — only matters if any users
  used OAuth providers. The export script captures `oauthProviders` per
  user but the import script doesn't write them. Add a step here if needed.
