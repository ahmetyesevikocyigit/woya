import type { Configuration } from "./pricing";

export function cartKey(item: { slug: string; configuration?: Configuration }) {
  const c = item.configuration;
  if (!c) return item.slug;
  const d = c.dimensions;
  return JSON.stringify([
    item.slug,
    c.source,
    c.pricingMode ?? "legacy",
    d.panel.width,
    d.panel.height,
    d.clock.width,
    d.clock.height,
    ...(c.source === "builder"
      ? [c.kind, c.left ?? "", c.clock, c.right ?? "", c.numeral]
      : c.numeral
        ? [c.numeral]
        : []),
  ]);
}
