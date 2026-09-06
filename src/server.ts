import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "./auth";
import type { Session } from "./auth";
import { db, schema } from "./db";

/**
 * Shared server-side session + workspace resolution for every consumer app.
 *
 * Before this module, each of the ~16 Simulant apps reimplemented the same
 * three things in its own `lib/auth.ts` / `current-workspace.ts` / `scope.ts`:
 *
 *   1. `getSession()` wrapped in a `.catch` so a transient auth-DB blip
 *      degrades to "signed out" instead of 500ing the page ("Virk pattern").
 *   2. Resolve the active org from `session.activeOrganizationId`, falling
 *      back to the user's FIRST membership when it is null (it IS null until
 *      the client calls `organization.setActive()` — so without the fallback,
 *      freshly-signed-in users resolve to "no workspace"). This exact bug was
 *      patched one app at a time in NemRefusion and SimSign.
 *   3. Parse `organization.metadata` JSON without throwing, and check an
 *      app entitlement slug inside it.
 *
 * Each independent reimplementation was a chance to forget one of those
 * guards. Centralising them here means one fix, fleet-wide, forever.
 *
 * NOTE: this module takes an already-resolved `Headers` object rather than
 * importing `next/headers`, so `@simulant/auth` stays free of a `next`
 * dependency (consumers pass `await headers()`).
 */

export type SafeSession = Session | null;

/**
 * `getSession()` that never throws. A transient auth-DB blip (sqld restart,
 * 401 storm, network hiccup) while resolving the session in a render path must
 * never 500 the page — degrade to "signed out", the same coherent outcome as a
 * genuinely expired session. Callers that gate on auth should treat `null` as
 * unauthenticated.
 */
export async function getSafeSession(headers: Headers): Promise<SafeSession> {
  try {
    return await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  } catch (err) {
    console.error(
      "[@simulant/auth] getSession failed; treating request as signed-out:",
      err,
    );
    return null;
  }
}

export interface OrgMetadata {
  cvr?: string;
  pNummer?: string;
  address?: string;
  slug?: string;
  archived?: boolean;
  entitlements?: string[];
  [key: string]: unknown;
}

/** Parse `organization.metadata` (stored as a JSON string) without throwing. */
export function parseOrgMetadata(raw: string | null | undefined): OrgMetadata {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as OrgMetadata)
      : {};
  } catch {
    return {};
  }
}

/** Whether a school has a given app turned on in console (entitlement slug). */
export function orgHasEntitlement(meta: OrgMetadata, slug: string): boolean {
  return !meta.archived && Array.isArray(meta.entitlements) && meta.entitlements.includes(slug);
}

export interface ResolvedOrg {
  id: string;
  name: string;
  slug: string | null;
  metadata: OrgMetadata;
}

type RawOrgRow = {
  id: string;
  name: string;
  slug: string | null;
  metadata: string | null;
};

const ORG_COLUMNS = {
  id: schema.organization.id,
  name: schema.organization.name,
  slug: schema.organization.slug,
  metadata: schema.organization.metadata,
} as const;

async function selectOrgById(userId: string, orgId: string): Promise<RawOrgRow | null> {
  const rows = (await db
    .select(ORG_COLUMNS)
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, orgId)))
    .limit(1)) as RawOrgRow[];
  return rows[0] ?? null;
}

async function selectFirstMembershipOrg(
  userId: string,
): Promise<RawOrgRow | null> {
  const rows = (await db
    .select(ORG_COLUMNS)
    .from(schema.member)
    .innerJoin(
      schema.organization,
      eq(schema.member.organizationId, schema.organization.id),
    )
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
    .limit(1)) as RawOrgRow[];
  return rows[0] ?? null;
}

/**
 * Resolve the active organization id for a user: `activeOrganizationId` when
 * set, else the user's FIRST membership. Returns `null` when the user belongs
 * to no org, or on any DB error (caller degrades gracefully).
 */
export async function resolveActiveOrgId(
  userId: string,
  activeOrganizationId: string | null | undefined,
): Promise<string | null> {
  return (await resolveActiveOrg(userId, activeOrganizationId))?.id ?? null;
}

/**
 * Resolve the full active organization (active-or-first-membership) with parsed
 * metadata. DB errors degrade to `null`. When `activeOrganizationId` points at
 * a readable org it wins; otherwise the user's first membership is used.
 */
export async function resolveActiveOrg(
  userId: string,
  activeOrganizationId: string | null | undefined,
): Promise<ResolvedOrg | null> {
  try {
    let org: RawOrgRow | null = null;
    if (activeOrganizationId) org = await selectOrgById(userId, activeOrganizationId);
    else org = await selectFirstMembershipOrg(userId);
    if (!org || parseOrgMetadata(org.metadata).archived) return null;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      metadata: parseOrgMetadata(org.metadata),
    };
  } catch (err) {
    console.error("[@simulant/auth] resolveActiveOrg failed:", err);
    return null;
  }
}

export interface ResolvedWorkspace {
  /** The signed-in user, or `null` when unauthenticated. */
  user: { id: string; name: string; email: string } | null;
  /** The resolved active org (active-or-first-membership), or `null`. */
  org: ResolvedOrg | null;
  /** True when there is no usable session. */
  unauthenticated: boolean;
  /**
   * When an `appSlug` is supplied: true iff the resolved org carries that
   * entitlement. Always true when no `appSlug` is requested. When false, the
   * caller should render its "no workspace / not entitled" UX.
   */
  entitled: boolean;
}

/**
 * One call that captures the whole "who am I + which workspace" dance every
 * app reimplements: safe session fetch + active-or-first-membership org +
 * parsed metadata + optional entitlement gate. Never throws.
 */
export async function resolveWorkspace(opts: {
  headers: Headers;
  appSlug?: string;
}): Promise<ResolvedWorkspace> {
  const session = await getSafeSession(opts.headers);
  if (!session?.user) {
    return { user: null, org: null, unauthenticated: true, entitled: false };
  }
  const user = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Bruger",
    email: session.user.email ?? "",
  };
  const org = await resolveActiveOrg(
    user.id,
    session.session.activeOrganizationId ?? null,
  );
  const entitled =
    !opts.appSlug || (org != null && orgHasEntitlement(org.metadata, opts.appSlug));
  return { user, org, unauthenticated: false, entitled };
}

/** Global authority comes only from Console's canonical admin membership. */
export async function isPlatformSuperadmin(userId: string): Promise<boolean> {
  const teamId = process.env.SIMULANT_ADMIN_TEAM_ID;
  if (!teamId || !userId) return false;
  try {
    const [member] = await db.select({ id: schema.member.id }).from(schema.member).where(and(
      eq(schema.member.userId, userId), eq(schema.member.organizationId, teamId),
      eq(schema.member.role, "superadmin"),
    )).limit(1);
    return !!member;
  } catch { return false; }
}
