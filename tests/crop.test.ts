import { test } from "node:test";
import assert from "node:assert/strict";
import { cropRegionSchema, defaultRegions, type CropRegion } from "../lib/crop";
import { rectifyPixels } from "../lib/perspective-crop";
import { builderPartsSchema, productSchema } from "../lib/admin/schema";
import { initialProducts } from "../lib/admin/defaults";
import { builderCatalog } from "../lib/builder-catalog";
import { quoteItem } from "../lib/quote";
import { defaultDimensions, initialPricing } from "../lib/pricing";

const full: CropRegion = { quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], aspect: 1, mask: "rectangle" };
function gradient(width = 100, height = 100) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set([x, y, 50, 255], (y * width + x) * 4);
  return pixels;
}
test("Perspective crop preserves identity pixels and original source", () => {
  const source = gradient(); const before = source.slice();
  const result = rectifyPixels(source, 100, 100, full, 100);
  assert.deepEqual(result.pixels, source);
  assert.deepEqual(source, before);
});
test("Four skewed corners map to exact output corners with bilinear interior", () => {
  const region: CropRegion = { ...full, quad: [{ x: 0.15, y: 0.1 }, { x: 0.85, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.9 }] };
  const result = rectifyPixels(gradient(), 100, 100, region, 50);
  [0, 49, 2499, 2450].forEach((offset, i) => {
    assert.equal(result.pixels[offset * 4], Math.round(region.quad[i].x * 99));
    assert.equal(result.pixels[offset * 4 + 1], Math.round(region.quad[i].y * 99));
  });
  assert(result.pixels[(25 * 50 + 25) * 4] > 40);
  assert(result.pixels[(25 * 50 + 25) * 4] < 60);
});
test("Aspect ratios and circular alpha masks are applied without background fabrication", () => {
  const result = rectifyPixels(gradient(), 100, 100, { ...full, mask: "ellipse" }, 100);
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[(50 * 100 + 50) * 4 + 3], 255);
  const portrait = rectifyPixels(gradient(), 100, 100, { ...full, aspect: 5 / 7 }, 700);
  assert.equal(portrait.width, 500); assert.equal(portrait.height, 700);
});
test("Crossed, concave, out-of-bounds, tiny and unbounded crops are rejected", () => {
  for (const quad of [
    [full.quad[0], full.quad[2], full.quad[1], full.quad[3]],
    [full.quad[0], full.quad[1], { x: 0.1, y: 0.1 }, full.quad[3]],
    full.quad.map((p) => ({ x: p.x / 1000, y: p.y / 1000 })),
    full.quad.map((p) => ({ ...p, x: p.x + 0.1 })),
  ]) assert.equal(cropRegionSchema.safeParse({ ...full, quad }).success, false);
  assert.throws(() => rectifyPixels(gradient(), 100, 100, full, 10000));
  assert.throws(() => rectifyPixels(new Uint8Array(3), 100, 100, full));
});
const url = "/images/products/woya/woya-01.webp";
const parts = { enabled: true, source: url, regions: defaultRegions(true), left: url, center: url, right: url };
test("Product schema persists complete crops; incomplete sets and arbitrary URLs fail", () => {
  const product = { ...initialProducts().find((p) => p.type === "set")!, builderParts: parts };
  assert.equal(productSchema.safeParse(product).success, true);
  assert.equal(builderPartsSchema.safeParse({ ...parts, right: undefined }).success, false);
  assert.equal(builderPartsSchema.safeParse({ ...parts, center: "http://localhost/private" }).success, false);
  assert.equal(productSchema.safeParse({ ...product, type: "tablo" }).success, true);
  assert.equal(productSchema.safeParse({ ...product, builderParts: { ...parts, enabled: false }, type: "tablo" }).success, true);
});
test("New product crops enter builder and quotes, while disabled and missing parts do not", () => {
  const model = { code: "custom-12345678", title: "Yeni set", slug: "yeni-set", productType: "set" as const, builderParts: parts };
  assert.equal(builderCatalog([model]).tables[0].parts?.left, url);
  const item = { slug: "ozel-set", quantity: 1, configuration: { source: "builder", kind: "set", left: model.code, right: model.code, clock: model.code, numeral: "original", dimensions: defaultDimensions(initialPricing, "rectangle"), pricingMode: "standard" } };
  const pricing = { ...initialPricing, builderSetPrice: 7500, panelRate: 2000, clockRate: 3000 };
  assert.equal(quoteItem(item, [model], pricing).price, 7500);
  assert.equal(quoteItem({ ...item, configuration: { ...item.configuration, pricingMode: "custom" } }, [model], pricing).price, 2480);
  assert.equal(quoteItem({ ...item, configuration: { ...item.configuration, numeral: "minimal" } }, [model], pricing).price, null);
  assert.equal(quoteItem(item, [{ ...model, builderParts: { ...parts, enabled: false } }], pricing).price, null);
  assert.equal(quoteItem(item, [], pricing).price, null);
  assert.equal(builderCatalog([{ ...model, builderParts: undefined }]).clocks.length, 0);
  assert.equal(builderCatalog([{ ...model, code: "01", builderParts: undefined }]).tables.length, 1);
  assert.equal(builderCatalog([{ ...model, code: "01", builderParts: { ...parts, enabled: false } }]).tables.length, 0);
});

// A decorative triptych contributes side panels, never a fake clock.
test("Decorative table panels mix with real clocks and remain valid at checkout", () => {
  const table = { code: "custom-table", title: "Üçlü tablo", slug: "uclu-tablo", productType: "tablo" as const, builderParts: parts };
  const clock = { code: "custom-clock", title: "Saat", slug: "saat", productType: "saat" as const, builderParts: { enabled: true, center: url } };
  const catalog = builderCatalog([table, clock]);
  assert.deepEqual(catalog.tables.map((p) => p.code), [table.code]);
  assert.deepEqual(catalog.clocks.map((p) => p.code), [clock.code]);
  const item = { slug: "ozel-set", quantity: 1, configuration: { source: "builder", kind: "set", left: table.code, right: table.code, clock: clock.code, numeral: "original", dimensions: defaultDimensions(initialPricing, "rectangle"), pricingMode: "standard" } };
  const settings = { ...initialPricing, builderSetPrice: 7500 };
  assert.equal(quoteItem(item, [table, clock], settings).price, 7500);
  assert.equal(quoteItem({ ...item, configuration: { ...item.configuration, clock: table.code } }, [table, clock], settings).price, null);
  assert.equal(quoteItem(item, [{ ...table, builderParts: { ...parts, enabled: false } }, clock], settings).price, null);
});
