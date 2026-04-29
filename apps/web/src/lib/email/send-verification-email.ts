import "server-only";

import { sendTransactionalEmail } from "./transactional";

type SendVerificationEmailInput = {
  email: string;
  code: string;
  verificationUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildVerificationEmailHtml(input: SendVerificationEmailInput) {
  const safeCode = escapeHtml(input.code);
  const safeVerificationUrl = escapeHtml(input.verificationUrl);
  const safeEmail = escapeHtml(input.email);

  return `
    <div style="margin:0;padding:32px 16px;background:#020617;color:#e2e8f0;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;border:1px solid rgba(148,163,184,0.2);border-radius:24px;overflow:hidden;background:linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98));">
        <div style="padding:32px 32px 12px 32px;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid rgba(34,211,238,0.25);background:rgba(34,211,238,0.12);color:#cffafe;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">
            VendorStream Verification
          </div>
          <h1 style="margin:20px 0 12px 0;font-size:28px;line-height:1.2;color:#f8fafc;">
            Verify your email address
          </h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#cbd5e1;">
            Use the verification code below to complete sign-in for <strong style="color:#f8fafc;">${safeEmail}</strong>.
          </p>
        </div>
        <div style="padding:0 32px 32px 32px;">
          <div style="margin:0 0 20px 0;border:1px solid rgba(148,163,184,0.16);border-radius:20px;background:rgba(15,23,42,0.72);padding:24px;text-align:center;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">
              Verification Code
            </div>
            <div style="font-size:36px;line-height:1;font-weight:700;letter-spacing:0.32em;color:#f8fafc;">
              ${safeCode}
            </div>
          </div>
          <p style="margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#94a3b8;">
            This code expires in 10 minutes. If you prefer, open the verification page directly and enter the code there.
          </p>
          <a
            href="${safeVerificationUrl}"
            style="display:inline-block;padding:13px 18px;border-radius:14px;background:#f8fafc;color:#020617;text-decoration:none;font-weight:600;"
          >
            Open verification page
          </a>
        </div>
      </div>
    </div>
  `.trim();
}

function buildVerificationEmailText(input: SendVerificationEmailInput) {
  return [
    "VendorStream email verification",
    "",
    `Verification code: ${input.code}`,
    "",
    "Enter this code on the verification page to finish setting up your account.",
    `Verification page: ${input.verificationUrl}`,
    "",
    "This code expires in 10 minutes.",
  ].join("\n");
}

export async function sendVerificationEmail(
  input: SendVerificationEmailInput,
) {
  return sendTransactionalEmail({
    to: input.email,
    subject: "Verify your VendorStream email",
    html: buildVerificationEmailHtml(input),
    text: buildVerificationEmailText(input),
    tags: [
      {
        name: "category",
        value: "email-verification",
      },
    ],
  });
}
