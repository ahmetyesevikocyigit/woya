import { isPaytrIframeToken } from "../lib/payments/protocol";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  toKurus,
  tokenSignature,
  verifyCallback,
} from "../lib/payments/protocol";
import { checkoutSchema } from "../lib/payments/schema";
import { subtractPurchase } from "../lib/payments/cart";
import { defaultDimensions, initialPricing } from "../lib/pricing";

const merchant = { id: "100001", key: "unit-test-key", salt: "unit-test-salt" };
test("PayTR token uses the documented field order and UTF-8 basket", () => {
  const fields = {
    merchant_id: merchant.id,
    user_ip: "203.0.113.10",
    merchant_oid: "WOYA123",
    email: "a@example.test",
    payment_amount: "12345",
    user_basket: Buffer.from(JSON.stringify([["Çiçek", "123.45", 1]])).toString(
      "base64",
    ),
    no_installment: "1",
    max_installment: "0",
    currency: "TL",
    test_mode: "1",
  };
  const expected = createHmac("sha256", merchant.key)
    .update(
      `${merchant.id}203.0.113.10WOYA123a@example.test12345${fields.user_basket}10TL1${merchant.salt}`,
    )
    .digest("base64");
  assert.equal(tokenSignature(fields, merchant), expected);
  assert.notEqual(
    tokenSignature({ ...fields, payment_amount: "1" }, merchant),
    expected,
  );
});
test("Callback rejects forged hash, amount, status and order", () => {
  const fields = {
    merchant_oid: "WOYA123",
    status: "success",
    total_amount: "12345",
    hash: createHmac("sha256", merchant.key)
      .update(`WOYA123${merchant.salt}success12345`)
      .digest("base64"),
  };
  assert.equal(verifyCallback(fields, merchant), true);
  for (const changed of [
    { hash: "x" },
    { hash: "" },
    { status: "failed" },
    { merchant_oid: "WOYA124" },
    { total_amount: "1" },
  ])
    assert.equal(verifyCallback({ ...fields, ...changed }, merchant), false);
});
test("Kurus calculations reject invalid and excessive amounts", () => {
  assert.equal(toKurus(123.45), 12345);
  assert.equal(toKurus(19.99), 1999);
  for (const value of [0, -1, NaN, Infinity, 1000001])
    assert.throws(() => toKurus(value));
});
const item = {
  slug: "test-set",
  quantity: 2,
  configuration: {
    source: "product" as const,
    pricingMode: "standard" as const,
    dimensions: defaultDimensions(initialPricing, "rectangle"),
  },
};
test("Checkout requires consent, validated customer and explicit configuration", () => {
  const valid = {
    requestId: "00000000-0000-4000-8000-000000000001",
    quoteHash: "a".repeat(64),
    items: [item],
    customer: {
      name: "Test Müşteri",
      email: "test@example.test",
      phone: "05551234567",
      address: "İstanbul, Test Mahallesi, Test Sokak No 1",
    },
    note: "",
    consent: true,
  };
  assert.equal(checkoutSchema.safeParse(valid).success, true);
  for (const changed of [
    { consent: false },
    { amount: 1 },
    { items: [] },
    { items: [{ slug: "test-set", quantity: 1 }] },
    { customer: { ...valid.customer, email: "bad" } },
  ])
    assert.equal(
      checkoutSchema.safeParse({ ...valid, ...changed }).success,
      false,
    );
});
test("Receipt removes only purchased quantities and preserves other configurations", () => {
  const other = {
    ...item,
    configuration: { ...item.configuration, pricingMode: "custom" as const },
  };
  assert.deepEqual(
    subtractPurchase(
      [
        { ...item, quantity: 3 },
        other,
        { ...item, slug: "other", quantity: 1 },
      ],
      [item],
    ),
    [{ ...item, quantity: 1 }, other, { ...item, slug: "other", quantity: 1 }],
  );
  assert.deepEqual(subtractPurchase([item], [item]), []);
});

test("PayTR URL-safe iframe tokens accept hyphens and reject unsafe path segments", () => {
  assert.equal(isPaytrIframeToken("test-" + "a".repeat(69)), true);
  assert.equal(isPaytrIframeToken("test_" + "b".repeat(69)), true);
  assert.equal(isPaytrIframeToken("a".repeat(64)), true);
  for (const value of [
    null,
    42,
    "short",
    "a".repeat(257),
    "../" + "a".repeat(64),
    "https://evil.test/" + "a".repeat(64),
    "a".repeat(20) + "?x=1",
    "a".repeat(20) + "#fragment",
    "a".repeat(20) + "\n",
  ]) {
    assert.equal(isPaytrIframeToken(value), false);
  }
});
