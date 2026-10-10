import type { Category } from "./admin/schema";
import type { WoyaProduct } from "../app/data/products";

export function categoryHref(id: string) {
  return id === "uclu-setler"
    ? "/uclu-setler"
    : `/kategori/${encodeURIComponent(id)}`;
}

export function categoryGroups(
  categories: Category[],
  products: WoyaProduct[],
) {
  return categories
    .filter((c) => c.active)
    .sort((a, b) => a.position - b.position)
    .map((category) => ({
      category,
      products: products.filter(
        (p) => p.collection === category.id && p.productType !== "rehber",
      ),
    }))
    .filter((group) => group.products.length > 0);
}
