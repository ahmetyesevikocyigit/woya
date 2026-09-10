import { productSchema, type ProductInput } from "./admin/schema";
import { clockShapeFor, pricingSchema, type PricingSettings } from "./pricing";
import { selectionRows } from "./size-pricing";
export function upgradeProductPricing(
  product: ProductInput,
  settings: PricingSettings,
): ProductInput {
  if (product.type === "rehber" || product.measurementPricing) return product;
  return productSchema.parse({
    ...product,
    measurementPricing: {
      rows: selectionRows(
        product.type,
        clockShapeFor(product),
        settings,
        product.price,
        product.salePrice,
      ),
      panelRate: settings.panelRate,
      clockRate: settings.clockRate,
    },
  });
}
export function upgradeBuilderPricing(
  s: PricingSettings,
  startingPrice: number,
): PricingSettings {
  return pricingSchema.parse({
    ...s,
    builderSetPrice: s.builderSetPrice ?? startingPrice,
    builderClockPrice: s.builderClockPrice ?? startingPrice,
    builderSetPrices: s.builderSetPrices ?? [
      ...selectionRows(
        "set",
        "rectangle",
        s,
        s.builderSetPrice ?? startingPrice,
      ),
      ...selectionRows("set", "circle", s, s.builderSetPrice ?? startingPrice),
    ],
    builderClockPrices: s.builderClockPrices ?? [
      ...selectionRows(
        "saat",
        "rectangle",
        s,
        s.builderClockPrice ?? startingPrice,
      ),
      ...selectionRows(
        "saat",
        "circle",
        s,
        s.builderClockPrice ?? startingPrice,
      ),
    ],
  });
}
