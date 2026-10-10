import type { MetadataRoute } from "next";
import { getCategories } from "@/lib/admin/repository";
import { categoryGroups, categoryHref } from "@/lib/catalog-categories";
import { storefrontProducts } from "@/lib/storefront";
import { legalHref, legalPages, legalUpdatedAt } from "@/lib/legal";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://woyatablo.com";
const staticPages = [
  "/urunler",
  "/koleksiyon",
  "/saatler",
  "/tablolar",
  "/hakkimizda",
  "/iletisim",
  "/sepet",
  "/sss",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const woyaProducts = await storefrontProducts();
  const lastModified = new Date("2026-09-04");

  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...staticPages.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.78,
    })),
    ...categoryGroups(await getCategories(), woyaProducts).map(
      ({ category }) => ({
        url: `${siteUrl}${categoryHref(category.id)}`,
        changeFrequency: "weekly" as const,
        priority: 0.78,
      }),
    ),
    ...legalPages.map((page) => ({
      url: `${siteUrl}${legalHref(page.slug)}`,
      lastModified: new Date(legalUpdatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
    ...woyaProducts.map((product) => ({
      url: `${siteUrl}/urunler/${product.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.72,
    })),
  ];
}
