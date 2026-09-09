import "server-only";
import { mailConfigured, sendMail } from "../commerce/mail-transport";
import { databaseConfigured } from "../admin/db";
import { storeSettings } from "../commerce/settings";
import { HttpError } from "../http-error";
export class AccountEmailDeliveryError extends HttpError {
  constructor(public deliveryUncertain: boolean) {
    super(
      503,
      "E-posta hizmetine ulaşılamadı. Lütfen daha sonra tekrar deneyin.",
    );
  }
}
export function emailConfiguration() {
  const from = process.env.CUSTOMER_EMAIL_FROM;
  let origin = "";
  try {
    const url = new URL(process.env.APP_URL || "");
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      origin = url.origin;
  } catch {
    /* fail closed */
  }
  if (!mailConfigured() || !from || !origin || /[\r\n]/.test(from))
    throw new HttpError(
      503,
      "E-posta hizmeti şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
    );
  return { from, origin };
}
export async function sendAccountEmail(
  to: string,
  token: string,
  purpose: "verify" | "reset" | "email" | "guest",
) {
  const { from, origin } = emailConfiguration();
  const replyTo = databaseConfigured()
    ? (await storeSettings()).data.replyTo
    : "";
  const pages = {
    verify: "dogrula",
    reset: "sifre-sifirla",
    email: "eposta-dogrula",
    guest: "misafir-dogrula",
  };
  const subjects = {
    verify: "E-posta adresinizi doğrulayın",
    reset: "Şifrenizi sıfırlayın",
    email: "Yeni e-posta adresinizi doğrulayın",
    guest: "Siparişinize güvenli erişim",
  };
  const link = `${origin}/profil/${pages[purpose]}#token=${token}`;
  try {
    const result = await sendMail(
      {
        from,
        ...(replyTo ? { reply_to: replyTo } : {}),
        to: [to],
        subject: `WOYA · ${subjects[purpose]}`,
        text: `${subjects[purpose]}\n\n${link}\n\nBu bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir. İşlemi siz başlatmadıysanız bu e-postayı dikkate almayın.`,
      },
      `woya-${purpose}-${token}`,
    );
    if (result.state !== "sent")
      throw new AccountEmailDeliveryError(
        result.state === "unknown" || result.error === "network_unknown",
      );
  } catch (error) {
    if (error instanceof AccountEmailDeliveryError) throw error;
    throw new AccountEmailDeliveryError(true);
  }
}
