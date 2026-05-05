import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  adminClient,
  emailOTPClient,
  magicLinkClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
} from "./permissions";

/**
 * Always points at the centralised auth host (login.simulant.shop) so
 * every Simulant app sends auth calls to the same place. Set
 * NEXT_PUBLIC_BETTER_AUTH_URL=https://login.simulant.shop in every
 * consumer app.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [
    organizationClient({
      ac,
      roles: { superadmin, workspace_admin, student_manager, student },
    }),
    adminClient(),
    emailOTPClient(),
    magicLinkClient(),
    passkeyClient(),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  organization,
  admin,
} = authClient;
