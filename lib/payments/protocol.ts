import { createHmac, timingSafeEqual } from "node:crypto";

export type Merchant = { id: string; key: string; salt: string };
// PayTR issues opaque URL-safe tokens, including hyphens. Keep them to one bounded path segment.
export function isPaytrIframeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(value);
}
export function tokenSignature(
  fields: Record<string, string>,
  merchant: Merchant,
) {
  const keys = [
    "merchant_id",
    "user_ip",
    "merchant_oid",
    "email",
    "payment_amount",
    "user_basket",
    "no_installment",
    "max_installment",
    "currency",
    "test_mode",
  ];
  return createHmac("sha256", merchant.key)
    .update(keys.map((key) => fields[key]).join("") + merchant.salt)
    .digest("base64");
}
export function verifyCallback(
  fields: {
    merchant_oid: string;
    status: string;
    total_amount: string;
    hash: string;
  },
  merchant: Merchant,
) {
  const expected = createHmac("sha256", merchant.key)
    .update(
      fields.merchant_oid + merchant.salt + fields.status + fields.total_amount,
    )
    .digest("base64");
  const received = Buffer.from(fields.hash);
  return (
    received.length === expected.length &&
    timingSafeEqual(received, Buffer.from(expected))
  );
}
export function toKurus(price: number) {
  const amount = Math.round(price * 100);
  if (
    !Number.isFinite(price) ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 100_000_000
  )
    throw new Error("INVALID_PAYMENT_AMOUNT");
  return amount;
}
