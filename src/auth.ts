import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, jwt, emailOTP, magicLink } from "better-auth/plugins";
import type { Jwk } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { member } from "./schema";
import {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
} from "./permissions";
import { recordAuthEvent, mapEndpointToEvent, extractIp } from "./audit";

const trustedOrigins = [
  "https://simulant.shop",
  "https://console.simulant.shop",
  "https://login.simulant.shop",
  "https://nordbank.simulant.shop",
  "https://skat.simulant.shop",
  "https://expense.simulant.shop",
  "https://klaviyo.simulant.shop",
  "https://teachbase.simulant.shop",
  "https://insights.simulant.shop",
  "https://shipping.simulant.shop",
  "https://virk.simulant.shop",
  "https://simdesk.simulant.shop",
  "https://salary.simulant.shop",
  "https://nemrefusion.simulant.shop",
  "https://simsign.simulant.shop",
  "https://contracts.simulant.shop",
  "https://forsikring.simulant.shop",
  "https://efforsikring.simulant.shop",
  "https://manual.simulant.shop",
  "https://task.simulant.shop",
  "https://tasks.simulant.shop",
  "https://admin.forhandler.shop",
];

/**
 * In-memory JWKS cache. See the jwt() plugin config below for the full
 * incident write-up. Short version: the jwt plugin re-SELECTs the entire
 * `jwks` table on every sign/verify, and the signing key(s) are
 * effectively static (Better-Auth only writes here on first boot or a
 * manual rotation). So read the table once and serve everything else
 * from memory.
 *
 * Guard: never cache an empty result. On a fresh DB the key row is
 * created moments after the first read, and a cached `[]` would wedge
 * token signing for the whole TTL.
 */
let jwksCache: { rows: Jwk[]; at: number } | null = null;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — long enough to kill the flood, short enough that a manual key rotation propagates fast.

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),

  // OIDC provider plugin needs /token disabled in favor of /oauth2/token
  // (see better-auth oidc-provider docs). PrestaShop module fetches
  // tokens from /api/auth/oauth2/token after this swap.
  disabledPaths: ["/token"],

  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { sendPasswordReset } = await import("./email");
      await sendPasswordReset({ to: user.email, name: user.name, url });
    },
  },

  /** Email verification flow. Defaults are off (requireEmailVerification
   *  is false above) but admin-created users can still trigger it via
   *  api.sendVerificationEmail; wiring our Danish template here means
   *  the upstream English fallback never fires. */
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const { sendVerificationEmail } = await import("./email");
      await sendVerificationEmail({ to: user.email, name: user.name, url });
    },
  },

  trustedOrigins,

  /**
   * Session cookie cache. Without this, every consumer app's
   * `auth.api.getSession()` (called per server-rendered request across
   * 22 trusted origins) hits the libsql DB for a SELECT on `session`
   * + `user`. With cookieCache on, Better-Auth signs the resolved
   * session into the cookie for `maxAge` seconds and reads it back
   * from there — no DB round-trip until the cookie expires. 5 min is
   * short enough that role/ban changes propagate quickly, long enough
   * to absorb normal navigation bursts.
   */
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
    /**
     * Don't roll session expiry forward on use. Default behaviour is
     * to UPDATE the session row every `updateAge` (1 day) so the
     * session slides forward; libsql's slow-query log showed those
     * UPDATEs running 2–5 s each across the fleet. With this flag
     * sessions expire at the fixed `expiresIn` from sign-in (7 days
     * by default), and re-auth is cheap given we have passkeys +
     * magic-link + email-OTP wired up. Removes the write entirely.
     */
    disableSessionRefresh: true,
  },

  /**
   * App-layer rate limiting (defends the auth API against credential
   * stuffing + reset-email DoS). Cloudflare or another edge WAF should
   * sit in front of this for real DDoS protection — but these limits
   * trip even when the edge is bypassed (e.g. internal traffic).
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 3 },
      "/forget-password": { window: 60 * 60, max: 3 },
      // Better-Auth 1.6+ renamed forget-password → request-password-reset
      // for the actual endpoint. Without a custom rule here it falls
      // through to the global 30/min, which lets a double-clicked submit
      // (or a Next.js prefetch + submit pair) send TWO reset emails in
      // quick succession. Tighten to 1 per minute so dupes drop.
      "/request-password-reset": { window: 60, max: 1 },
      "/sign-in/magic-link": { window: 60 * 60, max: 5 },
      "/email-otp/send-verification-otp": { window: 60 * 60, max: 5 },
      "/two-factor/verify": { window: 60, max: 5 },
    },
  },

  /**
   * Audit logging — every interesting auth endpoint emits a row in the
   * auth_event table. Console's /audit page reads from this table and
   * console's own consoleAudit table, merged into one timeline.
   *
   * The insert is intentionally NOT awaited. Auditing is observational
   * — the user's response shouldn't wait on a libsql round-trip to log
   * what just happened. recordAuthEvent already swallows its own
   * errors; the outer .catch here is belt-and-suspenders for anything
   * synchronous that escapes the inner try/catch.
   */
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const status = ctx.context.returned instanceof Response
        ? ctx.context.returned.status
        : 200;
      const event = mapEndpointToEvent(ctx.path, status);
      if (!event) return;

      const headerList = ctx.headers ?? new Headers();
      const session = ctx.context.session ?? null;
      const body = (ctx.body ?? {}) as Record<string, unknown>;

      void recordAuthEvent({
        action: event.action,
        outcome: event.outcome,
        userId: session?.user?.id ?? (typeof body.userId === "string" ? body.userId : null),
        userEmail: session?.user?.email ?? (typeof body.email === "string" ? body.email : null),
        organizationId:
          (typeof body.organizationId === "string" ? body.organizationId : null) ??
          session?.session?.activeOrganizationId ??
          null,
        actorUserId: session?.user?.id ?? null,
        actorEmail: session?.user?.email ?? null,
        endpoint: ctx.path,
        ipAddress: extractIp(headerList),
        userAgent: headerList.get("user-agent"),
        metadata: {
          status,
          // Drop sensitive fields from the body before logging.
          ...(typeof body.role === "string" ? { role: body.role } : {}),
          ...(typeof body.banReason === "string" ? { banReason: body.banReason } : {}),
        },
      }).catch((err) => {
        console.error("[audit] unhandled error in recordAuthEvent:", err);
      });
    }),
  },

  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: ".simulant.shop",
    },
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    },
  },

  plugins: [
    organization({
      ac,
      roles: { superadmin, workspace_admin, student_manager, student },
      allowUserToCreateOrganization: false,
      organizationLimit: 50,
      membershipLimit: 5000,
      /** Org-invite mailer. Without this the plugin creates the
       *  invitation row but no email goes out — easy way to ghost
       *  invitees. Ours is Danish-localised. */
      sendInvitationEmail: async ({ id, email, organization, inviter, role }) => {
        const { sendOrgInvitation } = await import("./email");
        const inviteUrl = `${process.env.BETTER_AUTH_URL?.replace(/\/+$/, "") ?? ""}/auth/accept-invitation/${id}`;
        await sendOrgInvitation({
          to: email,
          inviterName: inviter.user.name,
          orgName: organization.name,
          role: String(role),
          url: inviteUrl,
        });
      },
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    /**
     * JWT plugin — issues the signing key used by the OIDC/OAuth token
     * endpoint and publishes the public JWKS at /api/auth/jwks.
     *
     * ⚠️ CPU INCIDENT FIX (2026-06). Two settings here, both load-shedding:
     *
     * 1. `disableSettingJwtHeader: true`
     *    By default this plugin runs an `after` hook on EVERY /get-session
     *    call that signs a fresh JWT and attaches it as a `set-auth-jwt`
     *    response header. Signing re-reads the whole `jwks` table from
     *    libsql each time. Across 22 server-rendered consumer apps calling
     *    getSession per request, that single
     *      select ... from "jwks" limit ?
     *    became ~all of libsql's query volume (~1.5M queries), pinning CPU
     *    >500% and triggering a healthcheck-timeout → SIGTERM → restart
     *    spiral. cookieCache does NOT save us here — it resolves the
     *    session from the cookie, but this after-hook still fires and
     *    still reads jwks.
     *
     *    We do not consume `set-auth-jwt` anywhere: downstream services
     *    authenticate through the OIDC/OAuth token endpoint (oauthProvider
     *    below), not this header. If a consumer ever needs a session-bound
     *    JWT, it can call POST /api/auth/token explicitly. So turning the
     *    header off is free here — BUT if any consumer app reads
     *    `set-auth-jwt`, re-enable this and rely on the cache below alone.
     *
     * 2. `adapter.getJwks` → getCachedJwks
     *    Belt-and-suspenders: even the remaining, legitimate JWKS reads
     *    (the public /jwks endpoint that consumers hit to verify tokens,
     *    and OAuth token signing) are served from a 10-minute in-memory
     *    cache instead of round-tripping libsql every time.
     */
    jwt({
      disableSettingJwtHeader: true,
      adapter: {
        getJwks: async (ctx) => {
          const now = Date.now();
          if (jwksCache && now - jwksCache.at < JWKS_CACHE_TTL_MS) {
            return jwksCache.rows;
          }
          const rows = (await ctx.context.adapter.findMany({
            model: "jwks",
          })) as Jwk[];
          if (rows.length > 0) jwksCache = { rows, at: now };
          return rows;
        },
      },
    }),
    oauthProvider({
      loginPage: "/auth/sign-in",
      consentPage: "/auth/consent",
      // Attach the user's membership role (for the school that owns this
      // OAuth client) to the id_token as `simulant_role`. The PrestaShop
      // bm_simulant_betterauth module reads it to map console roles →ish PS
      // employee profiles (e.g. student → restricted profile, everyone else
      // → SuperAdmin). The owning org is carried on the client metadata as
      // `organizationId` (set by the console when it provisions the client).
      // No org on the client, or the user isn't a member → no claim, and the
      // module falls back to its non-role default behaviour.
      customIdTokenClaims: async ({ user, metadata }) => {
        const orgId =
          metadata && typeof metadata.organizationId === "string"
            ? metadata.organizationId
            : null;
        if (!orgId || !user?.id) return {};
        try {
          const [m] = await db
            .select({ role: member.role })
            .from(member)
            .where(
              and(eq(member.userId, user.id), eq(member.organizationId, orgId)),
            )
            .limit(1);
          return m?.role ? { simulant_role: m.role } : {};
        } catch {
          return {};
        }
      },
      // Issuer + endpoints derive from BETTER_AUTH_URL automatically.
      // PrestaShop's stackauthadmin module uses these to validate tokens.
      // The discovery endpoint /.well-known/oauth-authorization-server
      // is registered by the plugin itself (see oauth-provider's
      // index.mjs:2812), so the "please ensure it exists" warning is
      // noise — it fires on every consumer that imports `auth`,
      // including apps that aren't the issuer (e.g. simulant-console).
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
    /**
     * 6-digit email OTP — alternative sign-in path. The user enters
     * their email, we send a code, they paste it back. No password
     * required for the user to remember; same login surface for
     * student + workspace_admin alike.
     *
     * Use cases this unblocks:
     *   - First-time login for demo signups (no password yet, but
     *     they have email access)
     *   - Forgot-password recovery without going through the reset
     *     flow (faster + no link rot)
     *   - Students whose schools don't have a password manager
     */
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        const { sendOTPCode } = await import("./email");
        await sendOTPCode({ to: email, code: otp, type });
      },
      otpLength: 6,
      expiresIn: 10 * 60, // 10 minutes
      // Don't try to also use this for primary sign-in flow if a
      // password exists — let the user pick. UI surfaces both.
      disableSignUp: true,
    }),
    /** Email magic link — passwordless sign-in via a one-shot link.
     *  Click the link, you're signed in. Uses the existing `verification`
     *  table for token storage; no new schema needed. */
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const { sendMagicLink } = await import("./email");
        await sendMagicLink({ to: email, url });
      },
      expiresIn: 10 * 60, // 10 minutes
      disableSignUp: true,
    }),
    /** WebAuthn passkeys (Touch ID, Face ID, hardware keys). The
     *  `passkey` table in our schema stores credential metadata; the
     *  plugin handles attestation/assertion ceremonies via the
     *  webauthn endpoints under /api/auth/passkey/*.
     *
     *  rpID = bare host the user sees in the browser prompt.
     *  rpName = friendly app name shown next to the platform's prompt. */
    passkey({
      rpID:
        process.env.BETTER_AUTH_PASSKEY_RPID ??
        // Default to the apex so credentials can be re-used across
        // *.simulant.shop subdomains. WebAuthn matches by RP ID, not
        // origin — so a passkey registered on console.simulant.shop
        // can also be used to sign into nordbank.simulant.shop.
        "simulant.shop",
      rpName: "Simulant",
    }),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
