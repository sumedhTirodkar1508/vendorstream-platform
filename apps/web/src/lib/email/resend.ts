import "server-only";

import { Resend } from "resend";

const DEFAULT_EMAIL_FROM = "VendorStream <onboarding@resend.dev>";

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

let resendClient: Resend | null = null;

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getEmailSenderConfig() {
  return {
    from: readOptionalEnv("EMAIL_FROM") ?? DEFAULT_EMAIL_FROM,
    replyTo: readOptionalEnv("EMAIL_REPLY_TO"),
  };
}

export function getResendClient() {
  const apiKey = readOptionalEnv("RESEND_API_KEY");

  if (!apiKey) {
    throw new EmailConfigurationError(
      "RESEND_API_KEY is missing. Email delivery is not configured.",
    );
  }

  resendClient ??= new Resend(apiKey);

  return resendClient;
}
