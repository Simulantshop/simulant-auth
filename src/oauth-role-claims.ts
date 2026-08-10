export type OAuthClientMetadata = Record<string, unknown> | null | undefined;

type RoleLookup = (
  userId: string,
  organizationId: string,
) => Promise<string | null | undefined>;

/**
 * Resolve the tenant-specific role embedded in a Simulant OAuth ID token.
 *
 * The OAuth client owns the organization boundary. Missing/invalid client
 * metadata, a missing user, an absent membership or a lookup failure must all
 * fail closed and emit no role claim.
 */
export async function resolveSimulantRoleClaim(
  userId: string | null | undefined,
  metadata: OAuthClientMetadata,
  lookupRole: RoleLookup,
): Promise<{ simulant_role?: string }> {
  const organizationId =
    metadata && typeof metadata.organizationId === "string"
      ? metadata.organizationId
      : null;

  if (!userId || !organizationId) return {};

  try {
    const role = await lookupRole(userId, organizationId);
    return role ? { simulant_role: role } : {};
  } catch {
    return {};
  }
}
