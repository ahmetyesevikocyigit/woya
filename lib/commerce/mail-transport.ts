import "server-only";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

export type MailPayload = {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
};
export type MailResult = {
  state: "sent" | "retry" | "failed" | "unknown";
  providerId: string | null;
  error: string;
};
export function mailTransport() {
  return (
    process.env.EMAIL_TRANSPORT ||
    (process.env.CUSTOMER_EMAIL_API_KEY ? "resend" : "smtp")
  );
}
export function smtpConfiguration() {
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASSWORD || "";
  if (
    !host ||
    !user ||
    !pass ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    /[\s/@]/.test(host) ||
    /[\r\n]/.test(user)
  )
    return null;
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    requireTLS: true,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    dnsTimeout: 8000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false as const,
    debug: false,
  };
}
export function mailConfigured() {
  return mailTransport() === "smtp"
    ? !!smtpConfiguration()
    : mailTransport() === "resend" && !!process.env.CUSTOMER_EMAIL_API_KEY;
}
// A Message-ID helps trace a message; SMTP does NOT promise deduplication by it.
export function smtpMessageId(key: string) {
  return `<woya-${createHash("sha256").update(key).digest("hex")}@woyatablo.com>`;
}
export function smtpFailure(error: unknown): MailResult {
  const e = error as { code?: string; command?: string; responseCode?: number };
  const code = Number(e?.responseCode);
  if (code >= 400 && code < 500)
    return { state: "retry", providerId: null, error: `smtp_${code}` };
  if (code >= 500 && code < 600)
    return { state: "failed", providerId: null, error: `smtp_${code}` };
  if (["EAUTH", "ETLS", "EENVELOPE", "EMESSAGE"].includes(e?.code || ""))
    return {
      state: "failed",
      providerId: null,
      error: "smtp_configuration_or_message",
    };
  // Retry only failures known to precede message submission. A disconnect during
  // DATA might occur after the server accepted it, so it requires manual review.
  if (
    ["CONN", "EHLO", "HELO", "STARTTLS", "MAIL FROM", "RCPT TO"].includes(
      e?.command || "",
    ) ||
    e?.command?.startsWith("AUTH")
  )
    return { state: "retry", providerId: null, error: "smtp_before_data" };
  return {
    state: "unknown",
    providerId: null,
    error: "smtp_acceptance_unknown",
  };
}
export async function sendMail(
  payload: MailPayload,
  key: string,
): Promise<MailResult> {
  if (mailTransport() === "smtp") {
    const config = smtpConfiguration();
    if (!config)
      return {
        state: "failed",
        providerId: null,
        error: "smtp_not_configured",
      };
    const transport = nodemailer.createTransport(config);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        transport.sendMail({
          from: payload.from,
          to: payload.to,
          replyTo: payload.reply_to,
          subject: payload.subject,
          text: payload.text,
          messageId: smtpMessageId(key),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            transport.close();
            reject(new Error("SMTP_DEADLINE"));
          }, 25000);
        }),
      ]);
      if (!result.accepted.length)
        return {
          state: "failed",
          providerId: null,
          error: "smtp_recipient_rejected",
        };
      return { state: "sent", providerId: result.messageId, error: "" };
    } catch (error) {
      return smtpFailure(error);
    } finally {
      if (timer) clearTimeout(timer);
      transport.close();
    }
  }
  // Legacy adapter retained for existing deployments/tests; WOYA uses SMTP.
  if (mailTransport() !== "resend")
    return {
      state: "failed",
      providerId: null,
      error: "mail_transport_invalid",
    };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CUSTOMER_EMAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    const body = raw.length <= 16000 ? JSON.parse(raw) : {};
    if (response.ok && typeof body.id === "string")
      return { state: "sent", providerId: body.id, error: "" };
    return {
      state:
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 &&
          body.name === "concurrent_idempotent_requests")
          ? "retry"
          : "failed",
      providerId: null,
      error: `provider_${response.status}`,
    };
  } catch {
    return { state: "retry", providerId: null, error: "network_unknown" };
  }
}
