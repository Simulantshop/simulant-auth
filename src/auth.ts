import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, jwt, emailOTP } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "./db";
import {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
} from "./permissions";

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

  trustedOrigins,

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
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
