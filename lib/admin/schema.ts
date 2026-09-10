import { z } from "zod";
import { cropRegionsSchema } from "../crop";
import { measurementPricingSchema, validateSizeRows } from "../size-pricing";
z.config(z.locales.tr());

export const slugSchema = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Küçük harf, rakam ve tire kullanın.");
export const safeLink = z
  .string()
  .max(500)
  .refine(
    (v) => /^\/(?!\/)[^\s\\]*$/.test(v) || /^https:\/\/[^\s\\]+$/.test(v),
    "Site içi yol veya HTTPS bağlantısı girin.",
  );
export const imageUrl = z
  .string()
  .max(600)
  .refine(
    (v) =>
      (/^\/images\/[a-zA-Z0-9_./-]+\.(webp|png|jpe?g|avif)$/.test(v) &&
        !v.includes("..")) ||
      /^\/media\/[a-f0-9-]{36}\.webp$/.test(v) ||
      /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/woya\/[a-zA-Z0-9_-]+\.webp$/.test(
        v,
      ),
    "Kütüphaneden görsel seçin veya yükleyin.",
  );
export const imageSchema = z.object({
  url: imageUrl,
  alt: z.string().max(200),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});
export const builderPartsSchema = z
  .object({
    enabled: z.boolean(),
    source: imageUrl,
    regions: cropRegionsSchema,
    left: imageUrl.optional(),
    center: imageUrl,
    right: imageUrl.optional(),
  })
  .refine(
    (v) =>
      Boolean(v.left) === Boolean(v.right) &&
      Boolean(v.left) === Boolean(v.regions.left),
    "Parçalar eksik.",
  );
export type BuilderParts = z.infer<typeof builderPartsSchema>;
export const productSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Ürün adı en az 3 karakter olmalı.")
      .max(180),
    slug: slugSchema,
    categoryId: slugSchema,
    description: z
      .string()
      .trim()
      .min(10, "Açıklama en az 10 karakter olmalı.")
      .max(10000),
    price: z.number().min(0.01).max(10000000).nullable(),
    salePrice: z.number().min(0.01).max(10000000).nullable(),
    stock: z.number().int().min(0).max(1000000).nullable(),
    type: z.enum(["set", "saat", "tablo", "rehber"]),
    clockShape: z.enum(["rectangle", "circle"]).optional(),
    active: z.boolean().default(true),
    shippingIncluded: z.boolean().default(false),
    measurementPricing: measurementPricingSchema.optional(),
    featured: z.boolean(),
    images: z.array(imageSchema).min(1).max(12),
    builderParts: builderPartsSchema.optional(),
  })
  .refine(
    (v) =>
      !v.builderParts?.enabled ||
      (v.type === "set"
        ? Boolean(v.builderParts.left && v.builderParts.right)
        : v.type === "saat"),
    {
      message:
        "Kendin Oluştur için setin üç parçası veya saat görseli gerekir.",
      path: ["builderParts"],
    },
  )
  .refine(
    (v) => v.salePrice === null || (v.price !== null && v.salePrice < v.price),
    {
      message: "İndirimli fiyat normal fiyattan düşük olmalı.",
      path: ["salePrice"],
    },
  );
// Legacy records can still be read with a missing price; every admin save must supply one.
export const productSaveSchema = productSchema
  .superRefine((v, ctx) => {
    if (v.measurementPricing && v.type !== "rehber")
      validateSizeRows(v.measurementPricing.rows, v.type, ctx, [
        "measurementPricing",
        "rows",
      ]);
  })
  .refine((value) => value.type === "rehber" || value.price !== null, {
    message: "Ürün fiyatı zorunludur.",
    path: ["price"],
  })
  .transform((value) => ({ ...value, active: true }));
export type ProductInput = z.infer<typeof productSchema>;
export type ProductRecord = ProductInput & {
  id: string;
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export const categorySchema = z.object({
  id: slugSchema,
  title: z.string().trim().min(2).max(80),
  description: z.string().max(600),
  active: z.boolean(),
  position: z.number().int().min(0).max(999),
  surfaces: z.array(z.enum(["saatler", "tablolar", "koleksiyon"])).max(3),
});
export type Category = z.infer<typeof categorySchema> & { version: number };
export const contentSchema = z.object({
  heroTitle: z.string().trim().min(2).max(100),
  heroText: z.string().max(500),
  heroButton: z.string().min(2).max(60),
  heroHref: safeLink,
  heroImages: z.array(imageSchema).min(1).max(8),
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{9,14}$/, "Telefonu +90532... biçiminde girin."),
  phoneDisplay: z.string().min(7).max(40),
  instagram: z.string().url().startsWith("https://www.instagram.com/"),
  address: z.string().max(600),
  email: z.union([z.email(), z.literal("")]),
  footerText: z.string().max(500),
  footerLinks: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        href: safeLink,
        group: z.enum(["Alışveriş", "Destek", "Yasal"]),
      }),
    )
    .max(30),
  faqs: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        question: z.string().min(3).max(300),
        answer: z.string().min(3).max(2000),
      }),
    )
    .max(30),
  favorites: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        text: z.string().max(300),
        image: imageUrl,
        alt: z.string().max(200),
        href: safeLink,
      }),
    )
    .max(3),
});
export type SiteContent = z.infer<typeof contentSchema>;
export const orderStatuses = [
  "yeni",
  "gorusuluyor",
  "onaylandi",
  "hazirlaniyor",
  "kargoda",
  "tamamlandi",
  "iptal",
] as const;
export const statusLabels: Record<(typeof orderStatuses)[number], string> = {
  yeni: "Yeni",
  gorusuluyor: "Görüşülüyor",
  onaylandi: "Onaylandı",
  hazirlaniyor: "Hazırlanıyor",
  kargoda: "Kargoda",
  tamamlandi: "Tamamlandı",
  iptal: "İptal",
};
export const inquirySchema = z.object({
  requestId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  phone: z.string().regex(/^\+?[0-9 ()-]{10,24}$/),
  email: z.union([z.email(), z.literal("")]),
  address: z.string().max(1000),
  note: z.string().max(2000),
  consent: z.literal(true),
  website: z.literal(""),
  items: z
    .array(
      z.object({
        slug: z.string().min(2).max(220),
        quantity: z.number().int().min(1).max(99),
        options: z.array(z.string().max(250)).max(16).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type OrderItem = {
  slug: string;
  title: string;
  quantity: number;
  unitPrice: number | null;
  options: string[];
};
export type Order = {
  legalSnapshot?: {
    version: string;
    acceptedAt: string;
    store: import("../commerce/schema").StoreSettings;
  } | null;
  billing?: {
    name: string;
    address: string;
    type?: string;
    companyName?: string;
    taxOffice?: string;
    taxNumber?: string;
  } | null;
  shipment?: { carrier: string; trackingNumber: string } | null;
  payment?: import("../payments/schema").PaymentSummary | null;
  id: string;
  reference: string;
  status: (typeof orderStatuses)[number];
  customer: { name: string; phone: string; email: string; address: string };
  items: OrderItem[];
  note: string;
  internalNote: string;
  createdAt: string;
  version: number;
  history: { status: string; at: string }[];
};
export const orderUpdateSchema = z.object({
  shipment: z
    .object({
      carrier: z.string().trim().max(80),
      trackingNumber: z
        .string()
        .trim()
        .max(100)
        .regex(/^[A-Za-z0-9 -]*$/),
    })
    .refine(
      (s) => Boolean(s.carrier) === Boolean(s.trackingNumber),
      "Kargo firması ve takip numarasını birlikte girin.",
    )
    .optional(),
  status: z.enum(orderStatuses),
  internalNote: z.string().max(5000),
  version: z.number().int().positive(),
});
export const versionSchema = z.number().int().positive();
