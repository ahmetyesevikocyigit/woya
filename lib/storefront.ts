import "server-only";
import { cache } from "react";
import { getStorefrontCatalog, readCatalog } from "./admin/repository";
import { clockShapeFor } from "./pricing";
import { woyaProducts, type WoyaProduct } from "../app/data/products";
import type { BuilderParts } from "./admin/schema";

function publicBuilderParts(parts?: BuilderParts) {
  if (!parts) return undefined;
  const { enabled, left, center, right } = parts;
  return { enabled, left, center, right };
}

function positivePrice(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function storefrontPrice(product: {
  price?: number | null;
  salePrice?: number | null;
  type?: "set" | "saat" | "tablo" | "rehber";
}) {
  if (product.type === "rehber") return { price: null, salePrice: null };
  const price = positivePrice(product.price);
  const salePrice = positivePrice(product.salePrice);
  return {
    price,
    salePrice:
      price !== null && salePrice !== null && salePrice < price
        ? salePrice
        : null,
  };
}

export const storefrontProducts = cache(async function storefrontProducts(
  surface?: "saatler" | "tablolar" | "koleksiyon",
) {
  const { products, categories } = await getStorefrontCatalog();
  return products
    .filter(
      (p) =>
        p.active &&
        categories.some(
          (c) =>
            c.id === p.categoryId &&
            c.active &&
            (!surface || c.surfaces.includes(surface)),
        ),
    )
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        (categories.find((c) => c.id === a.categoryId)?.position ?? 0) -
          (categories.find((c) => c.id === b.categoryId)?.position ?? 0) ||
        a.code.localeCompare(b.code, "tr", { numeric: true }),
    )
    .map((p): WoyaProduct => {
      const original = woyaProducts.find((o) => o.code === p.code);
      const category = categories.find((c) => c.id === p.categoryId)!;
      const price = storefrontPrice(p);
      return {
        code: p.code,
        title: p.title,
        text: p.description,
        slug: p.slug,
        image: p.images[0].url,
        alt: p.images[0].alt || p.title,
        collection: p.categoryId,
        collectionLabel: category.title,
        motif: original?.motif ?? "Dekoratif",
        tone: original?.tone ?? "",
        room: original?.room ?? "Yaşam alanları",
        lead: p.description,
        highlights: original?.highlights ?? [],
        details: [
          { label: "Ürün tipi", value: category.title },
          ...(original?.details.filter((d) => d.label !== "Ürün tipi") ?? []),
        ],
        images: p.images,
        shippingIncluded: p.shippingIncluded === true,
        price: price.price,
        salePrice: price.salePrice,
        productType: p.type,
        clockShape: clockShapeFor(p),
        builderParts: publicBuilderParts(p.builderParts),
      };
    });
});
export async function storefrontProduct(slug: string) {
  return (await storefrontProducts()).find((p) => p.slug === slug);
}

export async function storefrontQuoteData() {
  const { products, categories, pricing } = await readCatalog();
  const activeCategories = new Set(
    categories.filter((c) => c.active).map((c) => c.id),
  );
  return {
    products: products
      .filter((p) => p.active && activeCategories.has(p.categoryId))
      .map((p) => {
        const price = storefrontPrice(p);
        return {
          slug: p.slug,
          code: p.code,
          title: p.title,
          productType: p.type,
          clockShape: clockShapeFor(p),
          shippingIncluded: p.shippingIncluded === true,
          price: price.price,
          salePrice: price.salePrice,
          builderParts: publicBuilderParts(p.builderParts),
        };
      }),
    settings: pricing,
  };
}
