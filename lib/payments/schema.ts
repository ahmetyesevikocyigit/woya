import { z } from "zod";
import { configurationSchema } from "../pricing";
import { checkoutBillingSchema } from "../customer/schema";

export const checkoutItemsSchema = z
  .array(
    z
      .object({
        slug: z.string().min(1).max(220),
        quantity: z.number().int().min(1).max(99),
        configuration: configurationSchema,
      })
      .strict(),
  )
  .min(1)
  .max(50);
export const customerSchema = z
  .object({
    name: z.string().trim().min(3, "Ad soyad girin.").max(60),
    email: z
      .email("Geçerli bir e-posta girin.")
      .max(100)
      .regex(/^[\x21-\x7e]+$/),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{10,20}$/, "Geçerli bir telefon girin.")
      .refine((value) => {
        const digits = value.replace(/\D/g, "").length;
        return digits >= 10 && digits <= 15;
      }, "Geçerli bir telefon girin."),
    address: z
      .string()
      .trim()
      .min(15, "İl, ilçe ve açık adresinizi girin.")
      .max(400),
  })
  .strict();
export const checkoutSchema = z
  .object({
    requestId: z.uuid(),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
    items: checkoutItemsSchema,
    customer: customerSchema,
    billing: checkoutBillingSchema.optional(),
    accountId: z.uuid().nullable().optional(),
    note: z.string().trim().max(1000),
    consent: z.literal(true),
  })
  .strict();
export type CheckoutItem = z.infer<typeof checkoutItemsSchema>[number];
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PaymentState =
  | "creating"
  | "ready"
  | "pending"
  | "paid"
  | "failed"
  | "review"
  | "token_failed";
export type PaymentSummary = {
  provider: "paytr";
  state: PaymentState;
  merchantOid: string;
  amount: number;
  shipping: number;
  testMode: boolean;
  receivedAmount?: number;
  paidAt?: string;
};
export type CheckoutQuote = {
  items: (CheckoutItem & {
    title: string;
    unitPrice: number;
    options: string[];
  })[];
  subtotal: number;
  shipping: number;
  total: number;
  hash: string;
  store: import("../commerce/schema").StoreSettings;
};
export const paymentLabels: Record<PaymentState, string> = {
  creating: "Ödeme hazırlanıyor",
  ready: "Ödeme bekleniyor",
  pending: "PayTR yanıtı bekleniyor",
  paid: "Ödendi",
  failed: "Ödeme başarısız",
  review: "Ödeme kontrol edilmeli",
  token_failed: "Ödeme başlatılamadı",
};
