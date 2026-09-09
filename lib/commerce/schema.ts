import { z } from "zod";
const text = z.string().trim().max(500);
const email = z.union([z.email().max(100), z.literal("")]);
const money = z.number().int().min(0).max(100000000).nullable();
export const storeSettingsSchema = z
  .object({
    shippingFee: money.default(null),
    freeShippingThreshold: money.default(null),
    productionDays: z.number().int().min(0).max(365).nullable().default(null),
    deliveryDays: z.number().int().min(1).max(90).nullable().default(null),
    replyTo: email.default(""),
    notificationEmail: email.default(""),
    sellerName: text.default(""),
    sellerTaxOffice: text.default(""),
    sellerTaxNumber: z
      .union([z.string().regex(/^\d{10,11}$/), z.literal("")])
      .default(""),
    sellerAddress: text.default(""),
    sellerPhone: text.default(""),
    returnAddress: text.default(""),
    legalVersion: z.string().trim().max(100).default(""),
    termsText: z.string().trim().max(30000).default(""),
    informationText: z.string().trim().max(30000).default(""),
    privacyText: z.string().trim().max(30000).default(""),
  })
  .strict();
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export const emptyStoreSettings = storeSettingsSchema.parse({});
export function missingStoreSettings(s: StoreSettings) {
  return Object.entries(s)
    .filter(
      ([key, v]) => key !== "freeShippingThreshold" && (v === null || v === ""),
    )
    .map(([k]) => k);
}
export function configuredShipping(subtotal: number, s: StoreSettings) {
  if (s.shippingFee === null) return null;
  return s.freeShippingThreshold !== null && subtotal >= s.freeShippingThreshold
    ? 0
    : s.shippingFee;
}
export const refundSchema = z
  .object({
    orderId: z.uuid(),
    submissionId: z.uuid(),
    amount: z.number().int().positive().max(99999999999),
    providerReference: z.string().trim().min(3).max(100),
    reason: z.string().trim().min(3).max(1000),
    performedAt: z.iso.datetime(),
    confirmed: z.literal(true),
  })
  .strict();
