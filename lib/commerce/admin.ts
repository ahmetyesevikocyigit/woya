import "server-only";
import { mailConfigured, mailTransport } from "./mail-transport";
import { randomUUID } from "node:crypto";
import { db } from "../admin/db";
import { HttpError } from "../http-error";
import { storeSettings } from "./settings";
import { refundSchema } from "./schema";
import { enqueueOrderEmail } from "./outbox";
import type { z } from "zod";
export async function commerceSummary(orderId?: string) {
  if (orderId) {
    const [documents, refunds] = await Promise.all([
      db()`SELECT id,bytes,created_at FROM woya_private_documents WHERE order_id=${orderId} ORDER BY created_at DESC`,
      db()`SELECT id,amount,provider_reference,reason,performed_at FROM woya_refunds WHERE order_id=${orderId} ORDER BY created_at DESC`,
    ]);
    return { documents, refunds };
  }
  const [settings, emails, missingPrices, payments] = await Promise.all([
    storeSettings(),
    db()`SELECT id,event_key,order_id,state,attempts,error_code,created_at,updated_at FROM woya_email_outbox ORDER BY created_at DESC LIMIT 100`,
    db()`SELECT id,code,data->>'title' AS title FROM woya_products WHERE (data->>'active')::boolean AND COALESCE((data->>'salePrice')::numeric,(data->>'price')::numeric,0)<=0`,
    db()`SELECT merchant_oid,order_id,state,created_at FROM woya_payments WHERE state IN ('creating','pending','review') OR (state='ready' AND expires_at<now()) ORDER BY created_at DESC LIMIT 100`,
  ]);
  return {
    settings,
    emails,
    missingPrices,
    payments,
    providers: {
      email: mailConfigured(),
      transport: mailTransport(),
      webhook:
        mailTransport() === "resend" &&
        Boolean(process.env.RESEND_WEBHOOK_SECRET),
      paytr: Boolean(process.env.PAYTR_MERCHANT_KEY),
      liveVerified: process.env.COMMERCE_LIVE_VERIFIED === "true",
    },
  };
}
export async function recordRefund(
  actor: string,
  input: z.infer<typeof refundSchema>,
) {
  if (new Date(input.performedAt).getTime() > Date.now() + 60000)
    throw new HttpError(400, "İade tarihi gelecekte olamaz.");
  return db().begin(async (tx) => {
    const [order] =
      await tx`SELECT payment FROM woya_orders WHERE id=${input.orderId} FOR UPDATE`;
    if (!order) throw new HttpError(404, "Sipariş bulunamadı.");
    const [previous] =
      await tx`SELECT * FROM woya_refunds WHERE submission_id=${input.submissionId}`;
    if (previous) {
      if (
        previous.order_id !== input.orderId ||
        Number(previous.amount) !== input.amount ||
        previous.provider_reference !== input.providerReference ||
        previous.reason !== input.reason ||
        new Date(previous.performed_at).toISOString() !==
          new Date(input.performedAt).toISOString()
      )
        throw new HttpError(409, "İşlem anahtarı kullanıldı.");
      return { id: previous.id };
    }
    if (order.payment?.state !== "paid" || order.payment.testMode)
      throw new HttpError(409, "Doğrulanmış gerçek ödeme gerekli.");
    const [total] =
      await tx`SELECT COALESCE(sum(amount),0) AS amount FROM woya_refunds WHERE order_id=${input.orderId}`;
    if (
      !Number.isSafeInteger(order.payment.receivedAmount) ||
      Number(total.amount) + input.amount > Number(order.payment.receivedAmount)
    )
      throw new HttpError(409, "İade toplamı tahsil edilen tutarı aşamaz.");
    const [reference] =
      await tx`SELECT id FROM woya_refunds WHERE provider_reference=${input.providerReference}`;
    if (reference)
      throw new HttpError(409, "Bu PayTR iade referansı zaten kayıtlı.");
    const id = randomUUID();
    await tx`INSERT INTO woya_refunds(id,submission_id,order_id,amount,provider_reference,reason,performed_at,actor) VALUES(${id},${input.submissionId},${input.orderId},${input.amount},${input.providerReference},${input.reason},${input.performedAt},${actor})`;
    await enqueueOrderEmail(
      tx,
      input.orderId,
      `refund:${id}`,
      "Para iadeniz kaydedildi",
      `${(input.amount / 100).toFixed(2)} TL iade PayTR üzerinden yapıldı. İşlem referansı: ${input.providerReference}. ${input.reason}`,
    );
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${actor},'refund:recorded',${input.orderId})`;
    return { id };
  });
}
