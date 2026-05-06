import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Auth-side audit events. Hand-written (not Better-Auth-generated) so
 * we own the schema independently of the Better-Auth CLI's regen cycle.
 *
 * Console's /audit page reads from this table AND from console's own
 * consoleAudit table, merging into one timeline.
 */
export const authEvent = sqliteTable(
  "auth_event",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** Stable event slug (e.g. "auth.sign_in.success",
     *  "org.member.added", "admin.user.banned"). Searchable. */
    action: text("action").notNull(),

    /** "success" | "fail" | "info" — quick filter for the dashboard. */
    outcome: text("outcome", { enum: ["success", "fail", "info"] })
      .notNull()
      .default("success"),

    /** When something significant happened to a user — sign-in,
     *  ban, role change. Null for system-level events. */
    userId: text("user_id"),

    /** Email at the time of the event — frozen here so deletions
     *  in the user table don't lose the audit trail. */
    userEmail: text("user_email"),

    /** Org touched by this event (member add/remove, role change, etc). */
    organizationId: text("organization_id"),

    /** When an admin acted on someone else (impersonate, ban, role-change). */
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),

    /** Free-form JSON for event-specific payload (IP, user-agent,
     *  banReason, role, etc). Always JSON-stringified. */
    metadata: text("metadata"),

    /** Path of the auth endpoint that fired the event — useful for
     *  debugging "why didn't this fire" type questions. */
    endpoint: text("endpoint"),

    /** Best-effort IP from x-forwarded-for / cf-connecting-ip. */
    ipAddress: text("ip_address"),

    /** UA string truncated to 256 chars. */
    userAgent: text("user_agent"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("auth_event_action_idx").on(table.action),
    index("auth_event_userId_idx").on(table.userId),
    index("auth_event_orgId_idx").on(table.organizationId),
    index("auth_event_createdAt_idx").on(table.createdAt),
  ],
);

export type AuthEvent = typeof authEvent.$inferSelect;
export type NewAuthEvent = typeof authEvent.$inferInsert;
