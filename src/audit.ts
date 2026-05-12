/**
 * Audit-event recorder. Writes to the auth DB's `auth_event` table.
 *
 * Used by:
 *   - Better-Auth `hooks.after` middleware (every endpoint)
 *   - `databaseHooks` (every model-level CRUD)
 *
 * Console's `/audit` page reads from this table + console's own
 * consoleAudit table and merges them into one timeline.
 */

import { lt } from "drizzle-orm";
import { db } from "./db";
import { authEvent, type NewAuthEvent } from "./audit-schema";
import { session } from "./schema";

export type AuditOutcome = "success" | "fail" | "info";

export interface RecordEventInput {
  action: string;
  outcome?: AuditOutcome;
  userId?: string | null;
  userEmail?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  endpoint?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Anything event-specific. Stringified server-side. */
  metadata?: Record<string, unknown>;
}

export async function recordAuthEvent(input: RecordEventInput): Promise<void> {
  const row: NewAuthEvent = {
    action: input.action,
    outcome: input.outcome ?? "success",
    userId: input.userId ?? null,
    userEmail: input.userEmail ?? null,
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    endpoint: input.endpoint ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 256) : null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  };
  try {
    await db.insert(authEvent).values(row);
  } catch (err) {
    // Audit must never break the auth flow it's recording. Log to
    // stderr and move on.
    console.error("[audit] insert failed:", err, "row:", row);
  }
}

/**
 * Map a Better-Auth endpoint path → action slug + outcome based on
 * whether the response was a successful (2xx) or failed (4xx/5xx) call.
 *
 * Returns null when the path is something we don't care about logging
 * (e.g. /get-session — far too noisy).
 */
export function mapEndpointToEvent(
  path: string,
  status: number,
): { action: string; outcome: AuditOutcome } | null {
  const ok = status >= 200 && status < 300;
  const fail = status >= 400;

  // Only log when the call actually completed. Pending/unknown skipped.
  const outcome: AuditOutcome = ok ? "success" : fail ? "fail" : "info";

  // Whitelist — anything not in here is silently dropped.
  const map: Record<string, string> = {
    "/sign-in/email": "auth.sign_in.email",
    "/sign-in/social": "auth.sign_in.social",
    "/sign-in/passkey": "auth.sign_in.passkey",
    "/sign-in/magic-link": "auth.sign_in.magic_link",
    "/sign-in/oauth-otp": "auth.sign_in.email_otp",
    "/sign-up/email": "auth.sign_up",
    "/sign-out": "auth.sign_out",
    "/forget-password": "auth.forget_password.requested",
    "/reset-password": "auth.reset_password.completed",
    "/verify-email": "auth.email_verified",
    "/change-email": "auth.change_email.requested",
    "/change-password": "auth.change_password",
    "/delete-user": "auth.delete_user",
    "/two-factor/enable": "auth.two_factor.enabled",
    "/two-factor/disable": "auth.two_factor.disabled",
    "/two-factor/verify": "auth.two_factor.verified",
    "/passkey/register": "auth.passkey.registered",
    "/passkey/delete": "auth.passkey.deleted",

    // Organization plugin
    "/organization/create": "org.created",
    "/organization/update": "org.updated",
    "/organization/delete": "org.deleted",
    "/organization/set-active": "org.active.changed",
    "/organization/invite-member": "org.invitation.created",
    "/organization/cancel-invitation": "org.invitation.cancelled",
    "/organization/accept-invitation": "org.invitation.accepted",
    "/organization/reject-invitation": "org.invitation.rejected",
    "/organization/add-member": "org.member.added",
    "/organization/remove-member": "org.member.removed",
    "/organization/update-member-role": "org.member.role_changed",
    "/organization/leave": "org.member.left",

    // Admin plugin
    "/admin/create-user": "admin.user.created",
    "/admin/update-user": "admin.user.updated",
    "/admin/remove-user": "admin.user.deleted",
    "/admin/set-role": "admin.user.role_set",
    "/admin/ban-user": "admin.user.banned",
    "/admin/unban-user": "admin.user.unbanned",
    "/admin/impersonate-user": "admin.user.impersonate_started",
    "/admin/stop-impersonating": "admin.user.impersonate_stopped",
    "/admin/list-user-sessions": "admin.user.list_sessions",
    "/admin/revoke-user-session": "admin.user.session_revoked",
    "/admin/revoke-user-sessions": "admin.user.sessions_revoked_all",
  };

  const action = map[path];
  if (!action) return null;
  return { action, outcome };
}

/**
 * Delete auth_event rows older than `olderThanDays`. Returns the cutoff
 * timestamp that was used so callers can log it.
 *
 * Intended to run as a periodic job (daily cron in Console or wherever
 * the operator owns scheduled tasks). The table grows unboundedly
 * otherwise — sign-ins alone produce one row per attempt — and the
 * indexes on action/userId/orgId/createdAt slow proportionally.
 *
 * libsql doesn't need DELETE batching for a table this size; a single
 * statement is fine. If retention ever needs to be tighter (hours not
 * days), revisit.
 */
export async function pruneAuthEvents(
  opts: { olderThanDays?: number } = {},
): Promise<{ cutoff: Date }> {
  const days = opts.olderThanDays ?? 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await db.delete(authEvent).where(lt(authEvent.createdAt, cutoff));
  return { cutoff };
}

/**
 * Delete session rows whose `expiresAt` is in the past. Better-Auth
 * never garbage-collects expired session rows on its own, so without
 * this they accumulate forever — and per-user queries that fetch
 * "recent sessions" end up scanning hundreds of dead rows per user.
 *
 * Should run on the same cron as pruneAuthEvents (e.g. daily).
 */
export async function pruneExpiredSessions(): Promise<{ cutoff: Date }> {
  const cutoff = new Date();
  await db.delete(session).where(lt(session.expiresAt, cutoff));
  return { cutoff };
}

export function extractIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip");
}
