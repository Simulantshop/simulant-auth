import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient } from "better-auth/client/plugins";
import {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
} from "./permissions";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [
    organizationClient({
      ac,
      roles: { superadmin, workspace_admin, student_manager, student },
    }),
    adminClient(),
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
