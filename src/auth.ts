import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { db } from "./db";
import {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
} from "./permissions";

const trustedOrigins = [
  "https://console.simulant.dk",
  "https://nordbank.simulant.dk",
  "https://skat.simulant.dk",
  "https://expense.simulant.dk",
  "https://forhandler.simulant.dk",
  "https://klaviyo.simulant.dk",
  "https://teachbase.simulant.dk",
  "https://insights.simulant.dk",
  "https://shipping.simulant.dk",
  "https://virk.simulant.dk",
];

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),

  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,

  emailAndPassword: {
    enabled: true,
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
      domain: ".simulant.dk",
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
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
