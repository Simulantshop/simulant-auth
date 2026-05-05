const FROM = "Simulant <noreply@simulant.dk>";
const RESEND_KEY = () => process.env.RESEND_API_KEY;

export async function sendPasswordReset({
  to,
  name,
  url,
}: {
  to: string;
  name: string | null | undefined;
  url: string;
}): Promise<void> {
  const key = RESEND_KEY();
  if (!key) {
    console.warn("[simulant-auth] RESEND_API_KEY missing — would send reset to", to, "with url", url);
    return;
  }

  const subject = "Nulstil dit Simulant-kodeord";
  const html = renderResetEmail({ name, url });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
