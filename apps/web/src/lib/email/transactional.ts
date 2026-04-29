import "server-only";

import { getEmailSenderConfig, getResendClient } from "./resend";

export { EmailConfigurationError } from "./resend";

type EmailTag = {
  name: string;
  value: string;
};

type SendTransactionalEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | string[];
  tags?: EmailTag[];
};

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

function normalizeReplyTo(
  value: string | string[] | null | undefined,
): string[] | undefined {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
) {
  const resend = getResendClient();
  const sender = getEmailSenderConfig();
  const response = await resend.emails.send({
    from: sender.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: normalizeReplyTo(input.replyTo ?? sender.replyTo),
    tags: input.tags,
  });

  if (response.error) {
    throw new EmailDeliveryError(response.error.message);
  }

  if (!response.data?.id) {
    throw new EmailDeliveryError(
      "Resend accepted the request without returning a message id.",
    );
  }

  return {
    id: response.data.id,
  };
}
