import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeItems } from "../lib/customer/cart";
import {
  addressSchema,
  billingSchema,
  emailSchema,
  passwordSchema,
  requestTransitions,
  orderTransitions,
} from "../lib/customer/schema";
import { defaultDimensions, initialPricing } from "../lib/pricing";
import type { AccountCartItem } from "../lib/customer/schema";
const item: AccountCartItem = {
  slug: "test",
  title: "Test",
  image: "/images/test.webp",
  quantity: 2,
  configuration: {
    source: "product",
    pricingMode: "standard",
    dimensions: defaultDimensions(initialPricing, "rectangle"),
  },
};
test("deterministic cart merge preserves selections and caps quantities", () => {
  const different = {
    ...item,
    configuration: { ...item.configuration!, pricingMode: "custom" as const },
  };
  const a = mergeItems([item, different], [{ ...item, quantity: 98 }]);
  const b = mergeItems([different, item], [{ ...item, quantity: 98 }]);
  assert.deepEqual(a, b);
  assert.equal(a.length, 2);
  assert.ok(a.some((i) => i.quantity === 99));
  assert.deepEqual(
    a.find((i) => i.configuration?.pricingMode === "custom")?.configuration,
    different.configuration,
  );
});
test("password policy avoids bcrypt truncation and normalizes email", () => {
  assert.equal(passwordSchema.safeParse("short").success, false);
  assert.equal(passwordSchema.safeParse("😀".repeat(20)).success, false);
  assert.equal(
    passwordSchema.safeParse("a long passphrase 2026").success,
    true,
  );
  assert.equal(emailSchema.parse("TEST@EXAMPLE.TEST"), "test@example.test");
});
test("address validation limits unnecessary identity data", () => {
  assert.equal(
    addressSchema.safeParse({
      label: "Ev",
      name: "Test Müşteri",
      phone: "1",
      address: "Kısa",
    }).success,
    false,
  );
  assert.equal(
    billingSchema.safeParse({
      name: "Test Müşteri",
      address: "Test Mahallesi Sokak No 1 İstanbul",
      nationalId: "123",
    }).success,
    false,
  );
});
test("closed requests and cancelled orders cannot be reopened", () => {
  assert.deepEqual(requestTransitions.closed, []);
  assert.deepEqual(requestTransitions.rejected, []);
  assert.deepEqual(orderTransitions.iptal, []);
  assert.ok(!orderTransitions.kargoda.includes("iptal"));
});

test("Account cart merging preserves Roman and normal numerals separately", () => {
  const roman: AccountCartItem = {
    ...item,
    configuration: { ...item.configuration!, numeral: "romen" },
  };
  const normal: AccountCartItem = {
    ...item,
    configuration: { ...item.configuration!, numeral: "normal" },
  };
  const merged = mergeItems([roman], [normal, roman]);
  assert.equal(merged.length, 2);
  assert.equal(
    merged.find((i) => i.configuration?.numeral === "romen")?.quantity,
    4,
  );
  assert.equal(
    merged.find((i) => i.configuration?.numeral === "normal")?.quantity,
    2,
  );
});
