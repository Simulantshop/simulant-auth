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

import nodemailer from "nodemailer";

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
  const html = renderResetEmail({ name, url });

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
    url,
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
  type: "sign-in" | "email-verification" | "forget-password";
}): Promise<void> {
  const subjectByType: Record<typeof type, string> = {
    "sign-in": "Din Simulant-loginkode",
    "email-verification": "Bekræft din e-mail — Simulant",
    "forget-password": "Nulstil din Simulant-konto",
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

  const transport = nodemailer.createTransport({
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

function renderOtpEmail({
  code,
  type,
}: {
  code: string;
  type: "sign-in" | "email-verification" | "forget-password";
}): string {
  const intro =
    type === "sign-in"
      ? "Brug koden nedenfor for at logge ind på Simulant."
      : type === "email-verification"
        ? "Brug koden nedenfor for at bekræfte din e-mailadresse."
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
