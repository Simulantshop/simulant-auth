export { auth } from "./auth";
export type { Auth, Session } from "./auth";
export { db, schema } from "./db";
export { authEvent } from "./audit-schema";
export type { AuthEvent, NewAuthEvent } from "./audit-schema";
export { recordAuthEvent, pruneAuthEvents } from "./audit";
export {
  sendOrgInvitation,
  sendMemberAdded,
  sendMagicLink,
  sendOTPCode,
  sendPasswordReset,
  sendVerificationEmail,
} from "./email";
export {
  ac,
  superadmin,
  workspace_admin,
  student_manager,
  student,
  ROLES,
} from "./permissions";
export type { Role } from "./permissions";
