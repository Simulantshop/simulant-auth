/**
 * Email sender for password reset / verification flows.
 *
 * Two backends, picked by env at runtime:
 *
 * 1. SMTP (preferred, default if SMTP_HOST is set) — uses nodemailer.
 *    Required env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *    Optional:     SMTP_SECURE ("true"/"false", defaults to true on port 465)
 *
 * 2. Resend HTTP API (fallback if RESEND_API_KEY is set and no SMTP).
 *    Required env: RESEND_API_KEY
 *    Optional:     RESEND_FROM (default "Simulant <noreply@simulant.shop>")
 *
 * If neither is configured, the reset URL is logged to stdout — useful for
 * local dev where you copy it out of console output.
 */

// Note: nodemailer is imported dynamically inside sendViaSmtp() so that
// consuming apps that bundle this package via Next/Turbopack
// `transpilePackages` don't have to install nodemailer themselves at
// build time. The runtime require() still picks up the real module
// when SMTP_HOST is configured.

import { publicAuthUrl } from "./public-url";

const DEFAULT_FROM = "Simulant <noreply@simulant.shop>";

function fromAddress(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    DEFAULT_FROM
  );
}

export async function sendPasswordReset({
  to,
  name,
  url,
}: {
  to: string;
  name: string | null | undefined;
  url: string;
}): Promise<void> {
  const subject = "Nulstil dit Simulant-kodeord";
  const safeUrl = publicAuthUrl(url);
  const html = renderResetEmail({ name, url: safeUrl });

  if (process.env.SMTP_HOST) {
    await sendViaSmtp({ to, subject, html });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html });
    return;
  }
  console.warn(
    "[simulant-auth] No email backend configured (SMTP_HOST or RESEND_API_KEY). Reset URL:",
    safeUrl,
  );
}

/** Sent when Better-Auth wants the user to confirm their email
 *  (e.g. after admin createUser, or when emailAndPassword.requireEmail-
 *  Verification flips to true in the future). */
export async function sendVerificationEmail({
  to,
  name,
  url,
}: {
  to: string;
  name: string | null | undefined;
  url: string;
}): Promise<void> {
  const subject = "Bekræft din e-mail på Simulant";
  const safeUrl = publicAuthUrl(url);
  const html = renderVerificationEmail({ name, url: safeUrl });

  if (process.env.SMTP_HOST) {
    await sendViaSmtp({ to, subject, html });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html });
    return;
  }
  console.warn(
    "[simulant-auth] No email backend configured. Verification URL:",
    safeUrl,
  );
}

/** Sent when an org admin invites someone via the organization plugin's
 *  createInvitation API. Without this wired, invitations get created
 *  in the DB but the invitee never hears about it. */
export async function sendOrgInvitation({
  to,
  inviterName,
  orgName,
  role,
  url,
}: {
  to: string;
  inviterName: string | null | undefined;
  orgName: string;
  role: string;
  url: string;
}): Promise<void> {
  const subject = `Invitation til ${orgName} på Simulant`;
  const safeUrl = publicAuthUrl(url);
  const html = renderOrgInvitationEmail({ inviterName, orgName, role, url: safeUrl });

  if (process.env.SMTP_HOST) {
    await sendViaSmtp({ to, subject, html });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html });
    return;
  }
  console.warn(
    "[simulant-auth] No email backend configured. Invitation URL:",
    safeUrl,
  );
}

/** Sent when an existing user is added directly to an org (no invitation
 *  acceptance required) — the recipient already has an account and is
 *  already a member as soon as this fires. Different copy from
 *  `sendOrgInvitation` because there's nothing to "accept"; the link
 *  just sends them to the workspace. */
export async function sendMemberAdded({
  to,
  adderName,
  orgName,
  role,
  url,
}: {
  to: string;
  adderName: string | null | undefined;
  orgName: string;
  role: string;
  url: string;
}): Promise<void> {
  const subject = `Du er tilføjet til ${orgName} på Simulant`;
  const html = renderMemberAddedEmail({ adderName, orgName, role, url });

  if (process.env.SMTP_HOST) {
    await sendViaSmtp({ to, subject, html });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html });
    return;
  }
  console.warn(
    "[simulant-auth] No email backend configured. Member-added URL:",
    url,
  );
}

/** Send a passwordless sign-in link. Plugin calls this once per
 *  signIn.magicLink({ email }) — the URL it provides has the token
 *  baked in; clicking it consumes the token and creates the session. */
export async function sendMagicLink({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<void> {
  const subject = "Log ind på Simulant";
  const safeUrl = publicAuthUrl(url);
  const html = renderMagicLinkEmail({ url: safeUrl });

  if (process.env.SMTP_HOST) {
    await sendViaSmtp({ to, subject, html });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html });
    return;
  }
  console.warn(
    "[simulant-auth] No email backend configured. Magic link URL:",
    safeUrl,
  );
}

/** Send a 6-digit email-OTP code. Plugin calls this for sign-in,
 *  email-verification, and forget-password flows; `type` tells us
 *  which copy to render. */
export async function sendOTPCode({
  to,
  code,
  type,
}: {
  to: string;
  code: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
}): Promise<void> {
  const subjectByType: Record<typeof type, string> = {
    "sign-in": "Din Simulant-loginkode",
    "email-verification": "Bekræft din e-mail — Simulant",
    "forget-password": "Nulstil din Simulant-konto",
    "change-email": "Bekræft din nye e-mail — Simulant",
  };
  const subject = subjectByType[type];
  const html = renderOtpEmail({ code, type });

  if (process.env.SMTP_HOST) {
    await sendViaSmtp({ to, subject, html });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to, subject, html });
    return;
  }
  console.warn(
    "[simulant-auth] No email backend configured. OTP code:",
    code,
    "for",
    to,
  );
}

async function sendViaSmtp({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secureEnv = process.env.SMTP_SECURE?.toLowerCase();
  const secure = secureEnv ? secureEnv === "true" : port === 465;

  // Dynamic import: nodemailer is a CommonJS lib that Next/Turbopack
  // tries to resolve at build time when this file is transpiled into
  // the consuming app's bundle. Runtime-only import keeps it out of
  // the build graph; it's only require()d when SMTP_HOST is set.
  // The cast dodges "Could not find a declaration file" errors in
  // consuming apps that don't ship @types/nodemailer (it's only a
  // devDep here, not a transitive dep of the github: install).
  const nm: { createTransport: (opts: unknown) => {
    sendMail: (msg: unknown) => Promise<unknown>;
  } } = (await import("nodemailer" as string)).default;

  const transport = nm.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  await transport.sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
  });
}

async function sendViaResend({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}

function renderResetEmail({
  name,
  url,
}: {
  name: string | null | undefined;
  url: string;
}): string {
  const greeting = name ? `Hej ${escapeHtml(name)},` : "Hej,";
  return `<!doctype html>
<html lang="da">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 600;">${greeting}</h1>
  <p>Du har bedt om at nulstille dit Simulant-kodeord. Klik på knappen nedenfor for at vælge et nyt kodeord. Linket virker i 1 time.</p>
  <p style="margin: 32px 0;">
    <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Nulstil kodeord</a>
  </p>
  <p style="font-size: 13px; color: #666;">Hvis du ikke bad om dette, kan du ignorere mailen.</p>
  <p style="font-size: 13px; color: #666;">— Simulant</p>
</body>
</html>`;
}

function renderVerificationEmail({
  name,
  url,
}: {
  name: string | null | undefined;
  url: string;
}): string {
  const greeting = name ? `Hej ${escapeHtml(name)},` : "Hej,";
  return `<!doctype html>
<html lang="da">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 600;">${greeting}</h1>
  <p>Bekræft din e-mailadresse for at aktivere din Simulant-konto. Linket virker i 24 timer.</p>
  <p style="margin: 32px 0;">
    <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Bekræft e-mail</a>
  </p>
  <p style="font-size: 13px; color: #666;">Hvis du ikke har oprettet en Simulant-konto, kan du ignorere mailen.</p>
  <p style="font-size: 13px; color: #666;">— Simulant</p>
</body>
</html>`;
}

function renderOrgInvitationEmail({
  inviterName,
  orgName,
  role,
  url,
}: {
  inviterName: string | null | undefined;
  orgName: string;
  role: string;
  url: string;
}): string {
  // Map Better-Auth's role slugs to Danish labels in the email body
  // so the invitee sees "lærer" rather than "workspace_admin".
  const roleLabels: Record<string, string> = {
    superadmin: "superadmin",
    workspace_admin: "lærer / workspace-admin",
    student_manager: "lærer-assistent",
    student: "elev",
  };
  const roleLabel = roleLabels[role] ?? role;
  const inviter = inviterName ? escapeHtml(inviterName) : "En kollega";
  return `<!doctype html>
<html lang="da">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 600;">Du er inviteret til ${escapeHtml(orgName)}</h1>
  <p>${inviter} har inviteret dig til at deltage i <strong>${escapeHtml(orgName)}</strong> på Simulant som <strong>${escapeHtml(roleLabel)}</strong>.</p>
  <p style="margin: 32px 0;">
    <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Accepter invitation</a>
  </p>
  <p style="font-size: 13px; color: #666;">Hvis du ikke kender afsenderen, kan du ignorere mailen.</p>
  <p style="font-size: 13px; color: #666;">— Simulant</p>
</body>
</html>`;
}

function renderMemberAddedEmail({
  adderName,
  orgName,
  role,
  url,
}: {
  adderName: string | null | undefined;
  orgName: string;
  role: string;
  url: string;
}): string {
  const roleLabels: Record<string, string> = {
    superadmin: "superadmin",
    workspace_admin: "lærer / workspace-admin",
    student_manager: "lærer-assistent",
    student: "elev",
  };
  const roleLabel = roleLabels[role] ?? role;
  const adder = adderName ? escapeHtml(adderName) : "En kollega";
  return `<!doctype html>
<html lang="da">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 600;">Du er tilføjet til ${escapeHtml(orgName)}</h1>
  <p>${adder} har tilføjet dig til <strong>${escapeHtml(orgName)}</strong> på Simulant som <strong>${escapeHtml(roleLabel)}</strong>. Du har adgang med det samme — der er intet at acceptere.</p>
  <p style="margin: 32px 0;">
    <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Gå til Simulant</a>
  </p>
  <p style="font-size: 13px; color: #666;">Hvis du ikke kender afsenderen, kan du ignorere mailen eller kontakte support.</p>
  <p style="font-size: 13px; color: #666;">— Simulant</p>
</body>
</html>`;
}

function renderMagicLinkEmail({ url }: { url: string }): string {
  return `<!doctype html>
<html lang="da">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 600;">Hej,</h1>
  <p>Klik på knappen nedenfor for at logge ind på Simulant. Linket virker i 10 minutter og kan kun bruges én gang.</p>
  <p style="margin: 32px 0;">
    <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Log ind</a>
  </p>
  <p style="font-size: 13px; color: #666;">Hvis du ikke bad om dette, kan du ignorere mailen.</p>
  <p style="font-size: 13px; color: #666;">— Simulant</p>
</body>
</html>`;
}

function renderOtpEmail({
  code,
  type,
}: {
  code: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
}): string {
  const intro =
    type === "sign-in"
      ? "Brug koden nedenfor for at logge ind på Simulant."
      : type === "email-verification"
        ? "Brug koden nedenfor for at bekræfte din e-mailadresse."
        : type === "change-email"
          ? "Brug koden nedenfor for at bekræfte din nye e-mailadresse."
          : "Brug koden nedenfor for at nulstille din Simulant-konto.";
  return `<!doctype html>
<html lang="da">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 600;">Hej,</h1>
  <p>${intro} Koden virker i 10 minutter.</p>
  <p style="margin: 32px 0; padding: 20px; background: #f4f4f5; border-radius: 8px; text-align: center;">
    <span style="font-size: 32px; font-weight: 700; letter-spacing: 0.3em; font-family: 'SF Mono', Menlo, monospace; color: #18181b;">${escapeHtml(code)}</span>
  </p>
  <p style="font-size: 13px; color: #666;">Hvis du ikke bad om dette, kan du ignorere mailen.</p>
  <p style="font-size: 13px; color: #666;">— Simulant</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
