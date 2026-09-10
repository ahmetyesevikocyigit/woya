import { z } from "zod";
import {
  sizePriceRowsSchema,
  validateSizeRows,
  findSizePrice,
  type PricedSelection,
} from "./size-pricing";

const cm = z
  .number()
  .min(1)
  .max(500)
  .refine(
    (v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-7,
    "En fazla bir ondalık basamak girin.",
  );
export const rectangleSchema = z.object({ width: cm, height: cm }).strict();
export const dimensionsSchema = z
  .object({
    panel: rectangleSchema,
    clock: rectangleSchema,
  })
  .strict();
export type Dimensions = z.infer<typeof dimensionsSchema>;
export type ClockShape = "rectangle" | "circle";
export type MeasuredType = "tablo" | "saat" | "set";
const rate = z.number().min(0.01).max(10000000).multipleOf(0.01).nullable();
export const pricingSchema = z
  .object({
    panelRate: rate,
    clockRate: rate,
    builderSetPrice: rate.default(null),
    builderClockPrice: rate.default(null),
    builderSetPrices: sizePriceRowsSchema.optional(),
    builderClockPrices: sizePriceRowsSchema.optional(),
    minCm: cm,
    maxCm: cm,
    panelPresets: z.array(rectangleSchema).min(1).max(12),
    clockPresets: z.array(rectangleSchema).min(1).max(12),
    diameterPresets: z.array(cm).min(1).max(12),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.builderSetPrices)
      validateSizeRows(v.builderSetPrices, "set", ctx, ["builderSetPrices"]);
    if (v.builderClockPrices)
      validateSizeRows(v.builderClockPrices, "saat", ctx, [
        "builderClockPrices",
      ]);
    if (v.minCm > v.maxCm)
      ctx.addIssue({
        code: "custom",
        path: ["maxCm"],
        message: "Üst sınır alt sınırdan küçük olamaz.",
      });
    for (const key of [
      "panelPresets",
      "clockPresets",
      "diameterPresets",
    ] as const) {
      const seen = new Set<string>();
      v[key].forEach((p, i) => {
        const values = typeof p === "number" ? [p] : [p.width, p.height];
        const id = values.join("x");
        if (seen.has(id))
          ctx.addIssue({
            code: "custom",
            path: [key, i],
            message: "Aynı ölçü birden fazla eklenemez.",
          });
        seen.add(id);
        if (values.some((n) => n < v.minCm || n > v.maxCm))
          ctx.addIssue({
            code: "custom",
            path: [key, i],
            message: "Hazır ölçü izin verilen aralıkta olmalı.",
          });
      });
    }
  });
export type PricingSettings = z.infer<typeof pricingSchema>;
export const initialPricing: PricingSettings = {
  panelRate: null,
  clockRate: null,
  builderSetPrice: null,
  builderClockPrice: null,
  minCm: 10,
  maxCm: 200,
  panelPresets: [
    { width: 50, height: 70 },
    { width: 40, height: 60 },
    { width: 60, height: 90 },
  ],
  clockPresets: [
    { width: 60, height: 60 },
    { width: 50, height: 50 },
    { width: 70, height: 70 },
    { width: 80, height: 80 },
    { width: 90, height: 90 },
  ],
  diameterPresets: [60, 50, 70, 80, 90],
};
export function defaultDimensions(
  settings: PricingSettings,
  shape: ClockShape,
): Dimensions {
  return {
    panel: { ...settings.panelPresets[0] },
    clock:
      shape === "circle"
        ? {
            width: settings.diameterPresets[0],
            height: settings.diameterPresets[0],
          }
        : { ...settings.clockPresets[0] },
  };
}
export function clockShapeFor(product: {
  clockShape?: ClockShape;
  title: string;
}): ClockShape {
  return (
    product.clockShape ??
    (product.title.toLocaleLowerCase("tr-TR").includes("yuvarlak")
      ? "circle"
      : "rectangle")
  );
}
export function dimensionLabel(size: Dimensions["panel"], circle = false) {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height))
    return "Ölçü girin";
  return circle
    ? `${size.width.toLocaleString("tr-TR")} cm çap`
    : `${size.width.toLocaleString("tr-TR")} × ${size.height.toLocaleString("tr-TR")} cm`;
}
export type Measurement = { dimensions: Dimensions; kind: MeasuredType };
const pricingModeSchema = z.enum(["standard", "custom"]);
export type PricingMode = z.infer<typeof pricingModeSchema>;
export type MeasurementModes = { panel: PricingMode; clock: PricingMode };
export const configurationSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("product"),
      dimensions: dimensionsSchema,
      pricingMode: pricingModeSchema.optional(),
    })
    .strict(),
  z
    .object({
      source: z.literal("builder"),
      kind: z.enum(["set", "saat"]),
      dimensions: dimensionsSchema,
      pricingMode: pricingModeSchema.optional(),
      left: z.string().max(20).optional(),
      right: z.string().max(20).optional(),
      clock: z.string().min(1).max(20),
      numeral: z.enum(["romen", "normal", "minimal", "original"]),
    })
    .strict(),
]);
export type Configuration = z.infer<typeof configurationSchema>;
export function isStandardSize(
  kind: MeasuredType,
  dimensions: Dimensions,
  shape: ClockShape,
  settings: PricingSettings,
) {
  const matches = (sizes: Dimensions["panel"][], size: Dimensions["panel"]) =>
    sizes.some((s) => s.width === size.width && s.height === size.height);
  return (
    (kind === "saat" || matches(settings.panelPresets, dimensions.panel)) &&
    (kind === "tablo" ||
      (shape === "circle"
        ? dimensions.clock.width === dimensions.clock.height &&
          settings.diameterPresets.includes(dimensions.clock.width)
        : matches(settings.clockPresets, dimensions.clock)))
  );
}

export function selectedPricingMode(
  kind: MeasuredType,
  modes: MeasurementModes,
): PricingMode {
  return (kind !== "saat" && modes.panel === "custom") ||
    (kind !== "tablo" && modes.clock === "custom")
    ? "custom"
    : "standard";
}

export function calculateSelectionPrice(
  kind: MeasuredType,
  dimensions: Dimensions,
  shape: ClockShape,
  settings: PricingSettings,
  product: PricedSelection,
  mode?: PricingMode,
):
  | ReturnType<typeof calculatePrice>
  | {
      price: number;
      error: null;
      panelArea?: undefined;
      clockArea?: undefined;
      panelPrice?: undefined;
      clockPrice?: undefined;
    } {
  if (!dimensionsSchema.safeParse(dimensions).success)
    return { price: null, error: "Geçerli bir ölçü girin (cm)." };
  const standard = isStandardSize(kind, dimensions, shape, settings);
  if (product.measurementPricing) {
    if (standard) {
      const row = findSizePrice(
        product.measurementPricing.rows,
        kind,
        shape,
        dimensions,
      );
      const price = row?.salePrice ?? row?.price;
      return typeof price === "number" && price > 0
        ? { price, error: null }
        : {
            price: null,
            error: "Bu ölçü seçimi için fiyat henüz tanımlanmadı.",
          };
    }
    if (mode === "standard")
      return {
        price: null,
        error: "Hazır ölçüyü yeniden seçin veya özel ölçü kullanın.",
      };
    return calculatePrice(kind, dimensions, shape, {
      ...settings,
      panelRate: product.measurementPricing.panelRate,
      clockRate: product.measurementPricing.clockRate,
    });
  }

  // Old carts have no mode: infer from the current presets, never trust a standard flag for arbitrary dimensions.
  if (mode === "custom" || (mode === undefined && !standard))
    return calculatePrice(kind, dimensions, shape, settings);
  if (!standard)
    return {
      price: null,
      error: "Hazır ölçüyü yeniden seçin veya özel ölçü kullanın.",
    };
  const price = product.salePrice ?? product.price;
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? { price, error: null }
    : { price: null, error: "Bu ürün için fiyat henüz tanımlanmadı." };
}
export function measurementOptions(
  kind: MeasuredType,
  dimensions: Dimensions,
  shape: ClockShape,
) {
  return [
    ...(kind !== "saat"
      ? [
          `${kind === "set" ? "İki tablo (her biri)" : "Tablo"}: ${dimensionLabel(dimensions.panel)}`,
        ]
      : []),
    ...(kind !== "tablo"
      ? [`Saat: ${dimensionLabel(dimensions.clock, shape === "circle")}`]
      : []),
  ];
}
export function calculatePrice(
  kind: MeasuredType,
  dimensions: Dimensions,
  shape: ClockShape,
  settings: PricingSettings,
) {
  const parsed = dimensionsSchema.safeParse(dimensions);
  if (!parsed.success)
    return { price: null, error: "Geçerli bir ölçü girin (cm)." };
  const sizes = [
    ...(kind !== "saat" ? [dimensions.panel] : []),
    ...(kind !== "tablo" ? [dimensions.clock] : []),
  ];
  if (
    sizes.some((s) =>
      [s.width, s.height].some((n) => n < settings.minCm || n > settings.maxCm),
    )
  )
    return {
      price: null,
      error: `Ölçü ${settings.minCm}–${settings.maxCm} cm arasında olmalı.`,
    };
  if (
    kind !== "tablo" &&
    shape === "circle" &&
    dimensions.clock.width !== dimensions.clock.height
  )
    return { price: null, error: "Yuvarlak saat için tek çap girin." };
  const panelArea =
    kind === "saat"
      ? 0
      : ((dimensions.panel.width * dimensions.panel.height) / 10000) *
        (kind === "set" ? 2 : 1);
  const clockArea =
    kind === "tablo"
      ? 0
      : shape === "circle"
        ? Math.PI * (dimensions.clock.width / 200) ** 2
        : (dimensions.clock.width * dimensions.clock.height) / 10000;
  if (
    (panelArea && settings.panelRate === null) ||
    (clockArea && settings.clockRate === null)
  )
    return { price: null, error: "Bu ürün için fiyat henüz tanımlanmadı." };
  // Round each priced component to kurus before adding the set total.
  const panelPrice =
    Math.round(panelArea * (settings.panelRate ?? 0) * 100) / 100;
  const clockPrice =
    Math.round(clockArea * (settings.clockRate ?? 0) * 100) / 100;
  return {
    price: Math.round((panelPrice + clockPrice) * 100) / 100,
    error: null,
    panelArea,
    clockArea,
    panelPrice,
    clockPrice,
  };
}
