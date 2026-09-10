import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePrice,
  calculateSelectionPrice,
  defaultDimensions,
  configurationSchema,
  initialPricing,
  pricingSchema,
  type Configuration,
} from "../lib/pricing";
import { cartKey } from "../lib/cart-key";
import { quoteItem, type QuoteProduct } from "../lib/quote";

const settings = { ...initialPricing, panelRate: 2000, clockRate: 3000 };
const dimensions = defaultDimensions(settings, "rectangle");
const products: QuoteProduct[] = [
  { slug: "tablo", code: "t", title: "Tablo", productType: "tablo", stock: 5 },
  { slug: "set", code: "01", title: "Set", productType: "set", stock: 5 },
  {
    slug: "saat",
    code: "48",
    title: "Yuvarlak saat",
    productType: "saat",
    stock: 5,
  },
];
test("50 x 70 cm is 0.35 m²; linked panels are counted twice and clock added once", () => {
  assert.equal(
    calculatePrice("tablo", dimensions, "rectangle", settings).price,
    700,
  );
  const set = calculatePrice("set", dimensions, "rectangle", settings);
  assert.equal(set.panelArea, 0.7);
  assert.equal(set.panelPrice, 1400);
  assert.equal(set.clockPrice, 1080);
  assert.equal(set.price, 2480);
});
test("Custom sizes and circular clocks use geometric area and round only money", () => {
  assert.equal(
    calculatePrice(
      "tablo",
      { ...dimensions, panel: { width: 53.5, height: 72.2 } },
      "rectangle",
      settings,
    ).price,
    772.54,
  );
  assert.equal(
    calculatePrice("saat", dimensions, "circle", settings).price,
    848.23,
  );
  assert.equal(
    calculatePrice("set", dimensions, "circle", settings).price,
    2248.23,
  );
});
test("Missing rates never produce invented prices; unused rate is not required", () => {
  assert.equal(
    calculatePrice("set", dimensions, "rectangle", initialPricing).price,
    null,
  );
  assert.equal(
    calculatePrice("saat", dimensions, "rectangle", {
      ...settings,
      panelRate: null,
    }).price,
    1080,
  );
  assert.equal(
    calculatePrice("tablo", dimensions, "rectangle", {
      ...settings,
      clockRate: null,
    }).price,
    700,
  );
});
test("Dimensions reject empty, zero, negative, oversized, excessive precision and nonfinite input", () => {
  for (const width of [0, -2, 9.9, 201, 5000, NaN, Infinity, 50.123])
    assert.equal(
      calculatePrice(
        "set",
        { ...dimensions, panel: { width, height: 70 } },
        "rectangle",
        settings,
      ).price,
      null,
    );
  assert.equal(
    calculatePrice(
      "saat",
      { ...dimensions, clock: { width: 60, height: 70 } },
      "circle",
      settings,
    ).price,
    null,
  );
  assert.equal(
    calculatePrice(
      "tablo",
      { ...dimensions, panel: { width: 10, height: 200 } },
      "rectangle",
      settings,
    ).price,
    400,
  );
});
test("Admin settings reject bad rates, reversed limits, duplicates and presets beyond limits", () => {
  assert.equal(pricingSchema.safeParse(initialPricing).success, true);
  for (const patch of [
    { panelRate: -1 },
    { clockRate: 0 },
    { panelRate: 0.001 },
    { minCm: 300 },
    { maxCm: 40 },
    { panelPresets: [] },
    { diameterPresets: [60, 60] },
    {
      clockPresets: [
        { width: 60, height: 60 },
        { width: 60, height: 60 },
      ],
    },
  ])
    assert.equal(
      pricingSchema.safeParse({ ...settings, ...patch }).success,
      false,
    );
});
test("Configuration has one shared panel size, never independently priced right and left sizes", () => {
  assert.equal(
    configurationSchema.safeParse({
      source: "product",
      dimensions: { ...dimensions, right: { width: 5, height: 5 } },
    }).success,
    false,
  );
  assert.equal(
    configurationSchema.safeParse({ source: "product", dimensions, price: 1 })
      .success,
    false,
  );
});
test("Cart identity keeps different sizes and different builder parts separate", () => {
  const item = {
    slug: "tablo",
    configuration: { source: "product", dimensions } as Configuration,
  };
  assert.equal(cartKey(item), cartKey(structuredClone(item)));
  assert.notEqual(
    cartKey(item),
    cartKey({
      ...item,
      configuration: {
        source: "product",
        dimensions: { ...dimensions, panel: { width: 60, height: 90 } },
      },
    }),
  );
  const builder = {
    slug: "ozel-set",
    configuration: {
      source: "builder",
      kind: "set",
      left: "01",
      right: "01",
      clock: "48",
      numeral: "romen",
      dimensions,
    } as Configuration,
  };
  assert.notEqual(
    cartKey(builder),
    cartKey({
      ...builder,
      configuration: {
        ...builder.configuration,
        source: "builder",
        kind: "set",
        clock: "48",
        numeral: "normal",
      },
    }),
  );
  assert.equal(cartKey({ slug: "old-cart-item" }), "old-cart-item");
});
test("Custom server quote uses current rates and canonical product type, not client price or labels", () => {
  const item = {
    slug: "tablo",
    configuration: { source: "product", dimensions, pricingMode: "custom" },
    quantity: 1,
    price: 1,
  };
  assert.equal(quoteItem(item, products, settings).price, 700);
  assert.equal(
    quoteItem(item, products, { ...settings, panelRate: 4000 }).price,
    1400,
  );
  assert.equal(
    quoteItem({ ...item, slug: "set" }, products, settings).price,
    2480,
  );
  assert.equal(
    quoteItem({ ...item, slug: "gone" }, products, settings).price,
    null,
  );
  assert.equal(
    quoteItem({ ...item, quantity: 6 }, products, settings).price,
    700,
  );
  assert.equal(
    quoteItem({ ...item, quantity: -1 }, products, settings).price,
    null,
  );
  assert.equal(
    quoteItem({ ...item, configuration: undefined }, products, settings).price,
    null,
  );
});
test("Builder quote validates available sources, clock shape, quantities and set identity", () => {
  const config = {
    source: "builder",
    pricingMode: "custom",
    kind: "set",
    left: "01",
    right: "01",
    clock: "48",
    numeral: "romen",
    dimensions,
  };
  const item = { slug: "ozel-set", configuration: config, quantity: 1 };
  const quote = quoteItem(item, products, settings);
  assert.equal(quote.price, 2248.23);
  assert(quote.options.includes("İki tablo (her biri): 50 × 70 cm"));
  for (const configuration of [
    { ...config, left: "missing" },
    { ...config, clock: "t" },
    { ...config, kind: "saat" },
    { ...config, right: undefined },
  ])
    assert.equal(
      quoteItem({ ...item, configuration }, products, settings).price,
      null,
    );
  assert.equal(
    quoteItem(
      item,
      products.filter((p) => p.code !== "48"),
      settings,
    ).price,
    null,
  );
  assert.equal(
    quoteItem(
      item,
      products.map((p) => ({ ...p, stock: 0 })),
      settings,
    ).price,
    2248.23,
  );
});
test("Legacy inventory does not block published products; missing products and invalid quantities still fail", () => {
  const item = {
    slug: "tablo",
    quantity: 99,
    configuration: { source: "product", dimensions, pricingMode: "custom" },
  };
  assert.equal(
    quoteItem(
      item,
      products.map((p) => ({ ...p, stock: 0 })),
      settings,
    ).price,
    700,
  );
  assert.equal(quoteItem(item, [], settings).price, null);
  assert.equal(
    quoteItem({ ...item, quantity: 100 }, products, settings).price,
    null,
  );
});

test("Standard products use seller prices and discounts, without any m² rates", () => {
  for (const kind of ["tablo", "saat", "set"] as const) {
    for (const shape of ["rectangle", "circle"] as const) {
      assert.equal(
        calculateSelectionPrice(
          kind,
          dimensions,
          shape,
          initialPricing,
          { price: 1500 },
          "standard",
        ).price,
        1500,
      );
      assert.equal(
        calculateSelectionPrice(
          kind,
          dimensions,
          shape,
          settings,
          { price: 1500, salePrice: 1250 },
          "standard",
        ).price,
        1250,
      );
    }
  }
  assert.equal(
    calculateSelectionPrice(
      "set",
      dimensions,
      "rectangle",
      settings,
      { price: null },
      "standard",
    ).price,
    null,
  );
  assert.equal(
    calculateSelectionPrice(
      "set",
      dimensions,
      "rectangle",
      initialPricing,
      { price: 1500 },
      "custom",
    ).price,
    null,
  );
});

test("Choosing custom at preset dimensions changes pricing and cart identity", () => {
  const product = { price: 5000, salePrice: 4500 };
  assert.equal(
    calculateSelectionPrice(
      "set",
      dimensions,
      "rectangle",
      settings,
      product,
      "standard",
    ).price,
    4500,
  );
  assert.equal(
    calculateSelectionPrice(
      "set",
      dimensions,
      "rectangle",
      settings,
      product,
      "custom",
    ).price,
    2480,
  );
  const item = {
    slug: "set",
    configuration: {
      source: "product",
      dimensions,
      pricingMode: "standard",
    } as Configuration,
  };
  assert.notEqual(
    cartKey(item),
    cartKey({
      ...item,
      configuration: { ...item.configuration, pricingMode: "custom" },
    }),
  );
});

test("Server rejects forged standard sizes and infers old cart selections safely", () => {
  const catalog = products.map((p) => ({ ...p, price: 5000, salePrice: 4500 }));
  const item = {
    slug: "set",
    quantity: 1,
    configuration: { source: "product", dimensions, pricingMode: "standard" },
  };
  assert.equal(quoteItem(item, catalog, initialPricing).price, 4500);
  assert.equal(
    quoteItem(
      item,
      catalog.map((p) => ({ ...p, salePrice: 4250 })),
      settings,
    ).price,
    4250,
  );
  const customDimensions = {
    ...dimensions,
    panel: { width: 53.5, height: 72.2 },
  };
  assert.equal(
    quoteItem(
      {
        ...item,
        configuration: { ...item.configuration, dimensions: customDimensions },
      },
      catalog,
      settings,
    ).price,
    null,
  );
  assert.equal(
    quoteItem(
      {
        ...item,
        configuration: { source: "product", dimensions: customDimensions },
      },
      catalog,
      settings,
    ).price,
    2625.08,
  );
  assert.equal(
    quoteItem(
      { ...item, configuration: { source: "product", dimensions } },
      catalog,
      settings,
    ).price,
    4500,
  );
});

test("Standard builder prices are explicit admin values, never inferred from m² or whole set parts", () => {
  const configuration = {
    source: "builder",
    kind: "set",
    left: "01",
    right: "01",
    clock: "48",
    numeral: "romen",
    dimensions,
    pricingMode: "standard",
  };
  const item = { slug: "ozel-set", quantity: 1, configuration };
  assert.equal(quoteItem(item, products, settings).price, null);
  assert.equal(
    quoteItem(item, products, { ...initialPricing, builderSetPrice: 8500 })
      .price,
    8500,
  );
  assert.equal(
    quoteItem(
      {
        ...item,
        slug: "ozel-saat",
        configuration: { ...configuration, kind: "saat" },
      },
      products,
      { ...initialPricing, builderClockPrice: 3800 },
    ).price,
    3800,
  );
  assert.equal(
    pricingSchema.safeParse({ ...settings, builderSetPrice: -1 }).success,
    false,
  );
  const { builderSetPrice, builderClockPrice, ...legacy } = initialPricing;
  assert.equal(pricingSchema.parse(legacy).builderSetPrice, null);
});

test("Shipping inclusion comes from catalogue products, including all selected builder parts", () => {
  const eligible = products.map((p) => ({
    ...p,
    price: 700,
    shippingIncluded: true,
  }));
  const item = {
    slug: "set",
    quantity: 1,
    configuration: { source: "product", dimensions, pricingMode: "standard" },
  };
  assert.equal(quoteItem(item, eligible, settings).shippingIncluded, true);
  assert.ok(
    quoteItem(item, eligible, settings).options.includes("Kargo dahil"),
  );
  const forged = { ...item, shippingIncluded: true };
  assert.equal(quoteItem(forged, products, settings).shippingIncluded, false);
  const builder = {
    slug: "ozel-set",
    quantity: 1,
    configuration: {
      source: "builder",
      kind: "set",
      left: "01",
      right: "01",
      clock: "48",
      numeral: "romen",
      dimensions,
      pricingMode: "custom",
    },
  };
  const included = quoteItem(builder, eligible, settings);
  assert.notEqual(included.price, null);
  assert.equal(included.shippingIncluded, true);
  assert.equal(
    quoteItem(
      builder,
      eligible.map((p) =>
        p.code === "01" ? { ...p, shippingIncluded: false } : p,
      ),
      settings,
    ).shippingIncluded,
    false,
  );
});
