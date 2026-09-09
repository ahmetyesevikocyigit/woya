import "server-only";
import { customerSession, lockCustomer } from "../customer/auth";
import { subtractPurchase } from "./cart";
import type { AccountCartItem } from "../customer/schema";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../admin/db";
import { HttpError, rateLimit } from "../admin/auth";
import { paymentConfig, customerIp, merchantConfig } from "./config";
import { checkoutOwner, checkoutQuote, digest } from "./checkout";
import { tokenSignature, verifyCallback } from "./protocol";
import type {
  CheckoutInput,
  CheckoutQuote,
  PaymentSummary,
  PaymentState,
} from "./schema";

import { enqueueOrderEmail } from "../commerce/outbox";

const paymentUrl = (oid: string) => `/odeme/islem/${oid}`;
export async function startPayment(input: CheckoutInput, request: Request) {
  const config = paymentConfig();
  const account = await customerSession();
  if (input.accountId && input.accountId !== account?.customer.id)
    throw new HttpError(401, "Oturumunuz değişti. Yeniden giriş yapın.");
  const owner = await checkoutOwner();
  const ip = customerIp(request, config.testMode);
  await rateLimit(`paytr:start:${digest(ip)}`, 30, 3600);
  const inputHash = digest(JSON.stringify(input));
  // Resolve fresh catalog data before opening the transaction. Replays can still
  // resume an existing payment when its products have since been taken offline.
  const pricing = await checkoutQuote(input.items).then(
    (quote) => ({ quote, error: undefined }),
    (error: unknown) => ({ quote: undefined, error }),
  );
  const sql = db();
  const attempt = await sql.begin(async (tx) => {
    // Serialize even different idempotency keys for one browser's unresolved payment.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${owner},0))`;
    if (account) await lockCustomer(tx, account);
    const [previous] =
      await tx`SELECT * FROM woya_payments WHERE request_id=${input.requestId}`;
    if (previous) {
      if (previous.owner_hash !== owner || previous.input_hash !== inputHash)
        throw new HttpError(
          409,
          "Ödeme bilgileri değişti. Sepetinizi kontrol edin.",
        );
      return { fresh: false as const, oid: String(previous.merchant_oid) };
    }
    const [active] =
      await tx`SELECT merchant_oid FROM woya_payments WHERE owner_hash=${owner}
      AND state IN ('creating','ready','pending','review') ORDER BY created_at DESC LIMIT 1`;
    if (active)
      return { fresh: false as const, oid: String(active.merchant_oid) };
    if (!pricing.quote) throw pricing.error;
    const quote = pricing.quote;
    if (quote.hash !== input.quoteHash)
      throw new HttpError(
        409,
        "Fiyat veya ürün bilgisi güncellendi. Özeti yenileyip tekrar onaylayın.",
      );
    const id = randomUUID();
    const oid = `WOYA${id.replaceAll("-", "")}`;
    const summary: PaymentSummary = {
      provider: "paytr",
      state: "creating",
      merchantOid: oid,
      amount: quote.total,
      shipping: quote.shipping,
      testMode: config.testMode,
    };
    await tx`INSERT INTO woya_orders(id,request_id,reference,customer,items,note,payment,history,customer_id,billing,legal_snapshot)
      VALUES(${id},${input.requestId},${oid},${tx.json(input.customer)},${tx.json(quote.items)},${input.note},${tx.json(summary)},
      ${tx.json([{ status: "Ödeme bekleniyor", at: new Date().toISOString() }])},${account?.customer.id ?? null},${tx.json(input.billing ?? { name: input.customer.name, address: input.customer.address })},${tx.json({ version: quote.store.legalVersion, acceptedAt: new Date().toISOString(), store: quote.store, items: quote.items, subtotal: quote.subtotal, shipping: quote.shipping, total: quote.total })})`;
    await tx`INSERT INTO woya_payments(merchant_oid,order_id,request_id,owner_hash,input_hash,amount,test_mode,state,consent_version)
      VALUES(${oid},${id},${input.requestId},${owner},${inputHash},${quote.total},${config.testMode},'creating',${config.legalVersion || "test-only"})`;
    return { fresh: true as const, oid, quote };
  });
  if (!attempt.fresh) return { url: paymentUrl(attempt.oid) };
  const { quote } = attempt;

  const basket = quote.items.map((item) => [
    item.title,
    item.unitPrice.toFixed(2),
    item.quantity,
  ]);
  if (quote.shipping)
    basket.push(["Kargo", (quote.shipping / 100).toFixed(2), 1]);
  const resultUrl = `${config.origin}/odeme/sonuc?order=${attempt.oid}`;
  const fields: Record<string, string> = {
    merchant_id: config.merchant.id,
    user_ip: ip,
    merchant_oid: attempt.oid,
    email: input.customer.email,
    payment_amount: String(quote.total),
    user_basket: Buffer.from(JSON.stringify(basket), "utf8").toString("base64"),
    no_installment: "0",
    max_installment: "0",
    currency: "TL",
    test_mode: config.testMode ? "1" : "0",
    user_name: input.customer.name,
    user_address: input.customer.address,
    user_phone: input.customer.phone,
    merchant_ok_url: resultUrl,
    merchant_fail_url: resultUrl,
    timeout_limit: "30",
    debug_on: "0",
    lang: "tr",
  };
  fields.paytr_token = tokenSignature(fields, config.merchant);
  let state: PaymentState = "pending";
  let token: string | null = null;
  try {
    const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    // Never log or expose provider response bodies, which may contain customer data.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) throw new Error("EMPTY_PROVIDER_RESPONSE");
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16000) {
        await reader.cancel();
        throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
      }
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      response.ok &&
      body.status === "success" &&
      typeof body.token === "string" &&
      /^[A-Za-z0-9]{16,256}$/.test(body.token)
    ) {
      token = body.token;
      state = "ready";
    } else if (response.ok && body.status === "failed") state = "token_failed";
  } catch {
    // A timeout is ambiguous: preserve the attempt and await reconciliation, never silently retry a charge.
  }
  await sql.begin(async (tx) => {
    const rows =
      await tx`UPDATE woya_payments SET state=${state},iframe_token=${token}
      WHERE merchant_oid=${attempt.oid} AND state='creating' RETURNING order_id`;
    if (rows.length)
      await tx`UPDATE woya_orders SET payment=payment || ${tx.json({ state })}::jsonb,version=version+1 WHERE id=${rows[0].order_id}`;
  });
  return { url: paymentUrl(attempt.oid) };
}

const oidSchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/);
export async function readPayment(oid: string) {
  oidSchema.parse(oid);
  const owner = await checkoutOwner();
  const account = await customerSession();
  const [row] =
    await db()`SELECT p.state,p.iframe_token,p.expires_at,o.reference,o.payment,o.items,o.customer
    FROM woya_payments p JOIN woya_orders o ON o.id=p.order_id WHERE p.merchant_oid=${oid} AND p.owner_hash=${owner} AND (o.customer_id IS NULL OR o.customer_id=${account?.customer.id ?? null})`;
  if (!row) throw new HttpError(404, "Ödeme kaydı bulunamadı.");
  return {
    reference: String(row.reference),
    payment: row.payment as PaymentSummary,
    iframeUrl:
      row.state === "ready" && row.expires_at > new Date() && row.iframe_token
        ? `https://www.paytr.com/odeme/guvenli/${row.iframe_token}`
        : null,
    items: row.items as CheckoutQuote["items"],
    customer: row.customer as CheckoutInput["customer"],
  };
}

export const callbackSchema = z.object({
  merchant_oid: oidSchema,
  status: z.enum(["success", "failed"]),
  total_amount: z.string().regex(/^\d{1,12}$/),
  hash: z.string().max(100),
  payment_amount: z.string().regex(/^\d{1,12}$/),
  currency: z.string().max(8),
  test_mode: z.enum(["0", "1"]).optional(),
  payment_type: z.string().max(20),
});
export async function handleCallback(raw: unknown) {
  const fields = callbackSchema.parse(raw);
  if (!verifyCallback(fields, merchantConfig()))
    throw new HttpError(403, "Invalid signature");
  // Callback processing remains enabled when the checkout kill switch is off.
  await db().begin(async (tx) => {
    const [owner] =
      await tx`SELECT o.customer_id FROM woya_orders o JOIN woya_payments p ON p.order_id=o.id WHERE p.merchant_oid=${fields.merchant_oid}`;
    if (owner?.customer_id)
      await tx`SELECT id FROM woya_customers WHERE id=${owner.customer_id} FOR UPDATE`;
    const [row] =
      await tx`SELECT * FROM woya_payments WHERE merchant_oid=${fields.merchant_oid} FOR UPDATE`;
    if (!row) throw new HttpError(404, "Unknown payment");
    if (row.callback_hash) {
      if (row.callback_hash === fields.hash) return;
      // Never demote paid orders or automatically fulfill a contradictory result.
      if (row.state !== "paid") {
        await tx`UPDATE woya_payments SET state='review' WHERE merchant_oid=${fields.merchant_oid}`;
        await tx`UPDATE woya_orders SET payment=payment || '{"state":"review"}'::jsonb,version=version+1 WHERE id=${row.order_id}`;
      }
      await tx`INSERT INTO woya_audit(actor,action,entity) VALUES('paytr','payment:conflicting-callback',${row.order_id})`;
      return;
    }
    const testMode = Boolean(row.test_mode) || fields.test_mode === "1";
    const receivedAmount = Number(fields.total_amount);
    const matches =
      receivedAmount >= row.amount &&
      Number(fields.payment_amount) === row.amount &&
      fields.currency === "TL" &&
      fields.payment_type === "card" &&
      (!row.test_mode || fields.test_mode === "1");
    const state =
      fields.status === "failed" ? "failed" : matches ? "paid" : "review";
    const paidAt = state === "paid" ? new Date().toISOString() : undefined;
    const [order] =
      await tx`SELECT status,customer_id,items FROM woya_orders WHERE id=${row.order_id} FOR UPDATE`;
    const fulfill = state === "paid" && !testMode && order.status !== "iptal";
    const status = fulfill
      ? "onaylandi"
      : state === "failed"
        ? "iptal"
        : order.status;
    const summary = {
      state,
      testMode,
      receivedAmount,
      ...(paidAt ? { paidAt } : {}),
    };
    await tx`UPDATE woya_payments SET state=${state},test_mode=${testMode},received_amount=${receivedAmount},callback_hash=${fields.hash},iframe_token=NULL WHERE merchant_oid=${fields.merchant_oid}`;
    await tx`UPDATE woya_orders SET payment=payment || ${tx.json(summary)}::jsonb,status=${status},version=version+1,
      history=history || ${tx.json([{ status: `PayTR: ${testMode ? "test / " : ""}${state}`, at: new Date().toISOString() }])}::jsonb WHERE id=${row.order_id}`;
    if (state === "paid" && !testMode) {
      await enqueueOrderEmail(
        tx,
        row.order_id,
        `paid:${row.order_id}:customer`,
        "Ödemeniz alındı",
        `Sipariş tutarı: ${(row.amount / 100).toFixed(2)} TL. Tahsil edilen toplam: ${(receivedAmount / 100).toFixed(2)} TL.`,
      );
      await enqueueOrderEmail(
        tx,
        row.order_id,
        `paid:${row.order_id}:merchant`,
        "Yeni ödenmiş sipariş",
        "Ödeme PayTR bildirimiyle doğrulandı.",
        true,
      );
    }
    if (state === "paid" && !testMode && order.customer_id) {
      const [cart] =
        await tx`SELECT items FROM woya_customer_carts WHERE customer_id=${order.customer_id} FOR UPDATE`;
      if (cart)
        await tx`UPDATE woya_customer_carts SET items=${tx.json(subtractPurchase(cart.items as AccountCartItem[], order.items))},version=version+1,updated_at=now() WHERE customer_id=${order.customer_id}`;
    }
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES('paytr',${`payment:${state}`},${row.order_id})`;
  });
}
