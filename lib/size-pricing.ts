import { z } from "zod";
import type {
  Dimensions,
  ClockShape,
  MeasuredType,
  PricingSettings,
} from "./pricing";

const money = z.number().min(0.01).max(10000000).multipleOf(0.01).nullable();
const size = z
  .object({
    width: z.number().min(1).max(500).multipleOf(0.1),
    height: z.number().min(1).max(500).multipleOf(0.1),
  })
  .strict();
export const sizePriceRowSchema = z
  .object({
    dimensions: z.object({ panel: size, clock: size }).strict(),
    clockShape: z.enum(["rectangle", "circle"]),
    price: money,
    salePrice: money,
  })
  .strict()
  .refine(
    (v) => v.salePrice === null || (v.price !== null && v.salePrice < v.price),
    {
      message: "İndirimli fiyat normal fiyattan düşük olmalı.",
      path: ["salePrice"],
    },
  );
export const sizePriceRowsSchema = z.array(sizePriceRowSchema).max(288);
export const measurementPricingSchema = z
  .object({
    rows: sizePriceRowsSchema,
    panelRate: money,
    clockRate: money,
  })
  .strict();
export type SizePriceRow = z.infer<typeof sizePriceRowSchema>;
export type MeasurementPricing = z.infer<typeof measurementPricingSchema>;
export type PricedSelection = {
  price?: number | null;
  salePrice?: number | null;
  measurementPricing?: MeasurementPricing;
};
export function sizeKey(kind: MeasuredType, shape: ClockShape, d: Dimensions) {
  return [
    kind,
    ...(kind !== "saat" ? [d.panel.width, d.panel.height] : []),
    ...(kind !== "tablo" ? [shape, d.clock.width, d.clock.height] : []),
  ].join(":");
}
export function selectionRows(
  kind: MeasuredType,
  shape: ClockShape,
  s: PricingSettings,
  price: number | null = null,
  salePrice: number | null = null,
): SizePriceRow[] {
  const panels = kind === "saat" ? [s.panelPresets[0]] : s.panelPresets;
  const clocks =
    kind === "tablo"
      ? [s.clockPresets[0]]
      : shape === "circle"
        ? s.diameterPresets.map((d) => ({ width: d, height: d }))
        : s.clockPresets;
  return panels.flatMap((panel) =>
    clocks.map((clock) => ({
      dimensions: { panel: { ...panel }, clock: { ...clock } },
      clockShape: shape,
      price,
      salePrice,
    })),
  );
}
export function findSizePrice(
  rows: SizePriceRow[],
  kind: MeasuredType,
  shape: ClockShape,
  d: Dimensions,
) {
  const key = sizeKey(kind, shape, d);
  return rows.find(
    (row) => sizeKey(kind, row.clockShape, row.dimensions) === key,
  );
}
export function validateSizeRows(
  rows: SizePriceRow[],
  kind: MeasuredType,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const key = sizeKey(kind, row.clockShape, row.dimensions);
    if (seen.has(key))
      ctx.addIssue({
        code: "custom",
        path: [...path, i],
        message: "Aynı ölçü birden fazla fiyatlandırılamaz.",
      });
    seen.add(key);
    if (
      kind !== "tablo" &&
      row.clockShape === "circle" &&
      row.dimensions.clock.width !== row.dimensions.clock.height
    )
      ctx.addIssue({
        code: "custom",
        path: [...path, i],
        message: "Yuvarlak saat için tek çap girin.",
      });
  });
}
export function builderPriceConfig(
  kind: "set" | "saat",
  s: PricingSettings,
): PricedSelection {
  const rows = kind === "set" ? s.builderSetPrices : s.builderClockPrices;
  return {
    price: kind === "set" ? s.builderSetPrice : s.builderClockPrice,
    ...(rows
      ? {
          measurementPricing: {
            rows,
            panelRate: s.panelRate,
            clockRate: s.clockRate,
          },
        }
      : {}),
  };
}
export function listedPrice(
  kind: MeasuredType,
  shape: ClockShape,
  s: PricingSettings,
  p: PricedSelection,
) {
  const valid = selectionRows(kind, shape, s)
    .map((row) =>
      p.measurementPricing
        ? findSizePrice(p.measurementPricing.rows, kind, shape, row.dimensions)
        : p,
    )
    .filter(
      (row): row is PricedSelection =>
        !!row && typeof row.price === "number" && row.price > 0,
    );
  const amounts = valid.map((row) => row.salePrice ?? row.price!);
  const min = amounts.length ? Math.min(...amounts) : null;
  return { price: min, varies: min !== null && amounts.some((v) => v !== min) };
}

export function initialSelectionDimensions(
  kind: MeasuredType,
  shape: ClockShape,
  s: PricingSettings,
  p: PricedSelection,
) {
  const choices = selectionRows(kind, shape, s);
  return (
    p.measurementPricing
      ? (choices.find((row) => {
          const priced = findSizePrice(
            p.measurementPricing!.rows,
            kind,
            shape,
            row.dimensions,
          );
          return priced?.price !== null && priced?.price !== undefined;
        }) ?? choices[0])
      : choices[0]
  ).dimensions;
}
export function canonicalProductPrice(
  kind: MeasuredType,
  shape: ClockShape,
  s: PricingSettings,
  p: PricedSelection,
) {
  const dimensions = initialSelectionDimensions(kind, shape, s, p);
  const row = p.measurementPricing
    ? findSizePrice(p.measurementPricing.rows, kind, shape, dimensions)
    : p;
  return { price: row?.price ?? null, salePrice: row?.salePrice ?? null };
}
