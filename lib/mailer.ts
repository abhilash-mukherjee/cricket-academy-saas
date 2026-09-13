import { Resend } from "resend";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
};

export type MailSender = (message: MailMessage) => Promise<void>;

const capturedMessages: MailMessage[] = [];
let captureEnabled = false;
let customSender: MailSender | null = null;

function getResendSender(): MailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return async (message) => {
      console.log(`[mail] To: ${message.to}`);
      console.log(`[mail] Subject: ${message.subject}`);
      console.log(`[mail] Body: ${message.html}`);
    };
  }

  const resend = new Resend(apiKey);
  return async (message) => {
    await resend.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  };
}

export function enableMailCapture(): void {
  captureEnabled = true;
  capturedMessages.length = 0;
}

export function disableMailCapture(): void {
  captureEnabled = false;
  capturedMessages.length = 0;
}

export function getCapturedMail(): readonly MailMessage[] {
  return capturedMessages;
}

export function clearCapturedMail(): void {
  capturedMessages.length = 0;
}

export function setMailSender(sender: MailSender | null): void {
  customSender = sender;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (captureEnabled) {
    capturedMessages.push(message);
    return;
  }

  const sender = customSender ?? getResendSender();
  await sender(message);
}

export function extractFirstUrl(html: string): string | null {
  const match = html.match(/href="([^"]+)"/);
  return match?.[1] ?? null;
}
