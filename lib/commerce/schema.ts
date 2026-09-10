import { z } from "zod";
const text = z.string().trim().max(500);
const email = z.union([z.email().max(100), z.literal("")]);
const money = z.number().int().min(0).max(100000000).nullable();
export const storeSettingsSchema = z
  .object({
    shippingFee: money.default(null),
    freeShippingThreshold: money.default(null),
    totalDeliveryDays: z
      .number()
      .int()
      .min(1)
      .max(455)
      .nullable()
      .default(null),
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
      ([key, v]) =>
        ![
          "freeShippingThreshold",
          "productionDays",
          "deliveryDays",
          "totalDeliveryDays",
        ].includes(key) &&
        (v === null || v === ""),
    )
    .map(([k]) => k)
    .concat(deliveryBusinessDays(s) === null ? ["totalDeliveryDays"] : []);
}
// Old settings and immutable order snapshots retain their separate durations.
export function deliveryBusinessDays(s: {
  totalDeliveryDays?: number | null;
  productionDays: number | null;
  deliveryDays: number | null;
}) {
  if (s.totalDeliveryDays != null) return s.totalDeliveryDays;
  return s.productionDays !== null && s.deliveryDays !== null
    ? s.productionDays + s.deliveryDays
    : null;
}
export function deliveryAnnouncement(
  s: Parameters<typeof deliveryBusinessDays>[0],
) {
  const days = deliveryBusinessDays(s);
  return days === null ? "Özenle hazırlanır" : `${days} iş gününde teslimat`;
}
export function configuredShipping(
  subtotal: number,
  s: StoreSettings,
  items?: ReadonlyArray<{ shippingIncluded?: boolean }>,
) {
  if (items?.length && items.every((item) => item.shippingIncluded === true))
    return 0;
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
