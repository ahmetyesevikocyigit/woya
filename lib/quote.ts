import {
  calculateSelectionPrice,
  clockShapeFor,
  configurationSchema,
  measurementOptions,
  type PricingSettings,
  type ClockShape,
  type MeasuredType,
} from "./pricing";
import { builderCatalog } from "./builder-catalog";

export type QuoteProduct = {
  builderParts?: import("./builder-catalog").BuilderAssets;
  shippingIncluded?: boolean;
  slug: string;
  code: string;
  title: string;
  productType?: "set" | "tablo" | "saat" | "rehber";
  clockShape?: ClockShape;
  stock?: number | null;
  price?: number | null;
  salePrice?: number | null;
};
export type PriceQuote = {
  shippingIncluded?: boolean;
  price: number | null;
  error: string | null;
  options: string[];
};
export function quoteItem(
  item: { slug: string; configuration?: unknown; quantity: number },
  products: QuoteProduct[],
  settings: PricingSettings,
): PriceQuote {
  const fail = (error: string): PriceQuote => ({
    price: null,
    error,
    options: [],
  });
  if (
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 99
  )
    return fail("Geçerli bir adet seçin.");
  const parsed = configurationSchema.safeParse(item.configuration);
  if (!parsed.success) return fail("Ürünün ölçüsünü yeniden seçin.");
  const c = parsed.data;
  let kind: MeasuredType;
  let shape: ClockShape;
  let extra: string[] = [];
  let shippingIncluded = false;
  let standardPrice: { price?: number | null; salePrice?: number | null };
  if (c.source === "product") {
    const product = products.find((p) => p.slug === item.slug);
    if (!product || !product.productType || product.productType === "rehber")
      return fail("Ürün satışa açık değil.");
    kind = product.productType;
    shape = clockShapeFor(product);
    standardPrice = product;
    shippingIncluded = product.shippingIncluded === true;
  } else {
    const { clocks, tables } = builderCatalog(products);
    if (item.slug !== "ozel-set" && item.slug !== "ozel-saat")
      return fail("Tasarım geçersiz.");
    if (item.slug !== (c.kind === "set" ? "ozel-set" : "ozel-saat"))
      return fail("Tasarım tipi geçersiz.");
    const clock = products.find(
      (p) =>
        p.code === c.clock &&
        (p.productType === "set" || p.productType === "saat") &&
        clocks.some((s) => s.code === p.code),
    );
    if (!clock) return fail("Seçilen saat artık satışa açık değil.");
    if (
      clock.builderParts ? c.numeral !== "original" : c.numeral === "original"
    )
      return fail("Saat kadranını yeniden seçin.");
    shippingIncluded = clock.shippingIncluded === true;
    kind = c.kind;
    shape = clockShapeFor(clock);
    standardPrice = {
      price:
        kind === "set" ? settings.builderSetPrice : settings.builderClockPrice,
    };
    extra = [
      `Saat modeli: ${clock.title}`,
      `Rakam: ${{ romen: "Romen", normal: "Normal", minimal: "Minimal", original: "Fotoğraftaki kadran" }[c.numeral]}`,
    ];
    if (kind === "set") {
      const left = products.find(
        (p) =>
          p.code === c.left &&
          p.productType === "set" &&
          tables.some((s) => s.code === p.code),
      );
      const right = products.find(
        (p) =>
          p.code === c.right &&
          p.productType === "set" &&
          tables.some((s) => s.code === p.code),
      );
      if (!left || !right)
        return fail("Seçilen tablo artık satışa açık değil.");
      shippingIncluded =
        shippingIncluded &&
        left.shippingIncluded === true &&
        right.shippingIncluded === true;
      extra.push(`Sol tablo: ${left.title}`, `Sağ tablo: ${right.title}`);
    }
  }
  const result = calculateSelectionPrice(
    kind,
    c.dimensions,
    shape,
    settings,
    standardPrice,
    c.pricingMode,
  );
  return {
    price: result.price,
    error: result.error,
    shippingIncluded,
    options: [
      ...extra,
      ...(shippingIncluded ? ["Kargo dahil"] : []),
      ...(result.panelArea !== undefined ? ["Özel ölçü"] : []),
      ...measurementOptions(kind, c.dimensions, shape),
    ],
  };
}
