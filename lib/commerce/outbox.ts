import "server-only";
import { randomUUID } from "node:crypto";
import type { Transaction } from "../customer/auth";
export async function enqueueOrderEmail(
  tx: Transaction,
  orderId: string,
  key: string,
  subject: string,
  message: string,
  merchant = false,
) {
  const [order] =
    await tx`SELECT reference,customer FROM woya_orders WHERE id=${orderId}`;
  const [settings] =
    await tx`SELECT data FROM woya_store_settings WHERE id=true`;
  const to = merchant
    ? settings?.data.notificationEmail
    : order?.customer.email;
  const origin = new URL(process.env.APP_URL || "https://woyatablo.com").origin;
  const link = merchant
    ? `${origin}/admin/siparisler/${orderId}`
    : `${origin}/profil/siparisler/${order.reference}`;
  const payload = {
    from: process.env.CUSTOMER_EMAIL_FROM || "WOYA <info@woyatablo.com>",
    to: [to || ""],
    ...(settings?.data.replyTo ? { reply_to: settings.data.replyTo } : {}),
    subject: `WOYA · ${subject}`,
    text: `${subject}\n\nSipariş: ${order.reference}\n${message}\n\n${link}\n\nÜyeliksiz sipariş takibi: ${origin}/profil/misafir`,
  };
  await tx`INSERT INTO woya_email_outbox(id,event_key,order_id,payload,state,error_code)
 VALUES(${randomUUID()},${key},${orderId},${tx.json(payload)},${to ? "queued" : "failed"},${to ? null : "recipient_missing"}) ON CONFLICT(event_key) DO NOTHING`;
}
