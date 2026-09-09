import { z } from "zod";
import { configurationSchema } from "../pricing";
export const emailSchema = z
  .email()
  .max(100)
  .regex(/^[\x21-\x7e]+$/)
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, "En az 12 karakter kullanın.")
  .max(64)
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Şifre en fazla 72 bayt olabilir.",
  );
export const nameSchema = z.string().trim().min(1).max(29);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{10,20}$/)
  .refine((v) => {
    const n = v.replace(/\D/g, "").length;
    return n >= 10 && n <= 15;
  });
export const profileSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    phone: z.union([phoneSchema, z.literal("")]),
  })
  .strict();
export const addressSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    name: z.string().trim().min(3).max(60),
    phone: phoneSchema,
    address: z.string().trim().min(15).max(400),
  })
  .strict();
export const billingSchema = z
  .object({
    type: z.enum(["individual", "company"]).default("individual"),
    companyName: z.string().trim().max(200).optional(),
    taxOffice: z.string().trim().max(100).optional(),
    taxNumber: z
      .string()
      .regex(/^\d{10,11}$/)
      .optional(),
    name: z.string().trim().min(3).max(60),
    address: z.string().trim().min(15).max(400),
  })
  .strict();
export const checkoutBillingSchema = billingSchema.superRefine((v, ctx) => {
  if (v.type === "company" && (!v.companyName || !v.taxOffice || !v.taxNumber))
    ctx.addIssue({
      code: "custom",
      message:
        "Kurumsal fatura için unvan, vergi dairesi ve vergi numarası gerekli.",
    });
});
export const cartItemsSchema = z
  .array(
    z
      .object({
        slug: z.string().min(1).max(220),
        title: z.string().max(200),
        image: z
          .string()
          .max(500)
          .refine(
            (v) =>
              /^\/(images|media)\//.test(v) ||
              /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/woya\//.test(
                v,
              ),
          ),
        description: z.string().max(500).optional(),
        options: z.array(z.string().max(250)).max(16).optional(),
        configuration: configurationSchema.optional(),
        quantity: z.number().int().min(1).max(99),
      })
      .strict(),
  )
  .max(50);
export type AccountCartItem = z.infer<typeof cartItemsSchema>[number];
export type Address = z.infer<typeof addressSchema> & {
  id: string;
  version: number;
  deliveryDefault: boolean;
  billingDefault: boolean;
};
export type Customer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
};
export const requestLabels = {
  open: "Başvuru alındı",
  reviewing: "İnceleniyor",
  approved: "Başvuru uygun bulundu",
  rejected: "Reddedildi",
  closed: "Kapatıldı",
};
export const kindLabels = {
  cancel: "İptal",
  return: "İade",
  support: "Destek",
};
export const requestTransitions: Record<string, string[]> = {
  open: ["reviewing", "rejected", "closed"],
  reviewing: ["approved", "rejected", "closed"],
  approved: ["closed"],
  rejected: [],
  closed: [],
};
export const orderTransitions: Record<string, string[]> = {
  yeni: ["gorusuluyor", "onaylandi", "iptal"],
  gorusuluyor: ["onaylandi", "iptal"],
  onaylandi: ["hazirlaniyor", "iptal"],
  hazirlaniyor: ["kargoda", "iptal"],
  kargoda: ["tamamlandi"],
  tamamlandi: [],
  iptal: [],
};
