import "server-only";

type VerificationEmailInput = {
  displayName: string | null;
  confirmationUrl: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function appOrigin() {
  const configured = process.env.APP_ORIGIN?.trim() || "https://nopostnow.com";
  const origin = new URL(configured);
  if (
    origin.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && origin.hostname === "localhost")
  ) {
    throw new Error("APP_ORIGIN must use HTTPS.");
  }
  return origin.origin;
}

export function transactionalEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim(),
  );
}

export function verificationEmail({
  displayName,
  confirmationUrl,
}: VerificationEmailInput) {
  const safeName = escapeHtml(displayName?.trim() || "there");
  const safeUrl = escapeHtml(confirmationUrl);
  const subject = "Confirm your NoPostNow email";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#0a0a0a;color:#ffffff;font-family:Inter,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Confirm your email to activate your NoPostNow account.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#111111;border:1px solid #2a2a2a;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="height:5px;background:#ff3b5c;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:36px 36px 16px;text-align:center;">
                <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:16px;background:#ff3b5c;color:#ffffff;font-size:27px;font-weight:900;text-align:center;">N</div>
                <div style="margin-top:18px;font-size:25px;font-weight:900;letter-spacing:-0.8px;">NoPostNow</div>
                <div style="margin-top:8px;color:#8a8a8a;font-size:10px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;">Email confirmation</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 38px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-1px;">One click away.</h1>
                <p style="margin:18px 0 0;color:#cccccc;font-size:15px;line-height:1.7;">Hey ${safeName}, confirm your email to activate your account and enter the chronological photo feed.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0;">
                  <tr>
                    <td align="center" bgcolor="#ffffff" style="border-radius:12px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:15px 28px;color:#0a0a0a;font-size:14px;font-weight:800;line-height:1;text-decoration:none;border-radius:12px;">Confirm my email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#8a8a8a;font-size:12px;line-height:1.6;">The confirmation page will ask you to approve the action. If you did not create this account, you can safely ignore this message.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid #1e1e1e;text-align:center;color:#555555;font-size:10px;line-height:1.6;">No ads. No algorithm. Just the moment.</td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#555555;font-size:10px;">NoPostNow · Transactional account email</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `NoPostNow email confirmation

Hey ${displayName?.trim() || "there"},

Confirm your email to activate your account and enter the chronological photo feed:

${confirmationUrl}

The confirmation page will ask you to approve the action. If you did not create this account, you can safely ignore this message.

No ads. No algorithm. Just the moment.`;

  return { subject, html, text };
}

export async function sendTransactionalEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey,
}: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Transactional email is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
      tags: [{ name: "category", value: "email-verification" }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("Transactional email provider rejected a message.", {
      status: response.status,
    });
    throw new Error("Transactional email delivery failed.");
  }

  const result = (await response.json()) as { id?: string };
  if (!result.id) {
    throw new Error("Transactional email provider returned no message ID.");
  }
  return result.id;
}
