import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  workspace: ["read", "write", "delete"],
  members: ["invite", "remove", "update-role"],
  transactions: ["read", "create", "force"],
  apiKeys: ["read", "create", "revoke"],
  audit: ["read"],
  integrations: ["read", "write"],
  shipments: ["read", "create", "void"],
  invoices: ["read", "create"],
  taxFilings: ["read", "create"],
  cards: ["read", "create", "block"],
  loans: ["read", "create"],
} as const;

export const ac = createAccessControl(statement);

export const superadmin = ac.newRole({
  workspace: ["read", "write", "delete"],
  members: ["invite", "remove", "update-role"],
  transactions: ["read", "create", "force"],
  apiKeys: ["read", "create", "revoke"],
  audit: ["read"],
  integrations: ["read", "write"],
  shipments: ["read", "create", "void"],
  invoices: ["read", "create"],
  taxFilings: ["read", "create"],
  cards: ["read", "create", "block"],
  loans: ["read", "create"],
});

export const workspace_admin = ac.newRole({
  workspace: ["read", "write"],
  members: ["invite", "remove", "update-role"],
  transactions: ["read", "create"],
  apiKeys: ["read", "create"],
  audit: ["read"],
  integrations: ["read", "write"],
  shipments: ["read", "create", "void"],
  invoices: ["read", "create"],
  taxFilings: ["read", "create"],
  cards: ["read", "create", "block"],
  loans: ["read", "create"],
});

export const student_manager = ac.newRole({
  workspace: ["read"],
  members: ["invite"],
  transactions: ["read"],
  audit: ["read"],
  shipments: ["read"],
  invoices: ["read"],
  taxFilings: ["read"],
  cards: ["read"],
  loans: ["read"],
});

export const student = ac.newRole({
  workspace: ["read"],
  transactions: ["read"],
  shipments: ["read"],
  invoices: ["read"],
  cards: ["read"],
});

export type Role = "superadmin" | "workspace_admin" | "student_manager" | "student";

export const ROLES: readonly Role[] = ["superadmin", "workspace_admin", "student_manager", "student"];
