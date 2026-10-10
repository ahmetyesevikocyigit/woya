import type { Metadata } from "next";
import { getCategories } from "@/lib/admin/repository";
import { categoryHref } from "@/lib/catalog-categories";
import { CategoryPage } from "../../components/category-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const category = (await getCategories()).find((c) => c.id === id && c.active);
  return category
    ? {
        title: category.title,
        description:
          category.description ||
          `WOYA ${category.title} modellerini ve ölçü fiyatlarını keşfedin.`,
        alternates: { canonical: categoryHref(id) },
      }
    : {};
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return CategoryPage({ id: (await params).id });
}
