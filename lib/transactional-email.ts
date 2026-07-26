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
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f2f1ed;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Confirm your email to activate your NoPostNow account.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f1ed;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #deddd8;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.12);">
            <tr>
              <td style="height:7px;background:#ef2f50;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:32px 36px 28px;background:#101010;text-align:center;">
                <div style="display:inline-block;width:58px;height:58px;line-height:58px;border-radius:17px;background:#ef2f50;color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-size:28px;font-weight:900;text-align:center;">N</div>
                <div style="margin-top:17px;color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-size:27px;font-weight:900;letter-spacing:-0.8px;">NoPostNow</div>
                <div style="margin-top:9px;color:#b8b8b8;font-size:10px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;">No ads &middot; No algorithm</div>
              </td>
            </tr>
            <tr>
              <td style="padding:38px 38px 40px;text-align:left;">
                <div style="color:#ef2f50;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Email confirmation</div>
                <h1 style="margin:10px 0 0;color:#111111 !important;-webkit-text-fill-color:#111111;font-size:32px;line-height:1.14;letter-spacing:-1px;">Your feed is waiting.</h1>
                <p style="margin:18px 0 0;color:#4d4d4d;font-size:16px;line-height:1.7;">Hey ${safeName}, confirm your address to activate your account and enter the chronological photo feed.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td align="center" bgcolor="#ef2f50" style="border:2px solid #c51f3d;border-radius:14px;box-shadow:0 8px 20px rgba(239,47,80,0.28);">
                      <a href="${safeUrl}" style="display:block;padding:18px 22px;background:#ef2f50;color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-size:16px;font-weight:900;line-height:1.15;text-align:center;text-decoration:none;text-transform:uppercase;letter-spacing:0.7px;border-radius:12px;">Confirm my email &nbsp;&rarr;</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;padding:16px 18px;background:#f6f5f2;border-left:4px solid #ef2f50;border-radius:8px;color:#686868;font-size:12px;line-height:1.65;">For your security, the next page asks you to approve the action. If you did not create this account, simply ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid #e7e6e1;background:#faf9f7;text-align:center;color:#777777;font-size:11px;line-height:1.6;">NoPostNow &middot; No ads. No algorithm. Just the moment.</td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#777777;font-size:10px;">Secure account email from NoPostNow</p>
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
