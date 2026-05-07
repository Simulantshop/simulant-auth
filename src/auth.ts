import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, jwt, emailOTP, magicLink } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "./db";
import {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
} from "./permissions";
import { recordAuthEvent, mapEndpointToEvent, extractIp } from "./audit";

const trustedOrigins = [
  "https://console.simulant.shop",
  "https://nordbank.simulant.shop",
  "https://skat.simulant.shop",
  "https://expense.simulant.shop",
  "https://forhandler.simulant.shop",
  "https://klaviyo.simulant.shop",
  "https://teachbase.simulant.shop",
  "https://insights.simulant.shop",
  "https://shipping.simulant.shop",
  "https://virk.simulant.shop",
];

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
   * Failures are swallowed inside recordAuthEvent so a logging hiccup
   * never breaks the underlying auth flow.
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

      await recordAuthEvent({
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
    jwt(),
    oauthProvider({
      loginPage: "/auth/sign-in",
      consentPage: "/auth/consent",
      // Issuer + endpoints derive from BETTER_AUTH_URL automatically.
      // PrestaShop's stackauthadmin module uses these to validate tokens.
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
